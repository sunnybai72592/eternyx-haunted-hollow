import gzip
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location("drivers",pathlib.Path(__file__).resolve().parents[1]/"scripts/labs-authenticated-kernel-drivers.py")
d=importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

def fixture(value="y"):
    return ("\n".join(k+"="+value for k in d.REQUIRED)+"\n").encode()

class DriverAuditTest(unittest.TestCase):
    def test_builtin_profile_never_claims_live(self):
        result=d.classify(d.parse_config(fixture()),"fixture","a"*64)
        self.assertTrue(result["requiredBuiltInDriversPresent"])
        self.assertFalse(result["moduleSupportRequired"])
        for key in ("guestBootVerified","guestVsockVerified","hardwareAcceptanceVerified",
                    "providerActivationAllowed","productionReleaseReady"):
            self.assertFalse(result[key])

    def test_modules_not_builtin(self):
        result=d.classify(d.parse_config(fixture().replace(b"CONFIG_VIRTIO_BLK=y",b"CONFIG_VIRTIO_BLK=m")),"fixture","a"*64)
        self.assertFalse(result["requiredBuiltInDriversPresent"])
        self.assertTrue(result["moduleSupportRequired"])

    def test_disabled_and_unknown_distinct(self):
        data=fixture().replace(b"CONFIG_EXT4_FS=y",b"# CONFIG_EXT4_FS is not set").replace(b"CONFIG_VSOCKETS=y\n",b"")
        config=d.parse_config(data)
        self.assertEqual(config["CONFIG_EXT4_FS"],"n")
        self.assertEqual(config["CONFIG_VSOCKETS"],"unknown")
        self.assertFalse(d.classify(config,"fixture","a"*64)["requiredBuiltInDriversPresent"])

    def test_duplicate_or_invalid_config_rejected(self):
        for data in (fixture()+b"CONFIG_BLOCK=y\n",fixture().replace(b"CONFIG_BLOCK=y",b"CONFIG_BLOCK=garbage"),b"unrelated"):
            with self.assertRaises(RuntimeError):
                d.parse_config(data)

    def test_embedded_config_bounded(self):
        data=fixture()
        self.assertEqual(d.embedded_config(b"headerIKCFG_ST"+gzip.compress(data)+b"IKCFG_EDtail"),data)
        self.assertIsNone(d.embedded_config(b"no config"))
        with self.assertRaises(RuntimeError):
            d.embedded_config(b"IKCFG_ST"+gzip.compress(data))

    def test_exact_tar_member_only(self):
        with tempfile.TemporaryDirectory() as directory:
            tar=pathlib.Path(directory)/"data.tar"
            for kind in ("good","duplicate","link","missing"):
                with tarfile.open(tar,"w") as archive:
                    for i in range(2 if kind=="duplicate" else 1):
                        item=tarfile.TarInfo("./boot/config-test" if kind!="missing" else "boot/config-other")
                        if kind=="link":
                            item.type=tarfile.SYMTYPE
                            item.linkname="/etc/passwd"
                            archive.addfile(item)
                        else:
                            item.size=len(fixture())
                            archive.addfile(item,io.BytesIO(fixture()))
                if kind=="good":
                    self.assertEqual(d.read_member(tar,"boot/config-test",d.MAX_CONFIG),fixture())
                elif kind=="missing":
                    self.assertIsNone(d.read_member(tar,"boot/config-test",d.MAX_CONFIG))
                else:
                    with self.assertRaises(RuntimeError):
                        d.read_member(tar,"boot/config-test",d.MAX_CONFIG)

    def test_modules_size_policy_separate_from_kernel_image(self):
        package="linux-modules-"+d.p.GUEST_RELEASE
        version=d.p.GUEST_VERSION
        def metadata(size):
            return (f"Package: {package}\nVersion: {version}\nArchitecture: amd64\n"
                    f"Filename: pool/main/l/linux/pkg_1~24.04_amd64.deb\n"
                    f"SHA256: {'a'*64}\nSize: {size}\n")
        size=d.p.MAX_PACKAGE+1
        with self.assertRaisesRegex(RuntimeError,"archive package size"):
            d.p.metadata_pin(metadata(size),package,version)
        self.assertEqual(d.p.metadata_pin(metadata(size),package,version,
            max_bytes=d.MAX_MODULES_PACKAGE),("a"*64,size))
        for n in (0,d.MAX_MODULES_PACKAGE+1):
            with self.assertRaisesRegex(RuntimeError,"archive package size"):
                d.p.metadata_pin(metadata(n),package,version,max_bytes=d.MAX_MODULES_PACKAGE)

    def test_modules_identity_cannot_be_replaced(self):
        with patch.object(d.p,"command") as command:
            with self.assertRaisesRegex(RuntimeError,"exact immutable"):
                d.module_package_config("other",d.p.GUEST_VERSION,{},None)
            command.assert_not_called()

    def test_modules_file_limits_are_explicit(self):
        with patch.object(d.resource,"setrlimit") as setter:
            d.limit_file(d.MAX_MODULES_PACKAGE)
            setter.assert_called_once_with(d.resource.RLIMIT_FSIZE,
                (d.MAX_MODULES_PACKAGE,d.MAX_MODULES_PACKAGE))
        self.assertEqual(d.p.MAX_PACKAGE,128*1024*1024)
        self.assertEqual(d.p.MAX_TAR,256*1024*1024)
        self.assertEqual(d.MAX_MODULES_TAR,2*1024*1024*1024)

    def test_modules_insufficient_disk_stops_before_download(self):
        from types import SimpleNamespace
        with patch.object(d.p,"command",return_value="metadata"), \
             patch.object(d.p,"metadata_pin",return_value=("a"*64,d.p.MAX_PACKAGE+1)) as pin, \
             patch.object(d.shutil,"disk_usage",return_value=SimpleNamespace(free=0)), \
             patch.object(d.subprocess,"run") as run:
            with self.assertRaisesRegex(RuntimeError,"workspace capacity"):
                d.module_package_config(d.p.GUEST_RELEASE,d.p.GUEST_VERSION,{},pathlib.Path("/tmp"))
            self.assertEqual(pin.call_args.kwargs,{"max_bytes":d.MAX_MODULES_PACKAGE})
            run.assert_not_called()

    def test_kernel_mismatch_blocks_audit_before_metadata(self):
        with patch.object(d,"read_member",return_value=b"wrong"),patch.object(d.p,"command") as command:
            with self.assertRaisesRegex(RuntimeError,"pin mismatch"):
                d.audit(None,d.p.GUEST_RELEASE,d.p.GUEST_VERSION,{},None)
            command.assert_not_called()

if __name__=="__main__":
    unittest.main()
