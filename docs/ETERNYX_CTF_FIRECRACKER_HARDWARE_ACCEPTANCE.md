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


## Follow-on milestone: optional guest vsock proof + separate 900-second drill

Neither optional mode is enabled by default. This PR adds runnable **operator-only**
paths and mocked CI regressions, but **does not assert that an actual physical
KVM test has occurred**. The normal `--run` acceptance still stops the VM
after a one-second liveness observation.

### Guest proof (real vsock host-to-guest challenge)

The guest probe connects exclusively to the pre-staged jailed Firecracker
`/v.sock` Unix socket (not TCP), sends `CONNECT 5501`, expects
Firecracker's `OK <port>` line, then sends a fresh 256-bit challenge and
validates a session-bound SHA-256 response. Host cgroup/netns and watchdog
attestations are repeated before and after the exchange.

An independently approved, pinned guest rootfs **must contain and explicitly
start** the reference Python service at
`infrastructure/cyber-range/guest/eternyx_vsock_probe.py` on AF_VSOCK
port 5501. This PR does NOT install it, edit the rootfs, fetch images,
enable service startup, or configure any network interface. If the guest image
has no service, the optional probe fails closed and kills the VM.

After the existing root-only triple approval, the operator adds
`--probe-guest` immediately after `--confirm-local-kvm`:

```bash
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK,ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE   npm run range:microvm:hardware -- --run --confirm-local-kvm --probe-guest   --session 123e4567-e89b-42d3-a456-426614174001   --uid 22001 --gid 22001   --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256   --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256
```

This tests **guest service challenge responsiveness**; it is NOT signed
guest identity, independent source provenance, root-host integrity, application
security or a production service audit. A compromised host could impersonate
this lightweight service.

### Deliberate full watchdog timeout drill

This test deliberately keeps a disposable, already approved local KVM guest
running long enough for its independent `systemd RuntimeMaxSec=900s`
to expire. It is **not suitable for CI or production** and requires an
additional explicit root-operator approval flag:

```bash
export ETERNYX_FIRECRACKER_EXPIRY_DRILL=I_APPROVE_LOCAL_900_SECOND_WATCHDOG_DRILL
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK,ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE,ETERNYX_FIRECRACKER_EXPIRY_DRILL   npm run range:microvm:hardware -- --run --confirm-local-kvm --expiry-drill   --session 123e4567-e89b-42d3-a456-426614174001   --uid 22001 --gid 22001   --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256   --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256
```

The observer verifies the VM is alive and isolated near 840 seconds after
launch, checks actual cgroup death around the configured deadline, and
requires `systemctl show ... -pResult` to report `Result=timeout`.
The explicitly authorized drill launches without systemd `--collect` so
its timed-out unit result remains queryable until the independent observer
reads it. Normal short tests still use `--collect`. If systemd nonetheless
cannot report that result, the drill **refuses to call it proven**.
The original runner still performs an independent termination and no-descendant
check on completion or failure. Cancellation is fail-closed. A host crash
requires the existing separate `--verify-stopped` operator audit.

`--probe-guest` and `--expiry-drill` can be combined for one
manual run. `--save-evidence` is intentionally incompatible with both:
the v1 receipt schema does **not** attest these stronger claims, so reporting
them as documented acceptance evidence would be misleading. No user-facing
lab or cloud billing integration is enabled.

### No-cost verification

```bash
node --test tests/ctf-firecracker-guest-probe-expiry.test.mjs   tests/ctf-firecracker-hardware-acceptance.test.mjs
npm test
npm run build
```

The tests use fake Unix sockets, simulated time and mock systemd results.
Actual 900-second execution and its evidence **must** be collected on an
approved disposable Linux/KVM host and independently reviewed before treating
the drill as hardware-verified.


## Next milestone — operator-signed v2 evidence, entirely offline

