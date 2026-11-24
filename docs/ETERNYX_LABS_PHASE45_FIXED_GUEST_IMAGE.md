# Phase 45 — fixed diagnostic guest rootfs
PR #812 merged at 6c7602167691e47ca34a8c072b87fd82c97610e5; both PR workflows passed. No dedicated physical
host was inspected. Build the missing local diagnostic guest artifact, rather
than asserting that the earlier diskless guest satisfies the provider.

The static C /sbin/init implements the exact compact JSON challenge emitted by
the existing Node guest probe. PID 1 opens AF_VSOCK port 5501 only, accepts
only host CID 2, checks fixed protocol/session/nonce shape, bounds input and
connection time and returns SHA-256 liveness response. No shell, IP listener,
package manager, writable root, arbitrary command execution or learner input.
The protocol is liveness only, not signed attestation.

The unprivileged builder uses existing cc, static OpenSSL development library,
readelf, mke2fs, e2fsck and debugfs. It compiles real static init, creates a
32 MiB ext4 image without mounting, checks filesystem consistency and reads
back the exact binary, emits source/binary/image digests and publishes a
read-only file without overwrite in a private directory. The rootfs is a
diagnostic fixture, not the provider's independently approved HTTP challenge
pack. Build outputs depend on toolchain and ext4 metadata; reproducible build
and independent image approval are not claimed.

    umask 077
    work=$(mktemp -d)
    python3 -I -B scripts/labs-build-fixed-guest.py "$work/rootfs.ext4"

PR CI builds and tests the actual filesystem and extracted executable, with
six offline tests. No packages installed by CI, no KVM launch, no guest
vsock transport exercised. Missing toolchain fails closed. Next: verify
whether the authenticated kernel has built-in virtio block, ext4 and vsock
drivers (rather than relying on unprovided kernel modules), then run a
separately approved disposable guest boot and real vsock exchange. No
production provider changes, dedicated hardware claim, or paid resources.
