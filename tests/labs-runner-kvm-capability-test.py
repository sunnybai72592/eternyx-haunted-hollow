import errno
import importlib.util
import os
import pathlib
import stat
import types
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("probe", pathlib.Path(__file__).resolve().parents[1] / "scripts/labs-runner-kvm-capability.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

def entry(mode=stat.S_IFCHR, inode=1):
    return types.SimpleNamespace(st_mode=mode, st_dev=1, st_ino=inode, st_rdev=2)

class CapabilityTest(unittest.TestCase):
    def run_case(self, expected, **overrides):
        args = dict(stat_path=Mock(return_value=entry()), open_device=Mock(return_value=7),
                    stat_fd=Mock(return_value=entry()), ioctl=Mock(return_value=12),
                    close_device=Mock())
        args.update(overrides)
        self.assertEqual(probe.inspect_kvm(**args), expected)
        return args

    def test_api_only(self):
        a = self.run_case("api_version_12")
        a["open_device"].assert_called_once_with("/dev/kvm", os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
        a["ioctl"].assert_called_once_with(7, 0xAE00, 0)
        a["close_device"].assert_called_once_with(7)

    def test_missing(self):
        a = self.run_case("device_missing", stat_path=Mock(side_effect=FileNotFoundError()))
        a["open_device"].assert_not_called()

    def test_symlink(self):
        a = self.run_case("not_character_device", stat_path=Mock(return_value=entry(stat.S_IFLNK)))
        a["open_device"].assert_not_called()

    def test_denied(self):
        a = self.run_case("access_denied", open_device=Mock(side_effect=PermissionError(errno.EACCES, "denied")))
        a["ioctl"].assert_not_called()
        a["close_device"].assert_not_called()

    def test_identity_mismatch(self):
        a = self.run_case("device_identity_mismatch", stat_fd=Mock(return_value=entry(inode=2)))
        a["ioctl"].assert_not_called()
        a["close_device"].assert_called_once_with(7)

    def test_unexpected_api(self):
        a = self.run_case("unexpected_api_version", ioctl=Mock(return_value=13))
        a["close_device"].assert_called_once_with(7)

    def test_ioctl_failure(self):
        a = self.run_case("api_probe_failed", ioctl=Mock(side_effect=OSError(errno.ENOTTY, "not supported")))
        a["close_device"].assert_called_once_with(7)

if __name__ == "__main__":
    unittest.main()
