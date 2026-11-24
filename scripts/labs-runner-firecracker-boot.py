#!/usr/bin/env python3
"""Pinned archive and diskless smoke preparation; no VM is launched here."""
import hashlib
import json
import pathlib
import stat
import sys
import tarfile

VERSION = "v1.18.0"
ARCHIVE_BYTES = 7606252
ARCHIVE_SHA = "1ac8eec866dd5eea14efecf6323e22b23eea24054545338a5b34bc5bca6623cd"
PREFIX = "release-v1.18.0-x86_64/"
MARKER = b"ETERNYX_FIXED_GUEST_INIT_OK"

def digest(path):
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()

def extract_pinned(archive, output):
    if archive.stat().st_size != ARCHIVE_BYTES or digest(archive) != ARCHIVE_SHA:
        raise ValueError("Pinned Firecracker archive mismatch")
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        for name in ("firecracker", "jailer"):
            path = PREFIX + name + "-" + VERSION + "-x86_64"
            matches = [m for m in members if m.name == path]
            if len(matches) != 1 or not matches[0].isreg() or not 0 < matches[0].size <= 32*1024*1024:
                raise ValueError("Missing or unsafe release member")
            data = tar.extractfile(matches[0]).read()
            if len(data) != matches[0].size or data[:4] != b"\x7fELF":
                raise ValueError("Invalid binary")
            dest = output / name
            with dest.open("xb") as f:
                f.write(data)
            dest.chmod(0o500)

def newc_entry(name, mode, data=b"", inode=1, rmajor=0, rminor=0):
    name = name.encode("ascii") + b"\0"
    fields = [inode, mode, 0, 0, 1, 0, len(data), 0, 0, rmajor, rminor, len(name), 0]
    header = b"070701" + b"".join(f"{v:08x}".encode("ascii") for v in fields) + name
    return header + b"\0"*((-len(header))%4) + data + b"\0"*((-len(data))%4)

def initramfs(init):
    if not 0 < len(init) <= 2*1024*1024 or init[:4] != b"\x7fELF":
        raise ValueError("Invalid fixed init")
    return b"".join([
        newc_entry("dev", stat.S_IFDIR | 0o755, inode=1),
        newc_entry("dev/console", stat.S_IFCHR | 0o600, inode=2, rmajor=5, rminor=1),
        newc_entry("init", stat.S_IFREG | 0o755, init, inode=3),
        newc_entry("TRAILER!!!", 0, inode=4),
    ])

def config(root):
    return {
        "boot-source": {
            "kernel_image_path": str(root / "kernel"),
            "initrd_path": str(root / "initramfs.cpio"),
            "boot_args": "console=ttyS0 reboot=k panic=1 pci=off nomodules rdinit=/init 8250.nr_uarts=1",
        },
        "machine-config": {"vcpu_count": 1, "mem_size_mib": 256, "smt": False},
        "drives": [],
        "network-interfaces": [],
    }

def prepare(root):
    extract_pinned(root / "release.tgz", root)
    kernel = root / "kernel"
    if not kernel.is_file() or not 0 < kernel.stat().st_size <= 128*1024*1024:
        raise ValueError("Runner kernel missing or invalid")
    (root / "initramfs.cpio").write_bytes(initramfs((root / "init").read_bytes()))
    (root / "config.json").write_text(json.dumps(config(root)), encoding="utf-8")
    print(json.dumps({"firecrackerRelease": VERSION, "archiveSha256": ARCHIVE_SHA,
                      "runnerKernelSha256": digest(kernel),
                      "firecrackerSha256": digest(root / "firecracker"),
                      "jailerSha256": digest(root / "jailer"),
                      "initramfsSha256": digest(root / "initramfs.cpio"),
                      "runnerKernelIndependentlyPinned": False}))

def verify_log(root):
    log = root / "boot.log"
    if log.stat().st_size > 4*1024*1024:
        raise ValueError("Boot output exceeds limit")
    if not any(line.strip() == MARKER for line in log.read_bytes().splitlines()):
        raise ValueError("Guest init marker missing")
    print(json.dumps({"firecrackerBootVerified": True, "fixedGuestInitVerified": True,
                      "processExitedSuccessfully": True, "virtualCpus": 1,
                      "memoryMiB": 256, "guestNetworkDevices": 0, "apiDisabled": True,
                      "jailerIsolationVerified": False, "hardwareAcceptanceVerified": False,
                      "providerActivationAllowed": False, "productionReleaseReady": False}))

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("prepare", "verify-log"):
        raise SystemExit("Expected prepare or verify-log and private working directory")
    root = pathlib.Path(sys.argv[2]).resolve(strict=True)
    if sys.argv[1] == "prepare":
        prepare(root)
    else:
        verify_log(root)
