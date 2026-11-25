#!/usr/bin/env python3
"""Fixed, consent-gated ephemeral runner diagnostic; never a provider."""
import ctypes
import importlib.util
import json
import os
import pathlib
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid

SPEC = importlib.util.spec_from_file_location(
    "boot", pathlib.Path(__file__).with_name("labs-runner-firecracker-boot.py"))
boot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(boot)
CGROOT = pathlib.Path("/sys/fs/cgroup")
EXEC_BASE = pathlib.Path("/var/lib")
MARKER = b"ETERNYX_JAILED_GUEST_INIT_OK"
OBSERVED_KERNEL = "a6a897d3b8c177c8736e8bce85b6b9cd8e3275f94107221ee93820fcd5388384"
LIMITS = {"memory.max": "805306368", "pids.max": "64", "cpu.max": "100000 100000"}
UID = GID = 65534

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def verify_exec_directory(path):
    # Never remount /run, override noexec, or fall back to a user-writable
    # directory. Every ancestor must be a trusted, non-symlink directory.
    require(path.is_absolute(), "executable directory must be absolute")
    for part in (path, *path.parents):
        info = part.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0
                and not info.st_mode & 0o022, "untrusted executable directory: " + str(part))
    require(not os.statvfs(path).f_flag & os.ST_NOEXEC,
            "executable workspace filesystem is noexec: " + str(path))

def verify_release_executable(path):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
            and info.st_mode & stat.S_IXUSR and not info.st_mode & 0o022,
            "untrusted release executable: " + path.name)
    require(not os.statvfs(path).f_flag & os.ST_NOEXEC,
            "release executable filesystem is noexec: " + path.name)
    # A real exec verifies more than mode bits (mount and host policy included).
    try:
        result = subprocess.run([str(path), "--version"], check=True, timeout=5,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, env={}, cwd="/")
    except PermissionError as exc:
        raise RuntimeError("host denied execution of pinned " + path.name
                           + "; no policy bypass attempted") from exc
    expected = ("Jailer " if path.name == "jailer" else "Firecracker ") + boot.VERSION
    require(expected.encode() in result.stdout.splitlines(), "unexpected release version")

def read(path):
    return path.read_text().strip()

