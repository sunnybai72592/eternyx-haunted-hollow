import importlib.util
import pathlib
import os
import stat
from types import SimpleNamespace
from unittest.mock import patch
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

    def test_exec_directory_rejects_noexec(self):
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=0)
        with patch.object(pathlib.Path, "lstat", return_value=info), \
             patch.object(j.os, "statvfs", return_value=SimpleNamespace(f_flag=os.ST_NOEXEC)):
            with self.assertRaisesRegex(RuntimeError, "noexec"):
                j.verify_exec_directory(pathlib.Path("/var/lib/fixed"))

    def test_exec_directory_rejects_untrusted_ancestors(self):
        for info in (SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=0),
                     SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=1000),
                     SimpleNamespace(st_mode=stat.S_IFLNK | 0o777, st_uid=0)):
            with patch.object(pathlib.Path, "lstat", return_value=info):
                with self.assertRaisesRegex(RuntimeError, "untrusted"):
                    j.verify_exec_directory(pathlib.Path("/var/lib/fixed"))

    def test_exec_directory_accepts_trusted_executable_mount(self):
        info = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        with patch.object(pathlib.Path, "lstat", return_value=info), \
             patch.object(j.os, "statvfs", return_value=SimpleNamespace(f_flag=0)):
            j.verify_exec_directory(pathlib.Path("/var/lib/fixed"))

    def test_release_preflight_rejects_denied_exec(self):
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o500, st_uid=0)
        with patch.object(pathlib.Path, "lstat", return_value=info), \
             patch.object(j.os, "statvfs", return_value=SimpleNamespace(f_flag=0)), \
             patch.object(j.subprocess, "run", side_effect=PermissionError("denied")):
            with self.assertRaisesRegex(RuntimeError, "no policy bypass"):
                j.verify_release_executable(pathlib.Path("/var/lib/fixed/jailer"))

    def test_release_preflight_rejects_wrong_version(self):
        info = SimpleNamespace(st_mode=stat.S_IFREG | 0o500, st_uid=0)
        with patch.object(pathlib.Path, "lstat", return_value=info), \
             patch.object(j.os, "statvfs", return_value=SimpleNamespace(f_flag=0)), \
             patch.object(j.subprocess, "run", return_value=SimpleNamespace(stdout=b"Jailer v0.0.0\n")):
            with self.assertRaisesRegex(RuntimeError, "unexpected release version"):
                j.verify_release_executable(pathlib.Path("/var/lib/fixed/jailer"))

    def test_required_kernel_pin_rejects_drift_before_boot(self):
        with tempfile.TemporaryDirectory() as d:
            kernel=pathlib.Path(d)/"kernel"
            kernel.write_bytes(b"test kernel")
            actual=j.boot.digest(kernel)
            self.assertEqual(j.enforce_kernel_pin(kernel,False),actual)
            with self.assertRaisesRegex(RuntimeError,"immutable"):
                j.enforce_kernel_pin(kernel,True)
            with patch.object(j,"OBSERVED_KERNEL",actual):
                self.assertEqual(j.enforce_kernel_pin(kernel,True),actual)

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
