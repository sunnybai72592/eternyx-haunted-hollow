# ETERNYX Labs — Offline Firecracker Hardware Acceptance

> **No VM is started by CI, a site visitor, Supabase, or production.** This PR adds an operator-invoked executable acceptance path for a **dedicated, already prepared Linux/KVM host**, not a public/paid hosted provider.

## Why this milestone

Previous PRs #401 and #410 added real Firecracker Unix API commands and a systemd-backed local jailer supervisor, but acceptance was simulated. This PR connects them through an explicit local-hardware test harness and closes two missing isolation/teardown boundaries.

## Eight practical improvements

1. **Actual process network-namespace ownership:** `attest()` compares the jailer MainPID's `/proc/<pid>/ns/net` nsfs device/inode to the dedicated `/run/netns/eternyx-cr-<UUID>` identity. Inspecting an unrelated loopback-only namespace can no longer masquerade as a jailed process in the host network namespace.
2. **Re-attest the physical namespace on every boot step:** the previously implemented `bootJailedMicrovm()` calls `guardian.attest()` before every Firecracker API PUT; the enhanced systemd guardian now confirms both cgroup membership **and** real network namespace membership each time.
3. **Early-failure teardown:** if pinned guest image verification or 900-second watchdog arming fails *after* a supervisor has attested the jailer, `bootJailedMicrovm()` now requests termination and requires `verifyDead()` before returning an error.
4. **A real opt-in offline hardware runner:** `runOfflineHardwareAcceptance()` joins read-only pinned host inspection, `SystemdMicrovmSupervisor.launchJailer()`, bounded Unix socket readiness, the true Firecracker `InstanceStart` API, live supervisor verification and explicit full-cgroup stop.
5. **Mandatory hardware-only approval:** boot requires Linux root plus `ETERNYX_FIRECRACKER_HOST_EXECUTION=operator_approved`, `ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS`, and `ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE=I_APPROVE_LOCAL_OFFLINE_KVM_TEST`. It rejects any non-local Docker/cloud runtime selection.
6. **Read-only operator preflight and crash audit:** `--inspect` verifies the KVM/jailer/binaries, pinned host and guest image SHA-256, exact namespace and isolated host prerequisites without starting anything; `--verify-stopped` checks systemd and the associated cgroup after a controller crash or 900-second deadline.
7. **Bounded guest observation and cleanup:** the harness must see the offline jailer alive after boot **and again after a short observation window**; all resolved launches, including malformed receipts, missing sockets, denied boot, SIGINT/SIGTERM cancellation or lost isolation, trigger supervised stop and a positive no-descendants check. If teardown is unproven, exit is an operator intervention failure, never acceptance.
8. **Dedicated no-KVM CI regressions:** unit tests exercise root/flag denial, wrong image/session/manifests, host-netns masquerade, cancellation, socket timeouts, bad boot receipts, early guest exit and cgroup failure. The CI workflow **intentionally does not perform a live KVM boot** or install the jailer.

## Local operator setup — deliberate and manual

Use a **dedicated, disposable Linux host** with cgroup v2, KVM, systemd, Firecracker and jailer. The host operator is responsible for installing and pinning approved binaries and kernel/rootfs artifacts, provisioning an exclusive non-public guest namespace (`/run/netns/eternyx-cr-<UUID>`), assigning per-session UID/GID, preparing the jailer chroot path and verifying that the guest has no network NIC, a read-only root disk and no exposed API. The ETERNYX CLI does not create any of these or download guest images.

First run the **read-only** capability audit (with literal SHA-256 hex values, not the labels shown):

```bash
npm run range:microvm:hardware -- --inspect \
  --session 123e4567-e89b-42d3-a456-426614174001 \
  --uid 22001 --gid 22001 \
  --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256 \
  --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256
```

Only on an operator-maintained KVM machine, after inspecting the preflight result and checking your emergency halt procedures, explicitly authorize a local acceptance boot:

```bash
export ETERNYX_FIRECRACKER_HOST_EXECUTION=operator_approved
export ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS
export ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE=I_APPROVE_LOCAL_OFFLINE_KVM_TEST
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK,ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE \
  npm run range:microvm:hardware -- --run --confirm-local-kvm \
  --session 123e4567-e89b-42d3-a456-426614174001 \
  --uid 22001 --gid 22001 \
  --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256 \
  --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256
```

Even on success, the script immediately tears down the VM and prints `teardownVerified:true`, `publicLabsEnabled:false` and `cloudProvisioningAllowed:false`. It does **not** expose a website or payment flow. Never put sensitive credentials inside a test guest.

