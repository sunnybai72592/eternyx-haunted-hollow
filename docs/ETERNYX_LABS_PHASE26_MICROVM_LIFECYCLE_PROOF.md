# LABS Phase 26 — independent microVM lifecycle evidence

Phase 25 passed all nine applicable checks. The offline Firecracker harness
now rejects nested/foreign cgroup path aliases, rechecks the actual running
unit and process namespace after attestation, and checks the local halt
marker again after starting systemd. A halt during startup enters the
existing scoped cleanup path.

Teardown requires two complete observations of cgroup.procs and cgroup.events,
consistent file presence, exactly one populated=0 observation, and no unit
reappearance or remaining MainPID. Inconsistent reads fail closed.
The expiry drill rejects nonfinite, reversed or stalled monotonic time and
has a hard polling count limit; the independent systemd watchdog is unchanged.

The existing no-VM CI runs these additional adversarial regressions. This
is stronger lifecycle verification, not a new physical hardware receipt.
No real KVM machine is connected to this task; the separately approved
operator-only hardware run (pinned jailer/kernel/rootfs, guest vsock and
900-second expiry observation) is still required. The guest challenge
response is functional evidence, not cryptographic guest identity.
Public multi-tenant admission and provider-side spending controls remain
unverified. No provider enabled, production changed or paid resources used.