This adds a distinct **Ed25519 operator-signed receipt** for the manually
approved `--probe-guest` and/or `--expiry-drill` modes. The v1
checksum-only receipt and short smoke path remain unchanged. Signing occurs
**only after the guest shuts down and the systemd cgroup is verified empty**.
A failed guest proof, unproven 900-second expiry, or failed teardown prevents
a signed success record.

### Key setup on a dedicated disposable Linux host

The local operator prepares a private, root-owned signing directory and
creates a unique Ed25519 keypair using **OpenSSL**. Do not commit private keys,
upload them to Supabase, or put them inside the VM. Example:

```bash
sudo install -d -o root -g root -m 0700 /etc/eternyx-firecracker/keys
sudo install -d -o root -g root -m 0700 /var/lib/eternyx-firecracker/evidence
sudo openssl genpkey -algorithm ED25519 -out /etc/eternyx-firecracker/keys/attestation-ed25519.pem
sudo chmod 0600 /etc/eternyx-firecracker/keys/attestation-ed25519.pem
sudo openssl pkey -in /etc/eternyx-firecracker/keys/attestation-ed25519.pem   -pubout -out /etc/eternyx-firecracker/keys/attestation-ed25519.pub.pem
sudo chmod 0644 /etc/eternyx-firecracker/keys/attestation-ed25519.pub.pem
sudo openssl pkey -pubin -in /etc/eternyx-firecracker/keys/attestation-ed25519.pub.pem   -outform DER | sha256sum
```

The SHA-256 above is the public key's **SPKI DER fingerprint**, not the SHA
of the PEM text. A separate reviewer should record that fingerprint via a
trusted channel before the hardware test. Without an independently pinned
fingerprint, verifying a self-supplied public key would not establish a
meaningful signer identity.

### Explicit signing of a manually approved guest or watchdog run

After establishing the existing **three local hardware approvals**, and the
additional expiry approval if using the 900-second drill, include
`--save-signed-evidence-v2` and the externally recorded
`--trusted-pubkey-sha` fingerprint:

```bash
sudo --preserve-env=ETERNYX_FIRECRACKER_HOST_EXECUTION,ETERNYX_RANGE_OPERATOR_ACK,ETERNYX_FIRECRACKER_HARDWARE_ACCEPTANCE   npm run range:microvm:hardware -- --run --confirm-local-kvm   --probe-guest --save-signed-evidence-v2   --session 123e4567-e89b-42d3-a456-426614174001   --uid 22001 --gid 22001   --kernel-sha KERNEL_SHA256 --rootfs-sha ROOTFS_SHA256   --jailer-sha JAILER_SHA256 --firecracker-sha FIRECRACKER_SHA256   --trusted-pubkey-sha TRUSTED_SPKI_SHA256
```

If running `--expiry-drill`, also set the earlier separate
`ETERNYX_FIRECRACKER_EXPIRY_DRILL` approval flag and preserve it with
`sudo --preserve-env`. You can select both optional proof modes for one
signed receipt. The normal command still requires a prepared, pinned guest
image and a dedicated, authorized KVM host. **CI never generates or saves
a hardware-signed receipt, launches KVM, or spends money.**

After a successful test and teardown, the CLI writes a bounded, immutable
`<session>.v2-signed.json` file under
`/var/lib/eternyx-firecracker/evidence` using restrictive
permissions, exclusive create and directory synchronization. Existing
filenames are never overwritten. Protect the private key from backup leaks,
operator cross-access and untrusted root sessions.

### Independent read-only verification

The reviewer needs the public PEM and a separately trusted fingerprint. The
verification path **never loads the private key**, launches a guest, opens a
Firecracker socket, or calls a cloud service:

```bash
sudo npm run range:microvm:hardware -- --verify-signed-evidence-v2   --session 123e4567-e89b-42d3-a456-426614174001   --trusted-pubkey-sha TRUSTED_SPKI_SHA256
```

This verifies the Ed25519 signature, exact session and mode, pinned
public-key fingerprint, v1 baseline checksum, pinned host and guest SHA-256,
offline policy, and the separately reported challenge/timeout outcomes.
Missing post-boot validations, a changed key, an altered field, or a
non-private receipt are rejected.

