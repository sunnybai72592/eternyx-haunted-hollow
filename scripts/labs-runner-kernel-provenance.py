#!/usr/bin/env python3
"""Read-only signed Ubuntu archive provenance for the Phase 41 guest kernel."""
import hashlib
import json
import os
import pathlib
import pwd
import re
import resource
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

PIN = "a6a897d3b8c177c8736e8bce85b6b9cd8e3275f94107221ee93820fcd5388384"
# Identity reported by the hash-matching Phase 42 run before keyring preflight.
GUEST_RELEASE = "7.0.0-1014-aws"
GUEST_PACKAGE = "linux-image-7.0.0-1014-aws"
GUEST_VERSION = "7.0.0-1014.14~24.04.1"
GUEST_ARCH = "amd64"
KEYRING = pathlib.Path("/usr/share/keyrings/ubuntu-archive-keyring.gpg")
# Canonical publishes this full archive signing key fingerprint:
# https://wiki.ubuntu.com/Security/FAQ
ARCHIVE_FINGERPRINT = "F6ECB3762474EDA9D21B7022871920D1991BC93C"
MAX_KEYRING = 1024 * 1024
MAX_PACKAGE = 128 * 1024 * 1024
MAX_TAR = 256 * 1024 * 1024
BASE_ENV = {"PATH": "/usr/bin:/bin", "LC_ALL": "C", "LANG": "C"}

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def validate_identity(release, package, version, architecture):
    require(re.fullmatch(r"[0-9][a-zA-Z0-9.+-]{1,100}", release), "invalid kernel release")
    require(package in ("linux-image-" + release, "linux-image-unsigned-" + release),
            "unexpected owner of kernel image")
    require(re.fullmatch(r"[0-9][a-zA-Z0-9.+:~_-]{0,120}", version), "invalid package version")
    require(architecture == "amd64", "expected amd64 package")

def validate_archive_path(name):
    # Debian versions legitimately contain '~' (and '+' and '.').
    # Keep a narrow relative pool path grammar; no URL decoding, query,
    # fragments, absolute paths, escapes, or traversal components.
    require(isinstance(name, str) and 0 < len(name) <= 1024
            and re.fullmatch(r"pool/(?:[A-Za-z0-9.+_~-]+/)+[A-Za-z0-9.+_~-]+\.deb", name)
            and all(part not in ("", ".", "..") and len(part) <= 255
                    for part in name.split("/")),
            "unexpected package archive path")
    return name

def metadata_pin(text, package, version):
    candidates = set()
    for record in text.split("\n\n"):
        fields = {}
        for line in record.splitlines():
            if line and not line[0].isspace() and ": " in line:
                key, value = line.split(": ", 1)
                require(key not in fields, "duplicate package metadata field")
                fields[key] = value
        if (fields.get("Package"), fields.get("Version"), fields.get("Architecture")) != (package, version, "amd64"):
            continue
        # An installed dpkg status record is NOT authenticated archive metadata.
        if not all(key in fields for key in ("Filename", "SHA256", "Size")):
            continue
        sha, size, name = fields["SHA256"], fields["Size"], fields["Filename"]
        require(re.fullmatch(r"[a-f0-9]{64}", sha), "invalid archive package digest")
        require(size.isascii() and size.isdecimal() and 0 < int(size) <= MAX_PACKAGE,
                "invalid archive package size")
        validate_archive_path(name)
        candidates.add((sha, int(size)))
    require(len(candidates) == 1, "exact pinned guest package absent or conflicting in signed archive")
    return candidates.pop()

def verify_deb(path, pin):
    require(path.is_file() and not path.is_symlink(), "expected regular downloaded deb")
    require(path.stat().st_size == pin[1] and digest(path) == pin[0],
            "downloaded deb does not match signed metadata")

