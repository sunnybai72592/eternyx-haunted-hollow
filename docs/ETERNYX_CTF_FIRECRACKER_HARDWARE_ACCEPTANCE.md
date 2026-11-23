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


## Crash-safe offline transfer recovery — transaction journal

Reviewer imports now use an **exclusive private pending journal** before any
operator receipt is created, and a **durable committed journal** only after
the exact two files have been fully written and synchronized. The two fixed
markers are:

```text
.operator-import.pending.json
.operator-import.committed.json
```

Both are root-owned, private and non-overwritable. No new public service,
cloud infrastructure, Firecracker execution, image download, or external AI
provider is involved. This journal is **local crash-integrity bookkeeping**,
not a third signature, TPM attestation, or evidence of an uncompromised host.

### Inspect a pending or completed import without modifying the case

With the same separately obtained operator fingerprint and transferred
packet SHA-256 used during original import:

```bash
sudo node scripts/cyber-range-operator-handoff.mjs --audit-import   --session 123e4567-e89b-42d3-a456-426614174001   --operator-sha OPERATOR_SPKI_SHA256   --transport-sha INDEPENDENT_TRANSFER_SHA256
```

This identifies whether the import was committed, remains pending, or is a
legacy manually staged case without a transaction journal. It identifies
missing fixed file names without printing signed content. Corrupted, foreign,
symlinked, oversized or permission-unsafe files cause an explicit error.

### Recover only the original, pinned interrupted import

First manually investigate the interrupted case and verify the independent
transfer fingerprint and hash. Restore the *original verified handoff file*
to the fixed reviewer inbox if necessary. The pending journal must exactly
match the same session, signer, transport hash and the **signed receipt and
public key bytes**. No conflicting file is ever overwritten or removed.

A separate operator approval is required for the recovery action:

```bash
export ETERNYX_OFFLINE_HANDOFF_ACK=I_APPROVE_OFFLINE_REVIEWER_IMPORT_RECOVERY
sudo --preserve-env=ETERNYX_OFFLINE_HANDOFF_ACK   node scripts/cyber-range-operator-handoff.mjs   --resume-import --confirm-import-recovery   --session 123e4567-e89b-42d3-a456-426614174001   --operator-sha OPERATOR_SPKI_SHA256   --transport-sha INDEPENDENT_TRANSFER_SHA256
```

Recovery reads the pending journal and each existing file. Identical verified
files remain unchanged; missing files are written exclusively and synced.
Conflicting inputs, a missing pending marker, or a pre-existing committed
marker all fail without replacement. The committed marker is written only
after both files match the pending record.

Finally re-run `--verify-import`. Verification requires the
committed journal and checks both exact signed inputs against the independently
pinned transfer. A **pending import blocks second-person review** through
`--inspect`, `--endorse`, and `--verify`
in the independent reviewer tool. Legacy manually staged evidence cases
without a journal can still be reviewed by a human, but cannot claim a
journal-verified import.

If a journal or file is corrupt, **do not manually delete, overwrite or
guess** its intended content. Preserve it for audit and begin a fresh
approved case/session following the organization's incident procedure.

### Free regression suite

```bash
node --test tests/ctf-firecracker-handoff-import-journal.test.mjs
npm test
npm run build
```

No actual physical KVM hardware, live 900-second expiry, cloud deployment,
production hosting bill, or independently authentic host logs are asserted
by these tests.


## Offline signed-evidence metadata consistency audit

The reviewer can now compare **operator-collected host preflight metadata and
image digest inventory** with the cryptographically pinned v2 operator receipt
before signing or verifying a reviewer endorsement. These checks are mandatory
in the reviewer workstation's `--inspect`, `--endorse` and
`--verify` file-backed commands. Older manually staged review cases
without the structured metadata formats must be migrated after retaining the
original files; the tool intentionally fails closed rather than silently
signing inconsistent sources. This does **not** replace human review of host
journals, cgroup teardown, guest transcripts or systemd timeout evidence.

### Operator-collected JSON schemas

Use the signed operator v2 receipt as the reference. The operator manually
collects the two JSON records from the **same specifically approved offline
KVM test**, without modifying an existing reviewer's signed verdict. They
must be written as canonical compact JSON produced with
`JSON.stringify(object) + '\n'` (one UTF-8 JSON object plus one
newline, no duplicate JSON keys). Both files are root-owned 0600 and placed
in the private fixed reviewer case directory using a human-approved offline
process. The independent reviewer must obtain the real underlying evidence
using a separate channel and assess its authenticity.

`host-preflight.json` example shape, with the UUID, unit and capture
time taken from the **actual** run:

```json
{
  "schemaVersion": 1,
  "classification": "operator-collected-offline-preflight",
  "sessionId": "123e4567-e89b-42d3-a456-426614174001",
  "unit": "REAL_SESSION_SYSTEMD_UNIT",
  "capturedAt": "2026-11-23T10:30:00.000Z",
  "offlineOnly": true,
  "loopbackOnly": true,
  "pinnedHostExecutables": true,
  "pinnedGuestImages": true,
  "readyForPublicHostedLabs": false,
  "publicLabsEnabled": false,
  "cloudProvisioningAllowed": false
}
```

