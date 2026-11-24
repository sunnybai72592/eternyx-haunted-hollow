import errno
import importlib.util
import os
import pathlib
import stat
import types
import unittest
from unittest.mock import Mock, patch, call

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

    def test_privileged_probe_never_grants_release(self):
        with patch.object(probe.os, "geteuid", return_value=0), patch.object(probe, "inspect_kvm", return_value="api_version_12"):
            result = probe.report()
        self.assertTrue(result["effectiveRoot"])
        self.assertTrue(result["kvmApiAvailable"])
        for key in ("vmBootAttempted", "hardwareAcceptanceVerified", "providerActivationAllowed", "productionReleaseReady"):
            self.assertIs(result[key], False)

    def test_empty_vm_lifecycle(self):
        a = self.run_case("empty_vm_created_and_closed", empty_vm=True, ioctl=Mock(side_effect=[12, 8]))
        self.assertEqual(a["ioctl"].call_args_list, [call(7, 0xAE00, 0), call(7, 0xAE01, 0)])
        self.assertEqual(a["close_device"].call_args_list, [call(8), call(7)])

    def test_empty_vm_create_failure(self):
        a = self.run_case("empty_vm_creation_failed", empty_vm=True, ioctl=Mock(side_effect=[12, OSError(errno.ENODEV, "unavailable")]))
        a["close_device"].assert_called_once_with(7)

    def test_empty_vm_close_failure(self):
        a = self.run_case("empty_vm_close_failed", empty_vm=True, ioctl=Mock(side_effect=[12, 8]),
                          close_device=Mock(side_effect=[OSError(errno.EIO, "close failed"), None]))
        self.assertEqual(a["close_device"].call_args_list, [call(8), call(7)])

    def test_empty_vm_invalid_descriptor(self):
        a = self.run_case("invalid_vm_descriptor", empty_vm=True, ioctl=Mock(side_effect=[12, 7]))
        a["close_device"].assert_called_once_with(7)

    def test_empty_vm_wrong_api_no_creation(self):
        a = self.run_case("unexpected_api_version", empty_vm=True, ioctl=Mock(return_value=13))
        a["ioctl"].assert_called_once_with(7, 0xAE00, 0)

    def test_empty_vm_requires_approval(self):
        with patch.dict(probe.os.environ, {}, clear=True), patch.object(probe, "report") as report:
            self.assertEqual(probe.main(["--empty-vm"]), 2)
            report.assert_not_called()

    def test_empty_vm_report_not_boot_or_release(self):
        with patch.object(probe, "inspect_kvm", return_value="empty_vm_created_and_closed"):
            result = probe.report(empty_vm=True)
        self.assertTrue(result["emptyVmCreatedAndClosed"])
        for key in ("vmBootAttempted", "hardwareAcceptanceVerified", "providerActivationAllowed", "productionReleaseReady"):
            self.assertIs(result[key], False)

if __name__ == "__main__":
    unittest.main()