def kernel_digest_from_tar(path, release):
    wanted = "boot/vmlinuz-" + release
    hashes = []
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            name = member.name.removeprefix("./")
            if name != wanted:
                continue
            require(member.isreg() and 0 < member.size <= MAX_PACKAGE,
                    "kernel member is not a bounded regular file")
            with archive.extractfile(member) as stream:
                hashes.append(hashlib.file_digest(stream, "sha256").hexdigest())
    require(len(hashes) == 1, "expected exactly one kernel archive member")
    return hashes[0]

def export_verified_kernel(tar, release, destination):
    # Verify before exporting, then re-hash the actual exported bytes. Never
    # overwrite an existing file or use the archive member as a filesystem path.
    require(kernel_digest_from_tar(tar, release) == PIN,
            "archive kernel does not match immutable Phase 41 pin")
    require(destination.name == "kernel" and destination.is_absolute(),
            "expected fixed private kernel output path")
    parent = destination.parent
    info = parent.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700,
            "kernel export parent must be private and owned")
    with tempfile.TemporaryDirectory(prefix="verified-kernel-", dir=parent) as directory:
        staging = pathlib.Path(directory) / "kernel"
        with tarfile.open(tar, "r:") as archive, staging.open("xb") as output:
            found = 0
            for member in archive:
                if member.name.removeprefix("./") != "boot/vmlinuz-" + release:
                    continue
                require(member.isreg() and 0 < member.size <= MAX_PACKAGE,
                        "invalid kernel member")
                found += 1
                require(found == 1, "duplicate kernel member")
                with archive.extractfile(member) as stream:
                    shutil.copyfileobj(stream, output, 1024 * 1024)
            require(found == 1, "missing kernel member")
        staging.chmod(0o400)
        require(digest(staging) == PIN, "exported kernel digest mismatch")
        os.link(staging, destination)  # atomic publication, no overwrite
    require(digest(destination) == PIN, "published kernel digest mismatch")
    print(json.dumps({"authenticatedGuestKernelExported": True,
                      "exportedKernelSha256": PIN}), flush=True)

def provenance_result(archive_kernel, observed_kernel):
    # Archive authenticity is checked before this function. A changed host
    # cannot select a different guest, and matching host bytes alone prove nothing.
    require(archive_kernel == PIN,
            "independent archive kernel does not match immutable Phase 41 pin")
    same = observed_kernel == PIN
    return {"signedUbuntuArchivePackageVerified": True,
            "independentArchiveKernelMatchesPhase41Pin": True,
            "phase41GuestKernelIndependentlyPinned": True,
            "currentRunnerKernelMatchesPhase41Pin": same,
            "runnerKernelIndependentlyPinned": same,
            "dedicatedHardwareAcceptanceVerified": False,
            "providerActivationAllowed": False, "productionReleaseReady": False}

def fixed_guest_identity():
    validate_identity(GUEST_RELEASE, GUEST_PACKAGE, GUEST_VERSION, GUEST_ARCH)
    return GUEST_RELEASE, GUEST_PACKAGE, GUEST_VERSION

def observe_runner_kernel(observed):
    release = command(["/usr/bin/uname", "-r"])
    require(re.fullmatch(r"[0-9][a-zA-Z0-9.+-]{1,100}", release), "invalid runner release")
    if observed is None:
        return release, None
    require(observed.is_file() and not observed.is_symlink()
            and 0 < observed.stat().st_size <= MAX_PACKAGE, "invalid observed runner kernel")
    return release, digest(observed)

def command(args, env=BASE_ENV, cwd=None, timeout=30):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, timeout=timeout, env=env, cwd=cwd).stdout.strip()

def primary_fingerprints(listing):
    fingerprints = set()
    primary = False
    for line in listing.splitlines():
        fields = line.split(":")
        if fields[0] in ("pub", "sub", "sec", "ssb"):
            primary = fields[0] == "pub"
        elif fields[0] == "fpr" and primary:
            require(len(fields) > 9 and re.fullmatch(r"[A-F0-9]{40}", fields[9]),
                    "invalid primary key fingerprint")
            fingerprints.add(fields[9])
            primary = False
    return fingerprints

