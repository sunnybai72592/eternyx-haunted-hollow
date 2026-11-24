import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("boot", pathlib.Path(__file__).resolve().parents[1] / "scripts/labs-runner-firecracker-boot.py")
boot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boot)

class BootTest(unittest.TestCase):
    def test_digest_rejects_before_extraction(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d)
            (p / "release.tgz").write_bytes(b"fake")
            with self.assertRaises(ValueError):
                boot.extract_pinned(p / "release.tgz", p)
            self.assertFalse((p / "firecracker").exists())

    def test_fixed_init_archive(self):
        archive = boot.initramfs(b"\x7fELFfixed")
        pos = 0
        names = []
        while pos < len(archive):
            self.assertEqual(archive[pos:pos+6], b"070701")
            fields = [int(archive[pos+6+i*8:pos+14+i*8], 16) for i in range(13)]
            start = pos+110
            names.append(archive[start:start+fields[11]-1].decode())
            start = (start+fields[11]+3)//4*4
            pos = (start+fields[6]+3)//4*4
        self.assertEqual(names, ["dev", "dev/console", "init", "TRAILER!!!"])
        self.assertEqual(pos, len(archive))

    def test_invalid_init(self):
        with self.assertRaises(ValueError):
            boot.initramfs(b"shell script")

    def test_no_external_devices(self):
        c = boot.config(pathlib.Path("/tmp/fixed"))
        self.assertEqual(set(c), {"boot-source", "machine-config", "drives", "network-interfaces"})
        self.assertEqual(c["drives"], [])
        self.assertEqual(c["network-interfaces"], [])
        self.assertEqual(c["machine-config"]["vcpu_count"], 1)
        self.assertEqual(c["machine-config"]["mem_size_mib"], 256)

    def test_log_requires_exact_line(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d)
            (p / "boot.log").write_bytes(b"prefix "+boot.MARKER+b"\n")
            with self.assertRaises(ValueError):
                boot.verify_log(p)

if __name__ == "__main__":
    unittest.main()
