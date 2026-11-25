# Phase 49 — actual fixed rootfs and guest vsock acceptance
PR #817 merged at 8a91dbb74385d81753cd57339f16452be5c4b309, all six associated PR workflows passed.
Operator reports manual boot bundle succeeded. Its final mode and hashes
were not independently retrieved; prepare again in the same diagnostic run.

Main-only workflow LABS authenticated live rootfs and vsock; approval
I_APPROVE_EPHEMERAL_FIXED_ROOTFS_VSOCK. Same-run authenticated kernel and
fixed rootfs/initrd build, bounded input copy to private root workspace,
immutable kernel and manifest hash checks, pinned Firecracker archive and
Jailer executable preflight. Manifest is same-run local build evidence, not
an independent attestation against a compromised runner.
One fixed 1-vCPU 256-MiB guest, read-only ext4 disk, no NIC, no API, only
the exact local vsock UDS permitted in the jail. Short host path respects
Unix socket length. PID 1 refuses to serve unless its actual root is ext4
and read-only. Two fresh independent nonce exchanges with exact protocol,
bounded lines/deadlines and isolation re-attestation before/after. Kill
only the owned cgroup, reap child, verify empty descendants, unchanged
rootfs bytes and removal of owned namespace/jail. No learner inputs or
public network, no host module loading. Separate existing diskless tests
retain their no-socket default. Six additional offline contract tests.
A positive result remains hosted diagnostic evidence; independent 900s
watchdog, dedicated physical host, image approval and provider release
remain pending. Failure in real device enumeration/module loading or
guest liveness fails the run. No deployment or paid infrastructure.