**Trust limits:** This is an **operator-signed account of the run**, not TPM
or independently measured host boot attestation. A compromised host/root
operator holding the signing key could forge plausible statements.
The lightweight vsock challenge is also not a signed guest identity proof.
Independent reviewers must still obtain and correlate real host logs,
image provenance, actual unit timeout output and functional mission evidence
before accepting it as a physical hardware security result. It does not
enable public multi-tenant labs, remote user execution, or
provider-enforced billing limits.

### Free CI checks

```bash
node --test tests/ctf-firecracker-operator-evidence.test.mjs   tests/ctf-firecracker-guest-probe-expiry.test.mjs   tests/ctf-firecracker-hardware-evidence.test.mjs
npm test
npm run build
```

The tests generate disposable in-memory/test-directory signing keys to
exercise rejection cases; **no operator signing key is generated in CI**.

## Stacked follow-up — independently pinned second-person file review

This follow-up adds a separate **offline reviewer workstation** workflow.
Its purpose is to verify that a real operator signed one specific v2 test
result and that a human reviewer examined a fixed collection of source files.
It does **not** claim TPM attestation, actual hardware-trust measurements,
real systemd provenance, or acceptance of a public multi-tenant cyber range.
A second signature proves who endorsed the evidence, not that its sources
are independently authentic.

### 1. Prepare a separate trusted reviewer machine

Use a dedicated, offline reviewer workstation, separate from the Linux/KVM
host, running Node.js 22+ and OpenSSL. Transfer source material by an
independently controlled channel. The reviewer manually creates:

```text
/var/lib/eternyx-reviewer/cases/<UUID>/
  operator-report.json
  operator-public.pem
  host-preflight.json
  image-provenance.json
  supervisor-journal.txt
  cgroup-death.txt
  guest-challenge.txt          # required when mode includes guest-vsock
  timeout-result.txt           # required when mode includes watchdog-900
```

Each case and its parent directory must be owned by root and mode `0700`.
All source files must be root-owned, regular, single-link, mode `0600`,
with no symlinks and sizes at most 128 KiB per artifact. The operator
report and public PEM must also be private files. No raw artifact is
uploaded, published, or returned to the web app.

**Required source files:** host preflight, approved pinned-image provenance,
the restricted systemd unit journal, and positive final cgroup-death proof.
The guest challenge transcript is additionally required when the signed
operator mode includes `guest-vsock`. The independent systemd timeout record
is additionally required for `watchdog-900`. The reviewer must gather and
critically inspect these materials; neither file names nor hashes alone
establish origin authenticity.

### 2. Create an independent reviewer Ed25519 identity

Generate a new key on the review workstation, not on the KVM host:

```bash
sudo install -d -o root -g root -m 0700 /etc/eternyx-reviewer
sudo openssl genpkey -algorithm ED25519 -out /etc/eternyx-reviewer/reviewer-ed25519-private.pem
sudo chmod 0600 /etc/eternyx-reviewer/reviewer-ed25519-private.pem
sudo openssl pkey -in /etc/eternyx-reviewer/reviewer-ed25519-private.pem -pubout \
  -out /etc/eternyx-reviewer/reviewer-ed25519-public.pem
sudo chmod 0600 /etc/eternyx-reviewer/reviewer-ed25519-public.pem
sudo openssl pkey -pubin -in /etc/eternyx-reviewer/reviewer-ed25519-public.pem \
  -outform DER | sha256sum
```

Store the **reviewer SPKI DER SHA-256** and the previously recorded **operator
SPKI DER SHA-256** through independently trusted channels. They must differ.
Do not trust a public-key fingerprint fetched solely from the packet being
reviewed. The private reviewer key must never be committed or sent to the
guest, the operator, Supabase, or GitHub.

### 3. Inspect, endorse and verify (fully offline)

Inspect the fixed, private case files without signing anything:

