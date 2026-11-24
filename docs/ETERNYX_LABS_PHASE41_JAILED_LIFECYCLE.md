# Phase 41 — fixed Jailer lifecycle acceptance on disposable hosted runner

Phase 40 operator log at merge SHA 7146c4754695a941a4085b1db4101ec84f89131f:
five tests passed; fixed guest init marker and successful Firecracker exit.
This is not Jailer or dedicated-host acceptance.

After merging, dispatch **LABS ephemeral Firecracker Jailer lifecycle** on main
with **I_APPROVE_EPHEMERAL_FIRECRACKER_JAILER**. PR tests only compile fixed guest
init and exercise offline contracts. The explicit main-only diagnostic uses
the Phase 40 SHA/size-pinned release and two fixed diskless guests, no arbitrary
user input, NIC, disk, vsock, API, secrets, or external target. No provider,
staging, production, new paid infrastructure, or host rollout.

The root supervisor uses a private root-owned /run directory, a unique cgroup
v2 leaf with bounded memory, process count and CPU, and a unique network
namespace. No global controller configuration or existing service is changed.
Jailer v1.18.0 performs the mount/pivot/chroot, UID/GID drop and new PID
namespace. See https://github.com/firecracker-microvm/firecracker/blob/v1.18.0/docs/jailer.md.
The supervisor becomes a child subreaper and verifies the actual Firecracker
child from the Jailer PID file against the cgroup, executable inode, chroot
inode, PID/mount/network namespace identities, seccomp, no-new-privileges,
UID/GID, capability masks, interfaces and limits while guest init is alive.
The first guest reboots after five seconds; the second sleeps for sixty
seconds and must be SIGKILLed by the host-owned cgroup after the fixed
deadline. Both require actual child exit status and empty cgroup; cleanup
removes owned jail and network namespace. Missing controls or evidence fails
the diagnostic rather than falling back to bare Firecracker.

The Phase 40 observed kernel digest is recorded as a drift baseline only.
A matching digest does not establish independent vendor provenance or
a reviewed immutable kernel supply chain; that gate remains false.
The hosted runner is not a dedicated acceptance host; the result cannot
activate a provider or indicate production readiness. Live Jailer success is
not yet established by adding this code, and host controller availability
may vary. Legacy gitlink maintenance is out of scope. Checkout uses the pinned v5 commit with explicit immediate removal and
absence verification of the local GitHub authorization header before any
diagnostic code. The built-in early credential removal traverses the legacy
unmapped gitlink and fails before tests; deferred action cleanup may still
warn. No gitlink changes and no credentials are used by the diagnostics. The existing Phase 40 workflow is
unchanged.
