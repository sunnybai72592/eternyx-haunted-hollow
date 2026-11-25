import importlib.util
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("bundle",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-prepare-authenticated-guest.py")
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

def fixture(mode="built-in-only"):
    drivers={"configurationSha256":"a"*64,"requiredBuiltInDriversPresent":mode=="built-in-only",
             "optionalFeatures":{"CONFIG_VIRTIO_MMIO_CMDLINE_DEVICES":"y","CONFIG_DEVTMPFS":"y"}}
    plan={"kernelSha256":g.p.PIN,"configurationSha256":"a"*64,"mode":mode,
          "hardDependencyPlanAvailable":True,"additionalFirmwareOrSoftDependencyReviewRequired":False,
          "dependencyFirstModules":[] if mode=="built-in-only" else [{"name":"ext4"}]}
    return drivers,plan

class BundleTest(unittest.TestCase):
    def test_direct_and_modular_profiles(self):
        for mode in ("built-in-only","authenticated-module-plan"):
            self.assertEqual(g.choose_profile(*fixture(mode))[0],mode)

    def test_blocked_and_unbound_profiles(self):
        for key,value in (("mode","blocked-unavailable-driver"),("kernelSha256","bad"),
                          ("configurationSha256","bad"),("hardDependencyPlanAvailable",False),
                          ("additionalFirmwareOrSoftDependencyReviewRequired",True)):
            drivers,plan=fixture()
            plan[key]=value
            with self.assertRaises(RuntimeError):
                g.choose_profile(drivers,plan)

    def test_mmio_and_devtmpfs_requirements(self):
        for key in ("CONFIG_VIRTIO_MMIO_CMDLINE_DEVICES","CONFIG_DEVTMPFS"):
            drivers,plan=fixture("authenticated-module-plan")
            drivers["optionalFeatures"][key]="m"
            with self.assertRaises(RuntimeError):
                g.choose_profile(drivers,plan)

    def test_cpio_contains_fixed_numbered_modules(self):
        image=g.make_initramfs(b"\x7fELFinit",[b"\x7fELFa",b"\x7fELFb"])
        self.assertIn(b"modules/000.ko\0",image)
        self.assertIn(b"modules/001.ko\0",image)
        self.assertIn(b"dev/console\0",image)
        self.assertIn(b"TRAILER!!!\0",image)
        self.assertLess(image.index(b"modules/000.ko"),image.index(b"modules/001.ko"))

    def test_invalid_initrd_rejected(self):
        for init,modules in ((b"bad",[b"\x7fELF"]), (b"\x7fELF",[]),
                             (b"\x7fELF",[b"bad"]), (b"\x7fELF",[b"\x7fELF"]*65)):
            with self.assertRaises(RuntimeError):
                g.make_initramfs(init,modules)

    def test_uncompressed_module_bytes_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            source=work/"fixture.ko"
            source.write_bytes(b"\x7fELFfixture")
            output=work/"output.ko"
            self.assertEqual(g.unpack_module(source,output),source.read_bytes())
            with self.assertRaises(FileExistsError):
                g.unpack_module(source,output)

    def test_real_static_bootstrap_compiles_and_refuses_host_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            init=pathlib.Path(directory)/"init"
            g.b.command("/usr/bin/cc","-static","-Os","-Wall","-Wextra","-Werror",
                        "-DMODULE_COUNT=2",str(g.SOURCE),"-o",str(init))
            self.assertNotIn(b"INTERP",g.b.command("/usr/bin/readelf","-l",str(init)))
            self.assertEqual(subprocess.run([str(init)],timeout=5).returncode,1)

    def test_nonempty_output_refused_before_archive_work(self):
        with tempfile.TemporaryDirectory() as directory:
            work=pathlib.Path(directory)
            (work/"foreign").touch()
            with patch.object(g.p,"main") as main:
                with self.assertRaises(RuntimeError):
                    g.prepare(work)
                main.assert_not_called()

if __name__=="__main__":
    unittest.main()