def run(*args):
    subprocess.run(args, check=True, timeout=10, env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin"})

def jailed_config():
    return boot.config(pathlib.Path("/"))

def members(cg):
    return {int(p) for p in read(cg / "cgroup.procs").split()}

def status_fields(text):
    return dict(line.split(":", 1) for line in text.splitlines() if ":" in line)

def verify_status(fields):
    for key, expected in (("Uid", [UID]*4), ("Gid", [GID]*4)):
        require([int(x) for x in fields[key].split()] == expected, key + " not dropped")
    require(not int(fields["CapEff"].strip(), 16), "effective capabilities remain")
    require(not int(fields["CapPrm"].strip(), 16), "permitted capabilities remain")
    require(fields["Seccomp"].strip() == "2", "seccomp filter absent")
    require(fields["NoNewPrivs"].strip() == "1", "no-new-privileges absent")
    require(fields["NSpid"].split()[-1] == "1" and len(fields["NSpid"].split()) >= 2,
            "child is not PID namespace init")

def marker_in(log):
    require(log.stat().st_size <= 4*1024*1024, "boot log too large")
    return MARKER in [line.strip() for line in log.read_bytes().splitlines()]

def verify_live(pid, cg, root, net, allowed_socket=None):
    require(pid in members(cg), "child not in dedicated cgroup")
    proc = pathlib.Path("/proc") / str(pid)
    require(os.path.samestat((proc / "exe").stat(), (root / "firecracker").stat()), "wrong executable")
    require(os.path.samestat((proc / "root").stat(), root.stat()), "wrong jailed root")
    for ns in ("mnt", "net", "pid"):
        require(os.readlink(proc / "ns" / ns) != os.readlink("/proc/self/ns/" + ns),
                ns + " namespace not isolated")
    require(os.path.samestat((proc / "ns/net").stat(), net.stat()), "wrong network namespace")
    verify_status(status_fields((proc / "status").read_text()))
    interfaces = {line.split(":", 1)[0].strip()
                  for line in (proc / "net/dev").read_text().splitlines() if ":" in line}
    require(interfaces == {"lo"}, "unexpected network interface")
    require(all(read(cg / key) == value for key, value in LIMITS.items()), "cgroup limits differ")
    sockets = {p for p in root.rglob("*") if stat.S_ISSOCK(p.lstat().st_mode)}
    expected = set() if allowed_socket is None else {root / "v.sock"}
    require(allowed_socket is None or allowed_socket == root / "v.sock", "invalid allowed socket")
    require(sockets == expected, "unexpected socket in jail")
    if allowed_socket is not None:
        require(allowed_socket.lstat().st_uid == UID, "unexpected vsock listener owner")
    return {"mountNamespace": True, "pidNamespace": True, "networkNamespace": True,
            "chrootIdentity": True, "uidGidDropped": True, "seccompFilter": True,
            "noNewPrivileges": True, "noEffectiveOrPermittedCapabilities": True,
            "loopbackOnly": True, "cgroupLimitsVerified": True, "noApiSocketObserved": True}

def empty_cgroup(cg):
    end = time.monotonic() + 5
    while time.monotonic() < end:
        if not members(cg) and "populated 0" in read(cg / "cgroup.events").splitlines():
            return
        time.sleep(.05)
    raise RuntimeError("cgroup did not empty")

def reap(pid, seconds):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        got, status = os.waitpid(pid, os.WNOHANG)
        if got == pid:
            return os.waitstatus_to_exitcode(status)
        time.sleep(.05)
    raise RuntimeError("Firecracker child did not exit")

def invocation(work, cg, name, net):
    return [str(work / "jailer"), "--id", name, "--exec-file", str(work / "firecracker"),
            "--uid", str(UID), "--gid", str(GID), "--cgroup-version", "2",
            "--parent-cgroup", cg.name, "--chroot-base-dir", str(work / "jails"),
            "--netns", str(net), "--new-pid-ns", "--resource-limit", "fsize=4194304",
            "--resource-limit", "no-file=256", "--", "--no-api", "--config-file", "/config.json"]

def exercise(work, init, forced):
    name = "eternyx-fc-" + uuid.uuid4().hex
    cg = CGROOT / name
    net = pathlib.Path("/run/netns") / name
    root = work / "jails" / "firecracker" / name / "root"
    log = work / (name + ".log")
    proc = None
    child = None
    reaped = False
    cg.mkdir()
    net_created = False
    try:
        for key, value in LIMITS.items():
            (cg / key).write_text(value)
        require((cg / "cgroup.kill").is_file(), "cgroup kill unavailable")
        run("/usr/sbin/ip", "netns", "add", name)
        net_created = True
        root.mkdir(parents=True, mode=0o755)
        for source, target in ((work / "kernel", root / "kernel"),):
            shutil.copyfile(source, target)
            target.chmod(0o444)
        (root / "initramfs.cpio").write_bytes(boot.initramfs(init.read_bytes()))
        (root / "initramfs.cpio").chmod(0o444)
        (root / "config.json").write_text(json.dumps(jailed_config()))
        (root / "config.json").chmod(0o444)
        with log.open("wb") as output:
            proc = subprocess.Popen(invocation(work, cg, name, net), stdin=subprocess.DEVNULL,
                                    stdout=output, stderr=subprocess.STDOUT, env={})
            require(proc.wait(timeout=10) == 0, "Jailer launcher failed")
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if marker_in(log):
                    candidate = int(read(root / "firecracker.pid"))
                    require(candidate in members(cg), "PID file not bound to cgroup")
                    child = candidate
                    break
                time.sleep(.025)
            require(child is not None, "fixed guest marker missing")
            evidence = verify_live(child, cg, root, net)
            if forced:
                # This guest has a fixed 60-second sleep; enforce the host deadline.
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    require(child in members(cg), "guest ended before forced deadline")
                    time.sleep(.05)
                (cg / "cgroup.kill").write_text("1")
            exit_code = reap(child, 12 if not forced else 5)
            reaped = True
            require(exit_code == (-signal.SIGKILL if forced else 0), "unexpected child exit")
            empty_cgroup(cg)
        print(json.dumps({"scenario": "forced-deadline" if forced else "normal-reboot",
                          "guestMarkerVerified": True, "childExitCode": exit_code, **evidence}), flush=True)
    finally:
        # The launcher may have exited while its child remains; kill the owned
        # cgroup, never a PID supplied by the guest or a global process pattern.
        if proc is not None and proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)
        if (cg / "cgroup.kill").is_file():
            (cg / "cgroup.kill").write_text("1")
        empty_cgroup(cg)
        if child is not None and not reaped:
            try:
                reap(child, 5)
            except ChildProcessError:
                pass
        while True:
            try:
                pid, _ = os.waitpid(-1, os.WNOHANG)
                if not pid:
                    break
            except ChildProcessError:
                break
        cg.rmdir()
        if net_created:
            run("/usr/sbin/ip", "netns", "delete", name)
        shutil.rmtree(root.parent, ignore_errors=False) if root.parent.exists() else None
        require(not cg.exists() and not net.exists() and not root.parent.exists(),
                "owned resources remain")
        if log.exists():
            print(log.read_bytes()[-4096:].decode("utf-8", errors="replace"), flush=True)
    return True

