import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("jailed", pathlib.Path(__file__).resolve().parents[1] / "scripts/labs-runner-firecracker-jailed.py")
j = importlib.util.module_from_spec(spec)
spec.loader.exec_module(j)

class JailedTest(unittest.TestCase):
    def good(self):
        return {"Uid": "65534 65534 65534 65534", "Gid": "65534 65534 65534 65534",
                "CapEff": "0000", "CapPrm": "0000", "Seccomp": "2",
                "NoNewPrivs": "1", "NSpid": "222 1"}

    def test_good_status(self):
        j.verify_status(self.good())

    def test_reject_weaker_status(self):
        for key, value in {"Uid": "0 0 0 0", "Gid": "0 0 0 0", "CapEff": "1",
                           "CapPrm": "1", "Seccomp": "0", "NoNewPrivs": "0",
                           "NSpid": "222"}.items():
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                j.verify_status({**self.good(), key: value})

    def test_fixed_diskless_config(self):
        c = j.jailed_config()
        self.assertEqual(c["drives"], [])
        self.assertEqual(c["network-interfaces"], [])
        self.assertEqual(c["boot-source"]["kernel_image_path"], "/kernel")
        self.assertEqual(c["boot-source"]["initrd_path"], "/initramfs.cpio")
        self.assertEqual(c["machine-config"]["mem_size_mib"], 256)

    def test_command_enforces_jailer_boundary(self):
        cmd = j.invocation(pathlib.Path("/run/fixed"), pathlib.Path("/sys/fs/cgroup/fixed"),
                           "fixed", pathlib.Path("/run/netns/fixed"))
        self.assertEqual(cmd[0], "/run/fixed/jailer")
        self.assertIn("--new-pid-ns", cmd)
        self.assertEqual(cmd[cmd.index("--uid")+1], "65534")
        self.assertEqual(cmd[cmd.index("--parent-cgroup")+1], "fixed")
        self.assertEqual(cmd[-4:], ["--", "--no-api", "--config-file", "/config.json"])
        self.assertNotIn("--daemonize", cmd)

    def test_exact_marker_and_bounded_log(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / "log"
            p.write_bytes(b"prefix " + j.MARKER + b"\n")
            self.assertFalse(j.marker_in(p))
            p.write_bytes(j.MARKER + b"\n")
            self.assertTrue(j.marker_in(p))
            p.write_bytes(b"x" * (4*1024*1024+1))
            with self.assertRaises(RuntimeError):
                j.marker_in(p)

if __name__ == "__main__":
    unittest.main()