After an operator process crashes or is forcibly killed, use the read-only independent systemd/cgroup check:

```bash
npm run range:microvm:hardware -- --verify-stopped \
  --session 123e4567-e89b-42d3-a456-426614174001
```

A still-running unit (even before its 900-second systemd deadline) is not reported as dead. If cleanup is not proven, use the separate explicit `range:microvm:supervisor -- --terminate UUID --confirm` operator procedure and inspect the host before clearing any launch-halt marker.

## Boundaries still requiring real-host evidence

- **No physical KVM host was accessible in this PR**, so these acceptance scripts and CI are code plus simulated supervisor/tests. The operator must actually run the test on a dedicated host and attach the resulting verified results before claiming hardware acceptance.
- A successful `InstanceStart` and process liveness are **not** proof of a fully functioning guest service or completed cyber mission. A future separately trusted vsock application probe and VM workload audit is required.
- systemd `RuntimeMaxSec=900s` is an independent configuration gate; the short acceptance smoke **does not wait 900 seconds to measure expiry**. A separate crash/expiry drill and manual `--verify-stopped` check must confirm that a real host kills and cleans the guest after the full deadline.
- Namespace inode comparison and loopback-only interfaces do not protect a compromised root host or a malicious host vsock listener. Real per-VM isolation, namespace lifecycle, image provenance, shared-kernel escape defenses, and independently audited Firecracker versions still require dedicated security review.
- The existing hosted cloud runtime is **still disabled**, and the PostgreSQL micro-USD reservation ledger remains a local orchestration control—not a provider-enforced billing hard limit. No actual paid/public hosting is authorized.

## Verify without spending or creating a VM

```bash
node --test tests/ctf-firecracker-hardware-acceptance.test.mjs \
  tests/ctf-firecracker-systemd-supervisor.test.mjs \
  tests/ctf-firecracker-boot-controller.test.mjs
npm test
npm run build
```

GitHub Action: **CTF Firecracker Hardware Acceptance Contract**. This tests the exact no-auto-launch boundary on `ubuntu-latest`, without using `/dev/kvm`.

## PR next milestone — protected operator hardware evidence receipts

A passing mocked CI run is never evidence of a real KVM host. The optional
recording mode is invoked only after a manually approved **real** acceptance
run has booted, observed, and positively torn down a guest. It creates a
single private, session-specific JSON receipt using exclusive, no-symlink
creation and flushes it to disk.

Provision the private directory **manually on the dedicated host** before
the run. Do not grant this directory to the web server or hosted app:

```bash
sudo install -d -o root -g root -m 0700 /var/lib/eternyx-firecracker/evidence
```

With the **three approval environment variables already set**, execute
the exact approved offline test as documented above, adding
`--save-evidence` immediately after `--confirm-local-kvm`:

```bash
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK,ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE   npm run range:microvm:hardware -- --run --confirm-local-kvm --save-evidence   --session 123e4567-e89b-42d3-a456-426614174001   --uid 22001 --gid 22001   --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256   --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256
```

Use **real 64-character lowercase SHA-256 digests**, not the placeholders
shown. If the receipt path already exists, recording fails; the operator
must not overwrite a previous report or silently turn it into a new
acceptance. A failed KVM run, failed teardown, or invalid receipt cannot be
recorded through this path.

To check the stored report **without booting anything**:

```bash
sudo npm run range:microvm:hardware -- --verify-evidence   --session 123e4567-e89b-42d3-a456-426614174001
```

The read-only verifier checks the exact expected session, SHA-256 checksum,
pinned host and guest image digests, root-only file permissions, unit identity,
resource limits, no-network policy, and verified teardown fields.

**Crucial limits:** This receipt is an **operator self-report with an
unkeyed integrity checksum**, not an independently signed attestation.
Someone allowed to rewrite the receipt can calculate a fresh checksum.
It does **not** validate real guest service functionality, prove the full
900-second expiry and kill drill, independently prove image origins, attest
host integrity, enforce a cloud-provider billing cap, or authorize
multi-tenant/public labs. No customer-facing execution or cloud provisioning
has been enabled.

For physical acceptance, an independent reviewer must gather real host
logs, trusted image provenance, separate expiry/cgroup teardown records,
and a guest functional vsock challenge/response before claiming those
remaining milestones are complete. GitHub CI exercises only file/receipt
contracts and faked VM state, never actual KVM.