def enforce_kernel_pin(kernel, required):
    actual = boot.digest(kernel)
    if required:
        require(actual == OBSERVED_KERNEL, "guest kernel does not match immutable Phase 41 pin")
    return actual

def main(source, require_pinned_kernel=False):
    require(os.geteuid() == 0, "requires approved ephemeral root setup")
    require((CGROOT / "cgroup.controllers").is_file(), "cgroup v2 required")
    require(stat.S_ISCHR(pathlib.Path("/dev/kvm").stat().st_mode), "KVM absent")
    require(ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) == 0,
            "cannot become child subreaper")
    verify_exec_directory(EXEC_BASE)
    print(json.dumps({"workspaceBase": str(EXEC_BASE),
                      "runMountNoexec": bool(os.statvfs("/run").f_flag & os.ST_NOEXEC),
                      "workspaceMountNoexec": False}), flush=True)
    with tempfile.TemporaryDirectory(prefix="eternyx-jailed-", dir=EXEC_BASE) as directory:
        work = pathlib.Path(directory)
        verify_exec_directory(work)
        require(stat.S_IMODE(work.stat().st_mode) == 0o700, "workspace is not private")
        (work / "jails").mkdir(mode=0o700)
        for name in ("release.tgz", "kernel", "init-normal", "init-timeout"):
            shutil.copyfile(source / name, work / name)
        boot.extract_pinned(work / "release.tgz", work)
        for name in ("jailer", "firecracker"):
            verify_release_executable(work / name)
        print(json.dumps({"pinnedReleaseExecutablesVerified": True}), flush=True)
        kernel = work / "kernel"
        require(0 < kernel.stat().st_size <= 128*1024*1024, "invalid kernel size")
        actual = enforce_kernel_pin(kernel, require_pinned_kernel)
        print(json.dumps({"guestKernelMatchesImmutablePin": actual == OBSERVED_KERNEL,
                          "immutableKernelEnforced": require_pinned_kernel}), flush=True)
        print(json.dumps({"runnerKernelSha256": actual,
                          "phase40ObservedKernelSha256": OBSERVED_KERNEL,
                          "runnerKernelMatchesPhase40": actual == OBSERVED_KERNEL,
                          "runnerKernelIndependentlyPinned": False,
                          "archiveSha256": boot.ARCHIVE_SHA,
                          "firecrackerSha256": boot.digest(work / "firecracker"),
                          "jailerSha256": boot.digest(work / "jailer")}), flush=True)
        exercise(work, work / "init-normal", False)
        exercise(work, work / "init-timeout", True)
    print(json.dumps({"jailerIsolationVerified": True, "normalChildExitVerified": True,
                      "forcedDeadlineVerified": True, "ownedResourcesCleaned": True,
                      "runnerKernelIndependentlyPinned": False,
                      "immutableGuestKernelBootVerified": require_pinned_kernel,
                      "hardwareAcceptanceVerified": False,
                      "providerActivationAllowed": False, "productionReleaseReady": False}), flush=True)

if __name__ == "__main__":
    if len(sys.argv) not in (2, 3) or (len(sys.argv) == 3 and sys.argv[2] != "--require-pinned-kernel"):
        raise SystemExit("expected fixed preparation directory and optional --require-pinned-kernel")
    main(pathlib.Path(sys.argv[1]).resolve(strict=True), len(sys.argv) == 3)
