# Phase 44 — dedicated host readiness (read-only)
PR #811 merged at 88ab9f918c933860da1ac9b8f5c39b6c1d2a6da7; all five associated PR workflows passed.
Operator reports the combined main-only signed kernel/Jailer workflow passed.
Its manual run evidence JSON was not independently retrieved. Hosted evidence
does not establish a dedicated host, production readiness or rootfs provenance.

Reuse the existing provider-specific operator harness documented in
docs/ETERNYX_CTF_FIRECRACKER_HARDWARE_ACCEPTANCE.md, not a parallel provider.
New preflight is restricted to a separately approved physical x86_64 Linux
machine under operator control, with systemd, KVM, cgroup v2, at least 2 CPU
threads, 1 GiB available memory, 2 GiB free on /var/lib, and preinstalled
Firecracker/Jailer matching the exact Phase 41 binary hashes. These are
minimum diagnostic thresholds, not sizing recommendations or capacity proof.
No paid host is provisioned by this PR. On an existing dedicated disposable
host only, after reviewing the checkout, run the read-only command:

    sudo /usr/bin/python3 -I -B scripts/labs-dedicated-host-readiness.py --inspect I_CONFIRM_DEDICATED_OFFLINE_LABS_HOST_INSPECTION

The command refuses CI markers, containers, detected VMs and enabled runtime
selection. The physical-only profile is deliberately stricter than the older
harness; detection alone cannot establish physical ownership or absence of
nested virtualization. Uses KVM_GET_API_VERSION only, no CREATE_VM.
Checks trusted binary directory ownership/modes/mount flags, exact binary
hashes, systemd running status and required available/enabled cgroup
controllers without changing any host state. No package downloads, mounts,
namespace creation, VM launch, network calls or systemd unit changes.

Do not run on shared, production or unapproved infrastructure. A positive
result is a capability report only, not independent host identity or
hardware acceptance. Existing provider requires separately reviewed
kernel/rootfs, per-session UID/GID and namespace, real guest service/vsock
probe, actual 900-second expiry and independently reviewed evidence. The
historical Phase 41 kernel pin is printed for review, not a claim that that
kernel or a bootable service rootfs is staged on this host. Do not confuse
the diskless Phase 43 guest with the provider's rootfs/vsock guest.
No provider release gates change. CI runs six offline tests only.
