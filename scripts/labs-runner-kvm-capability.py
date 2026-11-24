#!/usr/bin/env python3
"""Non-launching Linux KVM capability probe. No credentials, privilege changes or network."""
import errno
import fcntl
import json
import os
import platform
import stat
import sys

# Linux KVM_GET_API_VERSION = _IO(KVMIO, 0x00). No VM creation ioctl.
KVM_GET_API_VERSION = 0xAE00

def inspect_kvm(*, stat_path=os.lstat, open_device=os.open,
                stat_fd=os.fstat, ioctl=fcntl.ioctl, close_device=os.close):
    try:
        entry = stat_path("/dev/kvm")
    except FileNotFoundError:
        return "device_missing"
    except OSError:
        return "device_inspection_failed"
    if not stat.S_ISCHR(entry.st_mode):
        return "not_character_device"
    try:
        fd = open_device("/dev/kvm", os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW)
    except OSError as exc:
        return "access_denied" if exc.errno in (errno.EACCES, errno.EPERM) else "open_failed"
    try:
        opened = stat_fd(fd)
        if not stat.S_ISCHR(opened.st_mode) or (
            opened.st_dev, opened.st_ino, opened.st_rdev
        ) != (entry.st_dev, entry.st_ino, entry.st_rdev):
            return "device_identity_mismatch"
        return "api_version_12" if ioctl(fd, KVM_GET_API_VERSION, 0) == 12 else "unexpected_api_version"
    except OSError:
        return "api_probe_failed"
    finally:
        close_device(fd)

def report():
    result = inspect_kvm() if sys.platform == "linux" else "unsupported_host"
    return {
        "schemaVersion": 1,
        "effectiveRoot": os.geteuid() == 0,
        "runnerKind": "github_hosted_candidate" if os.environ.get("GITHUB_ACTIONS") == "true" else "local_candidate",
        "linuxHost": sys.platform == "linux",
        "archSupported": platform.machine() in ("x86_64", "aarch64"),
        "cgroupV2Available": os.path.isfile("/sys/fs/cgroup/cgroup.controllers"),
        "kvmProbe": result,
        "kvmApiAvailable": result == "api_version_12",
        "firecrackerExecutable": os.access("/usr/local/bin/firecracker", os.X_OK),
        "jailerExecutable": os.access("/usr/local/bin/jailer", os.X_OK),
        "vmBootAttempted": False,
        "hardwareAcceptanceVerified": False,
        "providerActivationAllowed": False,
        "productionReleaseReady": False,
    }

if __name__ == "__main__":
    print(json.dumps(report(), sort_keys=True))