def read_public_keyring(source):
    # Public key material is untrusted input. Never execute it, never read
    # non-regular files, and never use an unpinned key for authentication.
    # Open nonblocking to avoid hanging on a substituted FIFO.
    fd = os.open(source, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC)
    try:
        # Validate the opened object before fdopen: Python rejects directories
        # during fdopen itself, before a stream-based fstat can run.
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= MAX_KEYRING,
                "archive keyring is not a bounded regular file")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            data = stream.read(MAX_KEYRING + 1)
        require(0 < len(data) <= MAX_KEYRING, "archive keyring size exceeded")
        return data
    finally:
        os.close(fd)

def prepare_archive_keyring(work, source=KEYRING):
    # Snapshot once in a private directory; trust the published fingerprint,
    # not ownership, symlink layout, or any other key in the source file.
    original = source.lstat()
    data = read_public_keyring(source)
    print(json.dumps({"sourceKeyringUid": original.st_uid,
                      "sourceKeyringMode": oct(stat.S_IMODE(original.st_mode)),
                      "sourceKeyringIsSymlink": stat.S_ISLNK(original.st_mode)}), flush=True)
    home = work / "gnupg"
    home.mkdir(mode=0o700)
    local = work / ("archive.asc" if data.startswith(b"-----BEGIN PGP PUBLIC KEY BLOCK-----")
                    else "archive.gpg")
    with local.open("xb") as stream:
        stream.write(data)
    local.chmod(0o600)
    listing = command(["/usr/bin/gpg", "--no-options", "--homedir", str(home),
        "--batch", "--no-tty", "--with-colons", "--show-keys", str(local)])
    require(ARCHIVE_FINGERPRINT in primary_fingerprints(listing),
            "published Ubuntu archive primary fingerprint missing")
    # APT's Signed-By fingerprint with ! restricts signatures to this exact
    # primary key, even if other public keys are present in the snapshot.
    print(json.dumps({"archiveSigningKeyFingerprint": ARCHIVE_FINGERPRINT,
                      "archiveSigningKeyPinVerified": True,
                      "archiveKeyringSnapshotSha256": digest(local)}), flush=True)
    return local

def apt_environment(work, keyring):
    for name in ("lists", "archives", "downloads"):
        (work / name).mkdir(mode=0o700)
    (work / "lists/partial").mkdir()
    (work / "archives/partial").mkdir()
    sources = work / "sources.list"
    sources.write_text("".join(
        f"deb [arch=amd64 signed-by={keyring},{ARCHIVE_FINGERPRINT}!] https://archive.ubuntu.com/ubuntu {suite} main restricted\n"
        for suite in ("noble", "noble-updates", "noble-security")))
    config = work / "apt.conf"
    config.write_text(f'''
Dir::Etc::Parts "-";
Dir::Etc::Main "-";
Dir::Etc::SourceList "{sources}";
Dir::Etc::SourceParts "-";
Dir::Etc::Preferences "-";
Dir::Etc::PreferencesParts "-";
Dir::State::lists "{work / "lists"}";
Dir::State::status "/dev/null";
Dir::Cache::archives "{work / "archives"}";
Dir::Cache::pkgcache "";
Dir::Cache::srcpkgcache "";
APT::Architecture "amd64";
APT::Architectures {{ "amd64"; }};
APT::Get::AllowUnauthenticated "false";
APT::Update::Error-Mode "any";
Acquire::AllowInsecureRepositories "false";
Acquire::AllowDowngradeToInsecureRepositories "false";
Acquire::Check-Valid-Until "true";
Acquire::Check-Date "true";
Acquire::https::Verify-Peer "true";
Acquire::https::Verify-Host "true";
Acquire::Languages "none";
Acquire::Retries "0";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
Acquire::PDiffs "false";
APT::Sandbox::User "{pwd.getpwuid(os.getuid()).pw_name}";
''')
    return {**BASE_ENV, "APT_CONFIG": str(config)}