```bash
sudo node scripts/cyber-range-independent-review.mjs --inspect \
  --session UUID --operator-sha OPERATOR_SPKI_SHA256 \
  --reviewer-sha REVIEWER_SPKI_SHA256
```

Only after personally checking the independent source files and relevant
real-host logs, explicitly authorize a second-person endorsement:

```bash
export ETERNYX_INDEPENDENT_REVIEW_ACK=I_REVIEWED_INDEPENDENT_SOURCE_FILES
sudo --preserve-env=ETERNYX_INDEPENDENT_REVIEW_ACK \
  node scripts/cyber-range-independent-review.mjs --endorse \
  --confirm-independent-review --session UUID \
  --operator-sha OPERATOR_SPKI_SHA256 --reviewer-sha REVIEWER_SPKI_SHA256
```

The endorsement signs the exact session, operator v2 receipt SHA-256,
mode, reviewer and operator public-key fingerprints, and strictly enumerated
source-file digests. The program writes `review-verdict.json` as a new
private, single-write file only. It refuses replacement, unsigned source
proofs, mismatched sessions, modified contents, missing files, or use of the
operator key as the reviewer key.

Any reviewer can subsequently check the already signed file **without
loading the reviewer private key** or launching a VM:

```bash
sudo node scripts/cyber-range-independent-review.mjs --verify \
  --session UUID --operator-sha OPERATOR_SPKI_SHA256 \
  --reviewer-sha REVIEWER_SPKI_SHA256
```

This checker verifies the two signatures, exact baseline and session binding,
all required local file hashes, and the reviewer verdict. Its output
explicitly includes `physicalHostAttested:false`,
`independentSourceAuthenticityVerified:false`, and
`productionReady:false`. A passing review is procedural evidence,
**not** proof that the source host or guest was uncompromised.

### CI and availability restrictions

```bash
node --test tests/ctf-firecracker-independent-review.test.mjs
npm test
npm run build
```

CI creates only in-memory test keypairs and fabricated local fixture text.
It never signs a real operator record, runs KVM, opens public ports, downloads
VMs, invokes AI APIs or starts paid infrastructure. Public ETERNYX Labs
remain disabled until separate image, host, billing, authorization and
multi-tenant security assessments succeed.


## Offline signed operator-receipt handoff (follow-up PR)

This milestone bridges the **operator KVM test workstation** and the
**independent review workstation** without cloud accounts, automatic network
transfers, private signing-key disclosure or public ETERNYX lab activation.

The transport package includes **only**:
- the already signed **operator v2 receipt**;
- the **operator's Ed25519 public PEM**;
- exact session/mode/fingerprint/receipt-hash metadata;
- restrictive flags making clear that **no independent source files** are
  contained and **hardware is not independently attested**.

It deliberately **excludes** raw host systemd logs, cgroup snapshots,
image provenance documents, guest transcripts, independent reviewer
attestations and all private keys. Those artifacts must be separately
collected and verified by the actual reviewer, following the previous
second-person review instructions.

### 1. Operator: manual export after a real, successful offline test

