import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location("plan",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-authenticated-module-plan.py")
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def report(**overrides):
    return {"requiredDrivers":{**dict.fromkeys(m.d.REQUIRED,"y"),**overrides},
            "optionalFeatures":{"CONFIG_MODULES":"y","CONFIG_BLK_DEV_INITRD":"y"}}

class ModulePlanTest(unittest.TestCase):
    def test_builtin_profile(self):
        self.assertEqual(m.module_targets(report()),("built-in-only",[]))
    def test_modular_and_blocked_profiles(self):
        self.assertEqual(m.module_targets(report(CONFIG_EXT4_FS="m",CONFIG_VSOCKETS="m")),
            ("authenticated-module-plan",["ext4","vsock"]))
        for value in ("n","unknown"):
            self.assertEqual(m.module_targets(report(CONFIG_EXT4_FS=value)),
                ("blocked-unavailable-driver",[]))
        r=report(CONFIG_EXT4_FS="m")
        r["optionalFeatures"]["CONFIG_BLK_DEV_INITRD"]="n"
        self.assertEqual(m.module_targets(r),("blocked-module-initrd-support",[]))
    def test_dependency_first_and_builtin_deduplication(self):
        graph={"ext4":["jbd2","crc32c"],"jbd2":["crc32c"],"vsock":["crc32c"]}
        order=m.resolve(["ext4","vsock"],lambda n:{"name":n,"depends":graph[n]},{"crc32c"})
        self.assertEqual([x["name"] for x in order],["jbd2","ext4","vsock"])
    def test_cycle_and_bound_refused(self):
        with self.assertRaisesRegex(RuntimeError,"cycle"):
            m.resolve(["a"],lambda n:{"depends":["a"]},set())
        with self.assertRaisesRegex(RuntimeError,"count"):
            m.resolve(["m0"],lambda n:{"depends":["m"+str(int(n[1:])+1)]},set())
    def test_module_path_identity(self):
        self.assertEqual(m.module_name("kernel/fs/ext4/ext4.ko.zst"),"ext4")
        self.assertEqual(m.module_name("kernel/a-b.ko.xz"),"a_b")
        self.assertIsNone(m.module_name("kernel/evil.so"))
        with self.assertRaises(RuntimeError):
            m.normalize("../evil")
    def test_archive_index_exact_release_and_builtin(self):
        with tempfile.TemporaryDirectory() as directory:
            tar=pathlib.Path(directory)/"modules.tar"
            with tarfile.open(tar,"w") as a:
                for name,data in (("usr/lib/modules/test/kernel/fs/ext4/ext4.ko.zst",b"fixture"),
                                  ("lib/modules/other/kernel/fs/ext4/ext4.ko",b"other"),
                                  ("usr/lib/modules/test/modules.builtin",b"kernel/lib/crc32c.ko\n")):
                    member=tarfile.TarInfo(name)
                    member.size=len(data)
                    a.addfile(member,io.BytesIO(data))
            with tarfile.open(tar,"r:") as a:
                index,builtins=m.index_archive(a,"test")
            self.assertEqual(set(index),{"ext4"})
            self.assertEqual(builtins,{"crc32c"})
    def test_ambiguous_or_symlink_module_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            tar=pathlib.Path(directory)/"modules.tar"
            for kind in ("duplicate","symlink","traversal"):
                with tarfile.open(tar,"w") as a:
                    for i in range(2 if kind=="duplicate" else 1):
                        name="lib/modules/test/kernel/"+("../" if kind=="traversal" else str(i)+"/")+"ext4.ko"
                        member=tarfile.TarInfo(name)
                        if kind=="symlink":
                            member.type=tarfile.SYMTYPE
                            member.linkname="/etc/passwd"
                            a.addfile(member)
                        else:
                            member.size=1
                            a.addfile(member,io.BytesIO(b"x"))
                with tarfile.open(tar,"r:") as a, self.assertRaises(RuntimeError):
                    m.index_archive(a,"test")

if __name__=="__main__":
    unittest.main()