def limit_tar():
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_TAR, MAX_TAR))

def main(observed, export=None, audit=None):
    require(os.geteuid() != 0, "run archive inspection unprivileged")
    release, package, version = fixed_guest_identity()
    runner_release, observed_hash = observe_runner_kernel(observed)
    print(json.dumps({"guestKernelRelease": release, "guestPackage": package,
                      "guestPackageVersion": version, "immutablePhase41KernelSha256": PIN,
                      "currentRunnerKernelRelease": runner_release,
                      "currentRunnerKernelSha256": observed_hash,
                      "currentRunnerKernelMatchesPhase41Pin": observed_hash == PIN,
                      "currentRunnerKernelObserved": observed_hash is not None}), flush=True)
    with tempfile.TemporaryDirectory(prefix="eternyx-kernel-proof-") as directory:
        work = pathlib.Path(directory)
        keyring = prepare_archive_keyring(work)
        env = apt_environment(work, keyring)
        command(["/usr/bin/apt-get", "update"], env, work, 180)
        metadata = command(["/usr/bin/apt-cache", "show", package], env, work)
        pin = metadata_pin(metadata, package, version)
        print(json.dumps({"exactSignedArchiveMetadataSelected": True,
                          "archivePackageSha256": pin[0], "archivePackageBytes": pin[1]}),
              flush=True)
        downloads = work / "downloads"
        command(["/usr/bin/apt-get", "download", package + "=" + version], env, downloads, 90)
        files = list(downloads.iterdir())
        require(len(files) == 1 and files[0].suffix == ".deb", "unexpected download contents")
        verify_deb(files[0], pin)
        print(json.dumps({"downloadedPackageDigestAndSizeVerified": True}), flush=True)
        tar = work / "package.tar"
        with tar.open("wb") as output:
            subprocess.run(["/usr/bin/dpkg-deb", "--fsys-tarfile", str(files[0])],
                check=True, timeout=30, stdout=output, stderr=subprocess.PIPE,
                env=BASE_ENV, preexec_fn=limit_tar)
        archive_hash = kernel_digest_from_tar(tar, release)
        print(json.dumps({"archiveKernelMemberSha256": archive_hash,
                          "archiveKernelMemberMatchesPhase41Pin": archive_hash == PIN}), flush=True)
        evidence = provenance_result(archive_hash, observed_hash)
        if export is not None:
            export_verified_kernel(tar, release, export)
        if audit is not None:
            audit(tar, release, version, env, work)
        print(json.dumps({"archivePackageSha256": pin[0], "archivePackageBytes": pin[1],
                          "archiveKernelSha256": archive_hash, "runnerKernelSha256": observed_hash,
                          "immutablePhase41KernelSha256": PIN, "ubuntuArchiveKeyringSha256": digest(keyring),
                          "ubuntuArchiveSigningKeyFingerprint": ARCHIVE_FINGERPRINT}))
    print(json.dumps(evidence), flush=True)

if __name__ == "__main__":
    try:
        if len(sys.argv) == 3 and sys.argv[1] == "--export-guest-kernel":
            main(None, pathlib.Path(sys.argv[2]).absolute())
        elif len(sys.argv) in (1, 2):
            main(pathlib.Path(sys.argv[1]).absolute() if len(sys.argv) == 2 else None)
        else:
            raise SystemExit("expected optional runner kernel copy or --export-guest-kernel path")
    except subprocess.CalledProcessError as exc:
        # Fixed commands only; bounded diagnostics, no environment or credentials.
        err = exc.stderr or ""
        if isinstance(err, bytes):
            err = err.decode("utf-8", errors="replace")
        print(err[-4000:], file=sys.stderr)
        raise SystemExit("archive provenance command failed") from exc