The operator must already have a **verified v2 signed receipt** and its
corresponding public key at the paths from the previous section. The
\`/var/lib/eternyx-firecracker/evidence\` directory must be manually
provisioned as private root-owned \`0700\`.

A trusted reviewer obtains the operator's **SPKI SHA-256 fingerprint** via a
separate channel. On the **offline operator host**, explicitly approve only
the read-and-export step:

\`\`\`bash
export ETERNYX_OFFLINE_HANDOFF_ACK=I_APPROVE_OFFLINE_OPERATOR_RECEIPT_EXPORT
sudo --preserve-env=ETERNYX_OFFLINE_HANDOFF_ACK \
  node scripts/cyber-range-operator-handoff.mjs \
  --export --confirm-offline-transfer \
  --session 123e4567-e89b-42d3-a456-426614174001 \
  --operator-sha OPERATOR_SPKI_SHA256
\`\`\`

The command validates the existing Ed25519 receipt, signer fingerprint,
guest/drill mode, offline-only policy and exact session, then exclusively
creates a private
\`/var/lib/eternyx-firecracker/evidence/<UUID>.handoff.json\`.
The command returns a **SHA-256 of the exact canonical JSON bytes**. Record
this hash independently of the transferred USB/file. The tool has no network
transfer, remote command, cloud API, VM start, or log scraping capability.
Never use this as a substitute for an independently obtained host log.

### 2. Human-controlled offline transfer

The host operator deliberately copies **only the .handoff.json** using an
approved, scanned offline removable medium. The independent reviewer manually
places it, unchanged, under a pre-provisioned private directory:

\`\`\`text
/var/lib/eternyx-reviewer/inbox/<UUID>.handoff.json
\`\`\`

Both \`/var/lib/eternyx-reviewer/inbox\` and the handoff JSON must be
**root-owned 0700/0600**, respectively, with no symlinks or hardlink aliases.
The reviewer records the source SHA-256 and operator SPKI fingerprint using
a **separate trusted channel**. A digest carried inside the same USB bundle
is not an independent pin.

### 3. Reviewer: read-only inspection followed by exclusive import

First verify the staged packet with **both independent pins**:

\`\`\`bash
sudo node scripts/cyber-range-operator-handoff.mjs \
  --inspect --session 123e4567-e89b-42d3-a456-426614174001 \
  --operator-sha OPERATOR_SPKI_SHA256 \
  --transport-sha INDEPENDENT_TRANSFER_SHA256
\`\`\`

Prepare a private, root-owned \`0700\` case directory manually, with the
same UUID. Inspect it to ensure no existing \`operator-report.json\` or
\`operator-public.pem\` exists. The importer will **never overwrite either**
file and will refuse an ambiguous or partially completed prior import.

\`\`\`bash
export ETERNYX_OFFLINE_HANDOFF_ACK=I_APPROVE_OFFLINE_REVIEWER_RECEIPT_IMPORT
sudo --preserve-env=ETERNYX_OFFLINE_HANDOFF_ACK \
  node scripts/cyber-range-operator-handoff.mjs \
  --import --confirm-offline-receipt \
  --session 123e4567-e89b-42d3-a456-426614174001 \
  --operator-sha OPERATOR_SPKI_SHA256 \
  --transport-sha INDEPENDENT_TRANSFER_SHA256
\`\`\`

The importer creates **only two** private files in the case:
\`operator-report.json\` and \`operator-public.pem\`, both mode \`0600\`.
They are byte-for-byte linked to the externally pinned envelope and operator
signature. Writes are exclusive with file and parent-directory sync. A crash
can leave partial files; it must be **investigated and reconciled manually**
rather than silently retried or overwritten.

The reviewer can recheck the staged files **without opening a private signing
key or writing anything**:

\`\`\`bash
sudo node scripts/cyber-range-operator-handoff.mjs \
  --verify-import --session 123e4567-e89b-42d3-a456-426614174001 \
  --operator-sha OPERATOR_SPKI_SHA256 \
  --transport-sha INDEPENDENT_TRANSFER_SHA256
\`\`\`

Only after obtaining and manually inspecting **independent host evidence**
should the reviewer use the separate
\`scripts/cyber-range-independent-review.mjs --endorse\` workflow.
Import success alone **does not** prove physical KVM, real systemd expiry,
guest identity, image provenance, source authenticity or production safety.

### Free offline tests

\`\`\`bash
node --test tests/ctf-firecracker-operator-handoff.test.mjs
npm test
npm run build
\`\`\`

Tests exercise all three guest/expiry modes, Ed25519 substitution resistance,
canonical transfer digest mismatch, wrong session, signed receipt tampering,
unsupported claims, private-key leakage rejection, overlong payloads, explicit
export/import approvals and fixed production paths. CI does not create a real
host acceptance record or perform an actual USB transfer. No VM, paid GPU,
cloud service, external AI API, or public lab runtime is enabled.