`image-provenance.json` (these digests are illustrative and must be
replaced by the exact signed baseline's four real SHA-256 values):

```json
{
  "schemaVersion": 1,
  "classification": "operator-collected-image-digest-inventory",
  "sessionId": "123e4567-e89b-42d3-a456-426614174001",
  "capturedAt": "2026-11-23T10:00:00.000Z",
  "pins": {
    "kernelSha256": "REPLACE_WITH_REAL_SHA256",
    "rootfsSha256": "REPLACE_WITH_REAL_SHA256",
    "jailerSha256": "REPLACE_WITH_REAL_SHA256",
    "firecrackerSha256": "REPLACE_WITH_REAL_SHA256"
  },
  "imageDigestProvenanceIndependentlyVerified": false,
  "rootfsReadOnly": true,
  "publicLabsEnabled": false,
  "cloudProvisioningAllowed": false
}
```

These are **schema illustrations, not valid evidence**. Never copy the
example values as though they came from real hardware. The image inventory
time must be at or before the host preflight time, and both must be at or
before the signed operator receipt time, no more than 24 hours earlier.
The host's exact unit and session and all four pinned hashes must match the
existing Ed25519-signed baseline. Unsupported fields, claims of public
readiness, noncanonical JSON, timestamp contradictions and wrong pins fail.

One way to canonicalize operator-collected metadata from a reviewed local
JSON file (never an example pasted as evidence) is:

```bash
node -e 'const fs=require("node:fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p)); process.stdout.write(JSON.stringify(x)+"
")' /path/to/validated-source.json
```

The reviewer must re-check file provenance and must not transform a
preexisting signed file in place.

### Read-only reviewer command

```bash
sudo node scripts/cyber-range-independent-review.mjs --audit-consistency   --session SESSION_UUID   --operator-sha INDEPENDENTLY_PINNED_OPERATOR_SPKI_SHA256   --reviewer-sha INDEPENDENTLY_PINNED_REVIEWER_SPKI_SHA256
```

The audit reports whether the signed identities, four pinned image/binary
digests, offline-policy fields and metadata time windows agree. It **never**
prints raw log content, starts Firecracker, connects to a cloud endpoint,
signs a new verdict or enables hosted labs. A passing audit explicitly
reports **false** for independent source authenticity, physical host
attestation, full semantic verification of the supervisor log and production
readiness. These remain separate manual assurance tasks.

### Free and no-KVM regression

```bash
node --test tests/ctf-firecracker-evidence-consistency.test.mjs
npm test
npm run build
```

Test fixtures are fabricated local inputs only; no real KVM, 900-second
watchdog test, paid service or independently sourced hardware evidence is
collected by CI.


## Explicit signed human review disposition (new milestone)

Once an operator v2 signature, second-person file-review signature, private
handoff journal and structured consistency audit have been verified, a human
reviewer may separately record a **constrained disposition** in the same
private review case. This is a signed procedural **decision about the file
review**, not a finding that KVM, the guest, the raw host logs or
internet-facing multi-tenant deployment are safe.

### Three exact, non-operational categories

- `reviewed-for-archival`: a human confirms the documented file
  inspection was completed and the files may be retained as internal evidence.
  **This is not approval for production or independent host attestation.**
- `follow-up-required`: at least one approved gap must be recorded.
- `evidence-rejected`: at least one approved reason is mandatory.

The approved reason codes (choose in **alphabetical order**, comma-separated
with no spaces) are:

```text
guest-identity-not-cryptographically-proven
human-log-inspection-incomplete
image-origin-not-independently-established
independent-host-source-not-established
other-documented-in-private-case
source-timestamp-reconciliation-needed
systemd-watchdog-proof-needs-review
```

These codes are human findings only. The code
`other-documented-in-private-case` requires a separate private
organization-controlled case note; free-form untrusted strings are never
embedded in the signed or publicly presented record.

### Root reviewer: deliberate one-time disposition signing

For a complete internal file review without outstanding recorded gaps:

```bash
export ETERNYX_INDEPENDENT_DISPOSITION_ACK=I_APPROVE_OFFLINE_REVIEW_DISPOSITION
sudo --preserve-env=ETERNYX_INDEPENDENT_DISPOSITION_ACK   node scripts/cyber-range-independent-review.mjs   --decide --confirm-independent-disposition   --session UUID   --operator-sha EXTERNALLY_PINNED_OPERATOR_SPKI_SHA256   --reviewer-sha EXTERNALLY_PINNED_REVIEWER_SPKI_SHA256   --decision reviewed-for-archival --reasons none
```

For a review requiring further evidence, choose
`--decision follow-up-required` and one or more approved reason codes,
for example:

```bash
export ETERNYX_INDEPENDENT_DISPOSITION_ACK=I_APPROVE_OFFLINE_REVIEW_DISPOSITION
sudo --preserve-env=ETERNYX_INDEPENDENT_DISPOSITION_ACK   node scripts/cyber-range-independent-review.mjs   --decide --confirm-independent-disposition   --session UUID   --operator-sha EXTERNALLY_PINNED_OPERATOR_SPKI_SHA256   --reviewer-sha EXTERNALLY_PINNED_REVIEWER_SPKI_SHA256   --decision follow-up-required   --reasons guest-identity-not-cryptographically-proven,human-log-inspection-incomplete
```

The command refuses unsigned or altered prior reviews, inconsistent
operator-collected metadata, unfinished imports, wrong independently pinned
signer keys, invalid date order, duplicate or unlisted reasons, and attempts
to replace an existing file. It writes exactly one root-owned 0600
`review-disposition.json` under the fixed private case directory using
exclusive creation, fsync and a final directory sync. A failed/interrupted
write may require a new case under the organization's incident procedure;
do not delete or silently overwrite evidence.

### Read-only re-verification without a private signing key

```bash
sudo node scripts/cyber-range-independent-review.mjs   --verify-decision --session UUID   --operator-sha EXTERNALLY_PINNED_OPERATOR_SPKI_SHA256   --reviewer-sha EXTERNALLY_PINNED_REVIEWER_SPKI_SHA256
```

The verifier checks **three layers**: Ed25519-signed operator receipt;
separately Ed25519-signed reviewer file endorsement; and the **new
disposition signature bound to the exact earlier two JSON receipts and raw
case-file digests**. The verifier returns the selected status and controlled
reason codes; it explicitly returns
`independentHostEvidenceVerified:false`,
`physicalHostAttested:false`, `publicLabsEnabled:false` and
`productionReady:false` regardless of the disposition.

### Free CI and trust limits

```bash
node --test tests/ctf-firecracker-review-disposition.test.mjs
npm test
npm run build
```

The tests use disposable in-memory signing keys and fabricated source text;
they do not launch KVM, request paid compute, contact cloud providers, enable
public labs, sign a real human decision or prove a physical security boundary.
Production readiness and independently authenticated hardware measurements
remain a separate workstream.


## Sealed, externally pinned offline reviewer case checkpoint

This milestone adds a **local integrity checkpoint** following the existing
operator v2 signature, independent reviewer endorsement, and constrained
signed reviewer disposition. It **does not** turn an archival disposition into
hardware acceptance, source authenticity proof, or production authorization.

### Scope and coverage

The read-only inspection command re-verifies the following before computing
a deterministic private-case digest:

1. Signed operator v2 report and externally pinned operator identity.
2. Signed reviewer endorsement and independently pinned reviewer identity.
3. Separate signed reviewer disposition and its controlled outcome/reasons.
4. Structured preflight/image metadata consistency and accepted import journal
   (or explicitly legacy manually staged inputs without a transaction journal).
5. Exact raw bytes of **both public PEM keys, the three signed JSON receipts,
   host preflight metadata, image inventory, supervisor journal, cgroup-death
   file**, and any guest challenge or systemd expiry record required by the
   signed operating mode.

The sealed file only contains **file names, SHA-256 digests and lengths**,
the validated session/mode, the reviewer’s already signed disposition and
pinned public-key fingerprints. Raw private logs, VM images and signing
private keys are **not** included in the checkpoint. All unsupported input
files, missing records, wrong keys and mismatched signed evidence are
rejected by the private reviewer workflow.

### First inspect the case (read-only)

Use an isolated reviewer machine and the **externally trusted** operator
and reviewer SPKI DER fingerprints:

```bash
sudo node scripts/cyber-range-review-checkpoint.mjs --inspect   --session UUID   --operator-sha OPERATOR_SPKI_SHA256   --reviewer-sha REVIEWER_SPKI_SHA256
```

The command returns the deterministic `checkpointSha256`, the
disposition and file count, but **does not** write a file or create an
external trust pin.

### Deliberately seal exactly one private checkpoint

After independently inspecting the full original case and its actual source
provenance, record the expected SHA-256 on an **independently controlled,
tamper-resistant record** (for example, an approved paper log or audited
offline register), not only inside the review case or on the same removable
disk.

```bash
export ETERNYX_CASE_CHECKPOINT_ACK=I_APPROVE_OFFLINE_CASE_CHECKPOINT
sudo --preserve-env=ETERNYX_CASE_CHECKPOINT_ACK   node scripts/cyber-range-review-checkpoint.mjs   --seal --confirm-case-checkpoint   --session UUID   --operator-sha OPERATOR_SPKI_SHA256   --reviewer-sha REVIEWER_SPKI_SHA256
```

The CLI exclusively creates
`/var/lib/eternyx-reviewer/cases/<UUID>/case-checkpoint.json`
with root ownership, private 0600 permissions and synchronized file and
directory writes. An existing or partially written checkpoint **cannot**
be overwritten. Preserve the failure state for investigation instead of
silently deleting or modifying an evidence record.

### Verify a saved checkpoint against an *external* SHA

```bash
sudo node scripts/cyber-range-review-checkpoint.mjs --verify   --session UUID   --operator-sha OPERATOR_SPKI_SHA256   --reviewer-sha REVIEWER_SPKI_SHA256   --checkpoint-sha INDEPENDENTLY_RECORDED_CHECKPOINT_SHA256
```

The verifier reads the original case, verifies the three signatures again,
checks structured metadata, recomputes the source hashes, checks the exact
saved checkpoint bytes and compares the result with the trusted out-of-band
SHA-256. It does not load the reviewer private key, contact a host, start
Firecracker or reach a cloud provider.

**Trust limitation:** A local checkpoint SHA cannot prevent rollback if an
attacker controls both the case and the expected hash, or can replace the
external trust record. It detects differences **only** when the original
checkpoint hash was obtained and protected separately. Signatures likewise
do not independently prove the physical KVM host or source logs were honest.

The output deliberately retains
`physicalHostAttested:false`,
`independentSourceAuthenticityVerified:false`,
`publicLabsEnabled:false` and `productionReady:false`.

### Free no-VM regression checks

```bash
node --test tests/ctf-firecracker-review-checkpoint.test.mjs
npm test
npm run build
```

Tests run with disposable in-memory keys and fabricated source bytes. Neither
CI nor this feature enables public Labs, allocates paid VMs or GPUs, makes
external AI requests, or performs a real-host hardware acceptance test.


## Supplemental offline runtime-observation metadata audit

This read-only tool offers an **additional cross-check** of operational data
captured by the human operator on the dedicated offline KVM host. It is
deliberately **not part of the previously signed review**, sealed checkpoint
or a substitute for an independent inspection of real host logs. Unlike a
hardware quote, operator-supplied JSON can be fabricated or changed. **The
auditor must separately authenticate the source host and preserve genuine
original records.**

### Operator-controlled supplemental files

The manually staged private reviewer case already contains the actual,
reviewer-hashed transcripts:
\`supervisor-journal.txt\`, \`cgroup-death.txt\`, and, if applicable,
\`guest-challenge.txt\` and \`timeout-result.txt\`.

The reviewer may additionally stage the following **bounded (maximum
4096 bytes), root-owned 0600, single-link files** in the same private folder:

| Required mode | Supplemental JSON | Bound reviewed transcript |
| --- | --- | --- |
| All | \`runtime-supervisor.json\` | \`supervisor-journal.txt\` |
| All | \`runtime-cgroup.json\` | \`cgroup-death.txt\` |
| Guest vsock | \`runtime-guest.json\` | \`guest-challenge.txt\` |
| Watchdog 900s | \`runtime-timeout.json\` | \`timeout-result.txt\` |

All JSON must be **canonical one-line UTF-8**, \`JSON.stringify(document) +
"\\n"\`. The exact schema fields are:
\`schemaVersion\` (1), \`classification\` (one of the four fixed
\`operator-collected-KIND-observation\` strings), \`sessionId\`,
\`unit\`, \`capturedAt\`, \`sourceSha256\`, and \`observations\`.

The \`sourceSha256\` MUST be computed from the exact **unchanged raw
transcript file**, not from a retyped example. The \`sessionId\` and
\`unit\` must match the signed operator receipt. The \`capturedAt\` time
must fall between the original host preflight and the signed receipt
timestamp, and within 24 hours before the receipt.

The fixed \`observations\` schema for each KIND is:

\`\`\`json
{
  "supervisor": {
    "jailed": true,
    "hostNetworkDenied": true,
    "externalWatchdogArmed": true,
    "cgroupEnforced": true,
    "publicIngressEnabled": false,
    "cloudProvisioningAllowed": false
  },
  "cgroup": {
    "descendantCount": 0,
    "dead": true,
    "teardownVerified": true
  },
  "guest": {
    "localVsockOnly": true,
    "challengeResponseVerified": true,
    "guestServiceFunctional": true,
    "guestIdentityCryptographicallyProven": false
  },
  "expiry": {
    "deadlineSeconds": 900,
    "systemdTimeoutResult": "timeout",
    "cgroupDescendantCount": 0,
    "fullExpiryObserved": true,
    "cloudProvisioningAllowed": false
  }
}
\`\`\`

This block illustrates the **four separate \`observations\` objects**, not
an acceptable actual evidence file. Never fill fields from assumptions or
copy fixture values into real records. A recorded \`true\` must correspond
to actual observed host outcomes. Missing proofs must lead to review
rejection or further investigation, not fabricated metadata.

### Read-only verification (requires prior signed disposition)

\`\`\`bash
sudo node scripts/cyber-range-independent-review.mjs \
  --audit-runtime \
  --session UUID \
  --operator-sha EXTERNALLY_PINNED_OPERATOR_SPKI_SHA256 \
  --reviewer-sha EXTERNALLY_PINNED_REVIEWER_SPKI_SHA256
\`\`\`

The auditor first re-verifies the prior operator signature, reviewer
endorsement, disposition signature, preflight/image metadata and import
journal before reading these optional sidecars. Exact signed mode determines
which sidecars are needed. It refuses wrong sessions/units, unsupported fields,
extra/missing modes, digest mismatches, invalid or reordered capture times,
noncanonical JSON and any implied public/hardware-attestation claims.

It reports \`sidecarsIncludedInEarlierSignedReview:false\`,
\`rawHostLogsSemanticallyVerified:false\`,
\`independentSourceAuthenticityVerified:false\`,
\`physicalHostAttested:false\`, and \`productionReady:false\`.
**A successful result only establishes internal consistency**. An attacker
with access to operator-supplied records could produce matching sidecars and
transcripts. An independently trusted physical-host acceptance process is
still required, and public Labs stay disabled.

### Zero-cost regressions

\`\`\`bash
node --test tests/ctf-firecracker-runtime-observations.test.mjs
npm test
npm run build
\`\`\`

The tests use artificial records and in-memory keys. They cannot execute
Firecracker, call cloud APIs, create paid instances, or authorize public labs.


## Signed supplemental runtime addendum — offline reviewer

After all original operator, reviewer and disposition signatures pass, a
human reviewer may bind the **supplemental, operator-collected runtime JSON**
to the previously sealed and **externally pinned** case checkpoint with a
separate Ed25519 signature. This is a procedural signature of the reviewed
metadata bytes, **not** independent authentication of the originating host,
proof of Firecracker operation, or permission to enable public Labs.

The reviewer must first inspect the actual physical-host journal, timeout,
cgroup and guest evidence through independently trusted means. A consistent
operator sidecar and transcript hash alone do not prove either was truthful.

### Preconditions and immutable chain

- The original private reviewer case is complete: the operator v2 signed
  report, independent reviewer endorsement, human disposition, preflight and
  image inventory all verify, with no unfinished import transaction.
- The saved \`case-checkpoint.json\` is reverified against the **SHA-256
  obtained independently of the case directory**. A hash copied from the
  case itself is *not* an independent pin.
- The read-only \`--audit-runtime\` passes for the original exact session
  and signed mode (including any guest challenge or watchdog timeout files).
- The reviewer independently controls the private Ed25519 signing key; no
  operator private key is read, copied, exported or created.
- The supplemental runtime sidecars are present as **separate, private,
  manually staged files**. They are *not* retroactively inserted into the
  earlier signed v1 reviewer record or sealed original checkpoint.

The new signed record is saved exclusively at
\`/var/lib/eternyx-reviewer/cases/<UUID>/review-runtime-addendum.json\`
(mode 0600, root-owned, O_EXCL/O_NOFOLLOW, file and directory fsync).
The record contains fixed metadata, hashes and lengths for all required
sidecars, the externally pinned original case-checkpoint hash, session/mode,
existing human decision, both externally pinned public signer identities,
and a **reviewer Ed25519 signature**. It never contains raw host logs,
private keys or guest memory.

### Manual, one-time addendum signing

On the isolated reviewer machine, with a *separately obtained* original
checkpoint SHA-256:

\`\`\`bash
export ETERNYX_RUNTIME_ADDENDUM_ACK=I_APPROVE_SIGNED_OFFLINE_RUNTIME_ADDENDUM
sudo --preserve-env=ETERNYX_RUNTIME_ADDENDUM_ACK \
  node scripts/cyber-range-runtime-addendum.mjs \
  --sign --confirm-offline-runtime-addendum \
  --session UUID \
  --operator-sha INDEPENDENT_OPERATOR_SPKI_SHA256 \
  --reviewer-sha INDEPENDENT_REVIEWER_SPKI_SHA256 \
  --checkpoint-sha INDEPENDENT_CASE_CHECKPOINT_SHA256
\`\`\`

Store the returned \`addendumSha256\` in an **independent, tamper-resistant
register**, not solely on the same reviewer disk. An existing or interrupted
addendum cannot be overwritten or silently repaired; investigate incomplete
evidence and create a new approved case if needed.

### Re-verify without reading private keys

The operator's and reviewer's public Ed25519 keys and **both independent
SHA-256 pins** are required:

\`\`\`bash
sudo node scripts/cyber-range-runtime-addendum.mjs \
  --verify --session UUID \
  --operator-sha INDEPENDENT_OPERATOR_SPKI_SHA256 \
  --reviewer-sha INDEPENDENT_REVIEWER_SPKI_SHA256 \
  --checkpoint-sha INDEPENDENT_CASE_CHECKPOINT_SHA256 \
  --addendum-sha INDEPENDENT_ADDENDUM_SHA256
\`\`\`

The verifier recomputes the original verified checkpoint, verifies the three
original evidence signatures, recomputes the runtime observation consistency,
matches every sidecar's original byte length and digest, verifies the new
reviewer Ed25519 signature, and checks the **external** addendum hash.
Missing, altered, extra, foreign-session or misleadingly overclaiming files
are refused without writing anything or starting a VM.

**Trust boundary:** The addendum signer and original reviewer are the same
reviewer identity. This is *not* a new independent person and not a TPM
quote; a compromised signer or externally pinned records could still
undermine the chain. All positive verification outputs explicitly retain
\`sidecarsIndependentlyAuthenticated:false\`,
\`physicalHostAttested:false\`, \`publicLabsEnabled:false\` and
\`productionReady:false\`.

### Free regression suite

\`\`\`bash
node --test tests/ctf-firecracker-runtime-addendum.test.mjs
npm test
npm run build
\`\`\`

Tests use only locally generated disposable Ed25519 keys and fixture bytes.
They do **not** provide true KVM hardware attestation, execute real VMs,
contact any cloud/AI provider, or enable billable hosted Labs.


## Crash-safe private evidence publication (atomic/no-overwrite)

All fixed-name reviewer records and handoff-import files are now created
through a shared **offline-only atomic publisher**. This addresses the case
where power loss or process death while writing an \`O_EXCL\`-created output
might otherwise leave a visibly truncated pending marker, signed verdict,
checkpoint or runtime addendum that prevents clean recovery.

### Publication order

1. Check the root-owned 0700 case folder has no symlink redirection, that
   the destination is one of the **eight fixed approved basenames**, and that
   no old \`.eternyx-stage-*\` remnants are present.
2. Create a fresh cryptographically random **private 0600 temporary inode**
   in that same directory (never in a world-readable temporary area).
3. Write the complete bounded payload, check ownership/inode/link count and
   **fsync** the temporary file before making it visible under the final name.
4. Atomically create a **hard link** to the fixed final filename. This
   fails if the final filename already exists—even when it is a symlink.
   Existing reports are never overwritten or unlinked.
5. Unlink only the transient name from this invocation, fsync the containing
   directory, then confirm that the final file is private, single-link and
   exactly the expected length. Only then return success.

The checked outputs include the two receipt-import journal markers, both
signed operator transfer inputs, reviewer endorsement, reviewer disposition,
signed case checkpoint and independently signed runtime addendum. Original
operator keys, raw journals and newly generated signed content are **not**
rewritten. The shared writer does not create folders, execute guests,
contact networks, mutate environment approval flags or enable public labs.

### Crash and power-failure response

An interrupted write **before the hard link** may leave a private
\`.eternyx-stage-<random>.tmp\` inode. An interruption **after the link but
before the temporary unlink** can temporarily leave the final inode with
two hard-link names. Both situations are intentionally treated as requiring
manual review. The import-journal verifier and all reviewer commands refuse
leftover staging names rather than silently considering the case a legacy
hand-staged receipt.

**Never automatically delete, rename, repair or replace suspicious
evidence.** Preserve the exact private directory, stage inode and filesystem
metadata for your incident procedure. A qualified root operator can
reconcile the case with an independently retained original receipt and
checkpoints, then document an approved recovery plan. It may be safer to
start a new distinct case after preserving originals.

An exception in a live (not crash-stopped) publication call only cleans
up that call's own randomly generated temporary inode; it **never**
unlinks an existing final output or another producer's temporary file.

This is local-filesystem atomicity, not an assertion about physical
storage-device firmware or the original provenance of any receipt.
A filesystem/hardware that lies about \`fsync\` cannot be covered by this
software-only guarantee. These safety improvements have no effect on the
separate requirement for genuine manually approved hardware tests.

### Free offline tests

\`\`\`bash
node --test tests/ctf-firecracker-offline-atomic-publish.test.mjs
npm test
npm run build
\`\`\`

The tests verify atomic complete output, uniqueness under concurrent
writers, refusal of symlink/hardlink/existing outputs, protected file
permissions, strict file allowlists, simulated crash leftovers, review and
import fail-closed behavior, and zero network/VM interaction.


## Race-resistant private evidence reads

Following the crash-safe publication controls, all **offline reviewer-case**
and import-journal file reads now share one bounded private-file reader.
It is used for both signed report inputs and reviewer private/public keys.
The writer from the preceding milestone is unchanged.

### Trust and race safeguards

1. The caller first validates the fixed, private directory and filename.
   The common reader accepts only an absolute path, explicit nonnegative
   owner UID and a bounded file size of at most **128 KiB**.
2. It performs an initial no-follow \`lstat\` with nanosecond timestamps.
   Symlinks, hard-linked files, directories, non-regular devices, empty files,
   oversized files, wrong owner UID and group/other-accessible files fail.
3. The descriptor is opened with **O_RDONLY | O_NOFOLLOW | O_NONBLOCK**.
   This reduces the risk of hanging on a FIFO substituted between initial
   pathname inspection and open.
4. The opened descriptor's device, inode, link count, owner/group, mode,
   byte size, nanosecond modification time and change time must match the
   initial no-follow pathname observation.
5. After the binary bytes have been read, their *exact length* and another
   descriptor inspection must match the original state.
6. A **final no-follow pathname inspection** must match that same descriptor
   identity and metadata. Pathname substitution during a read is refused.
7. Missing files are only accepted for the import journal's optional
   markers. A file vanishing or changing **after** initial inspection never
   silently becomes a missing/legacy marker.

The reader does not parse, execute, rewrite or normalize evidence bytes, and
never starts a guest, opens network services or contacts cloud providers.

This defense narrows common pathname and read-time races but cannot
defend against a malicious local root process that controls all paths and
trusted signer keys, or independently authenticate the physical host.
Shared filesystems and hostile mounts must be assessed separately. No
software-only file read is a TPM quote or genuine hardware acceptance.

### Free local regression checks

\`\`\`bash
node --test tests/ctf-firecracker-private-safe-read.test.mjs
node --test tests/ctf-firecracker-handoff-import-journal.test.mjs
npm test
npm run build
\`\`\`

The tests include signed-integer bounds, missing-marker handling, binary
integrity, symlinks, hardlinks, wrong ownership/permissions, empty and
oversized data, and non-regular devices. CI also checks that import recovery
and all reviewer paths actually use the shared hardening. All test inputs
are disposable fixtures, not genuine hardware evidence.


## Two-pass offline case snapshot revalidation before signed publication

Each individual original reviewer file was already read through a private,
no-follow, ownership-checked descriptor. That did not guarantee a coherent
**set of files**: the operator report could be read before a different
operator PEM or host transcript was exchanged. This milestone adds a
**second read of the complete case** after collecting the originals and
additional rechecks immediately before each human-approved signed output
or checkpoint is atomically published.

### Coverage and refusal behavior

- All modes: raw operator report, pinned operator PEM, structured host and
  image metadata, systemd journal, and cgroup teardown transcript.
- Guest-vsock mode: additional guest challenge transcript.
- 900-second watchdog mode: additional timeout transcript.
- Committed imported cases: both raw pending and committed journal markers.
  Legacy manually staged cases remain eligible but **cannot claim imported
  transaction verification**.
- Later signature stages: the existing reviewer verdict and signed disposition,
  checkpoint where applicable, and mode-specific supplemental runtime JSON.
- Reviewer private/public keys are re-read before using the human signer
  to publish a new record.

The second pass re-opens each file with the existing race-resistant reader,
requires **exact raw-byte equality** (including same-length substitutions),
and re-checks the private directory against unfinished atomic-publisher
staging names before and after the pass. Any unexpected directory change
during the pass is refused. No unsigned or corrupted file gets quietly
reclassified as a missing journal marker.

The guard is integrated before writing
\`review-verdict.json\`, \`review-disposition.json\`,
\`case-checkpoint.json\`, and \`review-runtime-addendum.json\`.
The underlying publication continues to be an exclusive, crash-resistant
no-overwrite operation.

### Trust limitation

This is a **repeat-read consistency guard, not a filesystem transaction or
lock**. A sufficiently privileged malicious local actor could alter files
between final revalidation and atomic publication, especially if the
operating system, filesystem or reviewer signing key is compromised.
For stronger assurance, use an independently controlled offline reviewer
machine, immutable source capture, independent hardware provenance and
externally retained checkpoint hashes. This change does not authorize
production or public Labs, run a VM, or contact the cloud.

### Offline regression command

\`\`\`bash
node --test tests/ctf-firecracker-case-snapshot.test.mjs
npm test
npm run build
\`\`\`

Tests include three exact proof modes, committed journal records,
reviewer/addendum data, same-length modifications, missing files, unsafe
symlinks/hardlinks, wrong-owner/private-mode cases, stage remnants, and
integrations for the pre-sign recheck. All fixtures are simulated and
**not independent KVM acceptance evidence**.


## Complete, read-only offline evidence file-chain audit

The complete case audit consolidates the independently pinned and
cryptographically checked records into one **bounded, safe JSON summary**.
The report is deliberately classified
\`verified-offline-file-review-only-not-hardware-attestation\`.
It never grants permission to run or expose a hosted lab.

### Preconditions and strict checks

The case must already have the original Ed25519 operator receipt,
separately signed reviewer endorsement and constrained signed disposition,
reviewed structured host/image inventory, verified imported handoff journal
(or explicitly identified legacy manual staging), a **sealed case checkpoint**
and a **separately reviewer-signed runtime addendum**.

The verifier independently repeats these checks **read-only**:

1. Original operator signature, signer pins, reviewed raw file digests and
   independent reviewer signature.
2. Human review disposition and controlled reasons matched against the
   reviewer signature and signed operator receipt.
3. Host preflight, pinned kernel/rootfs/Firecracker/jailer digests, metadata
   timestamp order, offline policy and expected review mode.
4. Sealed case checkpoint against an independently controlled SHA-256 value,
   never a value trusted merely because it appears on the case disk.
5. Guest vsock/systemd watchdog/cgroup sidecars with exact reviewed
   transcript digests, fixed schemas and proper mode-specific source files.
6. Separate reviewer-signed runtime addendum and a **second independently
   protected SHA-256 pin**. Mixed decisions, sessions, signer identities,
   altered or missing sidecars and wrong-mode observations fail closed.
7. A final private no-follow, bounded re-read of all original files, signed
   case records, both imported journal markers when applicable, checkpoint,
   runtime observations and signed addendum. It also rechecks the reviewer
   public key. The command never reads the private signing key.

### Single offline verification command

Use the **real independently pinned values** from the organization's
separately retained trust register:

\`\`\`bash
sudo node scripts/cyber-range-complete-case-audit.mjs --audit \
  --session SESSION_UUID \
  --operator-sha EXTERNALLY_PINNED_OPERATOR_SPKI_SHA256 \
  --reviewer-sha EXTERNALLY_PINNED_REVIEWER_SPKI_SHA256 \
  --checkpoint-sha EXTERNAL_CASE_CHECKPOINT_SHA256 \
  --addendum-sha EXTERNAL_RUNTIME_ADDENDUM_SHA256
\`\`\`

This command is intentionally strict. It does not silently fall back to
a partial case audit if any layer is absent. For an earlier case without
a signed runtime addendum, use the existing individual read-only verifier
commands, but **do not describe it as a complete signed file-chain audit**.

### Understanding the result

The signed disposition maps to one of:

- \`archival-file-review-only\` — reviewed file records can be retained
  internally, **not** deployed to public infrastructure
- \`follow-up-required\` — recorded evidence gaps still need action
- \`evidence-rejected\` — human reviewer rejected the submitted evidence

The report includes the exact two pinned SHA-256 values, both signer SPKI
fingerprints, case mode, signed disposition reasons, number of signed
runtime sidecars, whether a committed import journal was verified, and the
number of bounded case records checked in the final snapshot. It does
**not** contain the private logs, captured guest transcript content,
private keys, host paths or confidential artifacts.

Every result still lists the following unresolved external assurance:

- Physical KVM source provenance and independently authenticated host logs
- Cryptographic identity of the guest and independently checked image origin
- Provider-enforced multitenant isolation and billing controls

Accordingly it always returns \`physicalHostAttested:false\`,
\`independentHostEvidenceVerified:false\`,
\`publicLabsEnabled:false\`, and \`productionReady:false\`.
The word "complete" means **complete signed offline file-chain evidence**,
not complete real-host validation, operational sign-off, independent TPM
measurement, or customer-facing readiness.

### No-cost CI and audit regressions

\`\`\`bash
node --test tests/ctf-firecracker-complete-case-audit.test.mjs
npm test
npm run build
\`\`\`

The suite tests all three modes and three dispositions, legacy versus
committed handoffs, missing layers, replayed session IDs, altered sidecars,
wrong external SHA pins, false hardware claims and CLI refusal behavior.
Only fabricated, disposable local inputs are used; no KVM instance,
network, paid services or public Labs are started.


## Portable, canonical and independently pinned offline case receipt

The complete read-only case auditor now supports a small **portable archive
receipt** for transferring the *verification summary only* to an independently
managed audit register. It does not transfer raw host journal evidence, kernel
or guest images, private keys, guest transcripts, root-owned file paths or any
signed source records.

The receipt is deterministic: identical verified source evidence and human
decision produce **the same exact JSON bytes and SHA-256** regardless of the
time the command is run or the order of input object keys. A newline is part
of the canonical UTF-8 encoding; no run timestamp or ephemeral filesystem path
is included.

### Export to a separately controlled archive (read-only case access)

First obtain the independently pinned **operator and reviewer Ed25519 SPKI
fingerprints**, original case-checkpoint SHA-256 and supplemental runtime
addendum SHA-256 from an approved source outside the case directory.

\`\`\`bash
sudo node scripts/cyber-range-portable-audit.mjs --emit \
  --session UUID \
  --operator-sha EXTERNAL_OPERATOR_SPKI_SHA256 \
  --reviewer-sha EXTERNAL_REVIEWER_SPKI_SHA256 \
  --checkpoint-sha EXTERNAL_CASE_CHECKPOINT_SHA256 \
  --addendum-sha EXTERNAL_RUNTIME_ADDENDUM_SHA256 \
  > private-archive.json
\`\`\`

The program does **not** write any files; the shell redirection above is an
explicit administrator action. Protect the exported metadata as an internal
record because it includes a session ID, signer fingerprints, outcome and
cryptographic digests. Move it only through approved **offline** procedures.

The JSON wrapper contains \`receipt\` and \`receiptSha256\`. **The SHA is
computed over the canonical newline-terminated JSON of the nested \`receipt\`,
not over the wrapper file.** Record \`receiptSha256\` *independently* on a
tamper-resistant audit ledger or approved paper record. A hash stored only
inside the same JSON wrapper is not an external trust anchor.

### Recheck saved archive metadata, with fresh private-case re-verification

Provide the same four independently controlled identity/evidence pins, plus
the **fifth external pin** retained from the archive receipt:

\`\`\`bash
sudo node scripts/cyber-range-portable-audit.mjs --verify \
  --session UUID \
  --operator-sha EXTERNAL_OPERATOR_SPKI_SHA256 \
  --reviewer-sha EXTERNAL_REVIEWER_SPKI_SHA256 \
  --checkpoint-sha EXTERNAL_CASE_CHECKPOINT_SHA256 \
  --addendum-sha EXTERNAL_RUNTIME_ADDENDUM_SHA256 \
  --archive-sha INDEPENDENTLY_RECORDED_RECEIPT_SHA256 \
  < private-archive.json
\`\`\`

The verifier reads **at most 4096 bytes from stdin** (no user-controlled
filesystem path), requires exact canonical wrapper bytes and schema, reruns
all original case verification layers, recomputes the receipt from those
freshly verified results, checks the exact stored receipt bytes, and compares
the SHA-256 to the independent external pin. A missing file, swapped archive,
modified disposition, changed digest, malformed JSON, out-of-mode sidecar or
missing external pin causes the command to fail, without partial success.

This provides archive *consistency* with a separately pinned hash, not a
signature on the export itself and not protection against compromise of the
external record. The original operator/reviewer signatures remain the only
cryptographic signer's evidence. It cannot verify the authenticity of the
underlying physical KVM host.

### Fixed safety scope and schema

Only exact allowlisted keys, decision categories and reason codes are
serializable. Unknown extra fields are rejected (rather than copied into
the export). The receipt lists the session/mode, signer fingerprints,
two pinned source-chain hashes, bounded file counts, committed/legacy import
lineage, fixed verification coverage, controlled review outcome, and explicit
unresolved independent proof gaps.

All portable report and verification statuses retain
\`physicalHostAttested:false\`,
\`independentHostEvidenceVerified:false\`,
\`productionReady:false\`, \`publicLabsEnabled:false\` and
\`privateSigningKeyRead:false\`.
The only supported outcomes are \`archival-file-review-only\`,
\`follow-up-required\` and \`evidence-rejected\`. Nothing in the export or
verification CLI starts a VM, contacts any network, enables hosted Labs or
uses a paid AI/GPU service.

### No-cost regression suite

\`\`\`bash
node --test tests/ctf-firecracker-portable-audit-receipt.test.mjs
npm test
npm run build
\`\`\`

Coverage includes all three offline evidence modes and all three human
decision categories, canonical reproducibility, legacy-versus-committed
imports, changed reviewer decisions, wrong external pins, malformed wrappers,
oversized input, injected private text, unexpected claims and safety flags.
The suite operates on fabricated metadata, not real hardware acceptance.
