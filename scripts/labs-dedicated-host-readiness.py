#!/usr/bin/env python3
"""Operator-only read-only physical KVM host preflight; never boots a guest."""
import fcntl
import hashlib
import json
import os
import pathlib
import platform
import re
import stat
import subprocess
import sys

APPROVAL = "I_CONFIRM_DEDICATED_OFFLINE_LABS_HOST_INSPECTION"
PINS = {
    "/usr/local/bin/firecracker": "b33f46cd6d88834cf6a4f8d184f08f219809c636236bffd286d233a60602a2ba",
    "/usr/local/bin/jailer": "ddadbaa15b5c942271a83b7040ca7259c8ccf92a9e08d44cce0b86fa407ba460",
}
KERNEL_PIN = "a6a897d3b8c177c8736e8bce85b6b9cd8e3275f94107221ee93820fcd5388384"
KVM_GET_API_VERSION = 0xAE00
ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"}

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def authorize(args, env, system, uid):
    require(args == ["--inspect", APPROVAL], "explicit local inspection approval required")
    require(system == "Linux" and uid == 0, "Linux root operator required")
    require(not any(env.get(k) for k in ("CI", "GITHUB_ACTIONS", "GITHUB_RUN_ID",
                    "RUNNER_ENVIRONMENT", "GITLAB_CI", "TF_BUILD", "BUILD_BUILDID")),
            "CI or hosted runner context refused")
    require(not any(env.get(k) for k in ("ETERNYX_REMOTE_LAB_ENABLED",
                    "DOCKER_REMOTE_LAB_ENABLED", "ETERNYX_FIRECRACKER_HOST_EXECUTION")),
            "stop runtime selection before separate local inspection")

def read(path):
    return pathlib.Path(path).read_text().strip()

def root_directory(path, executable=False):
    require(path.is_absolute(), "absolute directory required")
    for part in (path, *path.parents):
        info = part.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                and not info.st_mode & 0o022, "untrusted host directory: " + str(part))
    if executable:
        require(not os.statvfs(path).f_flag & os.ST_NOEXEC, "host executable directory is noexec")

def pinned_binary(path, expected):
    root_directory(path.parent, executable=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
                and not info.st_mode & 0o022 and info.st_mode & stat.S_IXUSR
                and 0 < info.st_size <= 64*1024*1024, "untrusted host binary")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            require(hashlib.file_digest(stream, "sha256").hexdigest() == expected,
                    "host executable pin mismatch")
    finally:
        os.close(fd)

def command(args, accepted=(0,)):
    result = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, env=ENV, timeout=5, text=True)
    require(result.returncode in accepted, "host capability command failed")
    return result.returncode, result.stdout.strip()

def virtualization_class(code, output):
    require((code == 1 and output == "none") or
            (code == 0 and re.fullmatch(r"[a-zA-Z0-9_-]{1,32}", output) and output != "none"),
            "invalid virtualization observation")
    return "none-detected" if code == 1 else "virtualized"

def inspect_kvm(path=pathlib.Path("/dev/kvm")):
    # KVM_GET_API_VERSION only. No CREATE_VM, no vCPU, no guest memory.
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        require(stat.S_ISCHR(os.fstat(fd).st_mode), "KVM device is not character device")
        version = fcntl.ioctl(fd, KVM_GET_API_VERSION, 0)
        require(version == 12, "unexpected KVM API version")
        return version
    finally:
        os.close(fd)

def controllers_available(available, enabled):
    needed = {"cpu", "memory", "pids"}
    return needed <= set(available.split()) and needed <= set(enabled.split())

def review_result(virt, kvm, controllers, systemd, binary_pins, capacity):
    checks = {
        "kvmApiVersion12": kvm == 12,
        "requiredCgroupV2ControllersEnabled": controllers is True,
        "systemdManagerRunning": systemd is True,
        "exactPhase41ExecutablePinsVerified": binary_pins is True,
        "minimumLocalCapacityObserved": capacity is True,
    }
    return {"schema": "eternyx-labs-dedicated-host-readiness-v1",
            "virtualizationObservation": virt, **checks,
            "readOnlyCapabilityChecksPassed": all(checks.values()),
            "guestKernelRequiredSha256": KERNEL_PIN,
            "dedicatedHostOwnershipIndependentlyVerified": False,
            "guestArtifactsVerifiedOnDedicatedHost": False,
            "guestBooted": False, "fullWatchdogExpiryVerified": False,
            "hardwareAcceptanceVerified": False,
            "providerActivationAllowed": False, "productionReleaseReady": False}

def inspect():
    require(platform.machine() == "x86_64", "expected x86_64 host")
    require(read("/proc/1/comm") == "systemd", "systemd must be PID 1")
    code, output = command(["/usr/bin/systemd-detect-virt", "--container"], (0, 1))
    require(code == 1 and output == "none", "container host refused")
    code, output = command(["/usr/bin/systemd-detect-virt", "--vm"], (0, 1))
    virt = virtualization_class(code, output)
    require(virt == "none-detected", "physical host required for this dedicated readiness profile")
    root_directory(pathlib.Path("/var/lib"), executable=True)
    root_directory(pathlib.Path("/srv"))
    cg = pathlib.Path("/sys/fs/cgroup")
    controllers = controllers_available(read(cg/"cgroup.controllers"), read(cg/"cgroup.subtree_control"))
    code, manager = command(["/usr/bin/systemctl", "is-system-running"], (0, 1))
    systemd = code == 0 and manager == "running"
    kvm = inspect_kvm()
    for path, pin in PINS.items():
        pinned_binary(pathlib.Path(path), pin)
    available = os.statvfs("/var/lib")
    capacity = available.f_bavail * available.f_frsize >= 2*1024*1024*1024
    mem = re.search(r"^MemAvailable:\s+(\d+)\s+kB$", read("/proc/meminfo"), re.M)
    capacity = capacity and bool(mem and int(mem[1]) >= 1024*1024) and (os.cpu_count() or 0) >= 2
    return review_result(virt,kvm,controllers,systemd,True,capacity)

if __name__ == "__main__":
    try:
        authorize(sys.argv[1:],os.environ,platform.system(),os.geteuid())
        result = inspect()
        print(json.dumps(result,sort_keys=True),flush=True)
        require(result["readOnlyCapabilityChecksPassed"], "host capability review incomplete")
    except (RuntimeError,OSError,subprocess.SubprocessError) as error:
        print("Dedicated readiness inspection refused or failed: " + str(error),file=sys.stderr)
        sys.exit(1)
