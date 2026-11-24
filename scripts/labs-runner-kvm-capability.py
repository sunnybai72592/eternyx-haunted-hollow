#!/usr/bin/env python3
"""Non-launching Linux KVM capability probe. No credentials, privilege changes or network."""
import errno
import fcntl
import json
import os
import platform
import stat
import sys

# Ordinary inspection uses only KVM_GET_API_VERSION. Explicit smoke adds KVM_CREATE_VM.
KVM_GET_API_VERSION = 0xAE00
KVM_CREATE_VM = 0xAE01
EMPTY_VM_APPROVAL = "I_APPROVE_EPHEMERAL_EMPTY_KVM_VM"

def inspect_kvm(*, stat_path=os.lstat, open_device=os.open,
                stat_fd=os.fstat, ioctl=fcntl.ioctl, close_device=os.close,
                empty_vm=False):
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
        if ioctl(fd, KVM_GET_API_VERSION, 0) != 12:
            return "unexpected_api_version"
        if not empty_vm:
            return "api_version_12"
        try:
            vm_fd = ioctl(fd, KVM_CREATE_VM, 0)
        except OSError:
            return "empty_vm_creation_failed"
        if type(vm_fd) is not int or vm_fd < 0 or vm_fd == fd:
            return "invalid_vm_descriptor"
        # No vCPU, guest memory, network, fork, subprocess or KVM_RUN.
        try:
            close_device(vm_fd)
        except OSError:
            return "empty_vm_close_failed"
        return "empty_vm_created_and_closed"
    except OSError:
        return "api_probe_failed"
    finally:
        close_device(fd)

def report(empty_vm=False):
    result = inspect_kvm(empty_vm=empty_vm) if sys.platform == "linux" else "unsupported_host"
    return {
        "schemaVersion": 1,
        "effectiveRoot": os.geteuid() == 0,
        "runnerKind": "github_hosted_candidate" if os.environ.get("GITHUB_ACTIONS") == "true" else "local_candidate",
        "linuxHost": sys.platform == "linux",
        "archSupported": platform.machine() in ("x86_64", "aarch64"),
        "cgroupV2Available": os.path.isfile("/sys/fs/cgroup/cgroup.controllers"),
        "kvmProbe": result,
        "kvmApiAvailable": result in ("api_version_12", "empty_vm_created_and_closed", "empty_vm_creation_failed", "empty_vm_close_failed", "invalid_vm_descriptor"),
        "emptyVmTestRequested": empty_vm,
        "emptyVmCreatedAndClosed": result == "empty_vm_created_and_closed",
        "firecrackerExecutable": os.access("/usr/local/bin/firecracker", os.X_OK),
        "jailerExecutable": os.access("/usr/local/bin/jailer", os.X_OK),
        "vmBootAttempted": False,
        "hardwareAcceptanceVerified": False,
        "providerActivationAllowed": False,
        "productionReleaseReady": False,
    }

def main(args):
    if not args:
        print(json.dumps(report(), sort_keys=True))
        return 0
    if (args != ["--empty-vm"] or sys.platform != "linux" or
        platform.machine() != "x86_64" or os.geteuid() != 0 or
        os.environ.get("GITHUB_ACTIONS") != "true" or
        os.environ.get("ETERNYX_EMPTY_VM_APPROVAL") != EMPTY_VM_APPROVAL):
        print("Empty VM diagnostic denied", file=sys.stderr)
        return 2
    result = report(empty_vm=True)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["emptyVmCreatedAndClosed"] else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
