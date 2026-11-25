# Phase 50 — independent crash watchdog diagnostic
PR #818 merged at d35e9cc7b0c55fc7864d60ce8cfa2aaa121e5675; all ten associated PR workflows passed. Operator
reports live rootfs/vsock workflow passed; manual final JSON not retrieved.

Main-only workflow LABS independent crash watchdog acceptance. Approval:
I_APPROVE_EPHEMERAL_CRASH_WATCHDOG. Same fixed guest and authenticated boot
bundle, no NIC or API, no arbitrary user inputs. The observer creates a
unique empty cgroup; the controller arms a separate systemd transient timer
before launching the Jailer. The timer runs a root-owned fixed Python payload,
bound to the exact cgroup device/inode, after 75 seconds. After two actual
vsock exchanges and repeated isolation checks, the controller writes a
private proof and deliberately SIGKILLs itself. The observer must reap that
controller and see the same guest still present before the timer expires.
The timer must independently find a populated cgroup, kill it, prove empty
descendants and leave a receipt; the observer checks actual monotonic timing,
successful systemd oneshot result, guest SIGKILL, unchanged rootfs and scoped
resource cleanup. Emergency fallback cleanup never counts as success.
Six offline regression tests; actual systemd timer and KVM run pending.
This is a short hosted crash drill, not full 900-second provider watchdog,
physical host acceptance, guest image approval or provider readiness.
No deployment, public lab enablement or paid infrastructure.
