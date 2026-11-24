# Docker Phase 40 — reviewer-owned, crash-safe, one-time host challenges

**Prerequisite:** Phase 39 / PR #740 merged. Phase 39 independently verifies challenge-bound Ed25519 signatures over the original Phase 38 read-only local host preflight, but it could verify the **same** signed bundle repeatedly because the independent reviewer had no durable challenge-consumption record. A 15-minute signature freshness window is **not** single-use protection.

Phase 40 implements **real offline reviewer-side issuance and irreversible single-use consumption**, integrated into the existing signature review CLI. It creates no Docker containers, server mutations, hosted subscriptions, signer keys, permit approvals, public API or production execution switches.

## One substantial batch — eight safety improvements

1. **Independent reviewer issues the challenge:** `scripts/docker-lab-host-challenge.mjs issue /ABS/PRIVATE-LEDGER /ABS/APPROVED-PINS.json` generates a cryptographically unpredictable 32-byte challenge with Node `randomBytes`. It never copies the challenge from a host-supplied report. Pins are taken only from the **reviewer's independently approved, private, canonical** template.
2. **Immutable original issuance:** `issue-CHALLENGE.json` is created with `O_CREAT|O_EXCL|O_NOFOLLOW`, mode 0600, full-length checked write, file `fsync`, parent-directory `fsync` and exact readback. Its fixed canonical JSON binds the challenge, UTC issuance time and **all** approved host policy/identity/attestor-key pins. No auto-repair or overwrite.
3. **Private, bounded complete ledger inventory:** a pre-existing, reviewer-owned mode-0700 real directory is mandatory. Noncanonical absolute paths, symlinked or untrusted ancestors, unexpected files, public/hardlinked entries, incomplete/oversized JSON, invalid issuance or consumed records and changes across two complete inventory passes **fail closed**. Maximum 512 entries; a full ledger needs separately approved archival, **not deletion to force a pass**.
4. **Original signed report verification remains mandatory:** the existing `verifyDockerReadOnlyHostEvidence` checks original Phase 38 hash chain, Ed25519 signature, exactly pinned key, context/daemon/image/policy/CLI/config identity, expected operation, strict false release flags and 15-minute freshness **before any successful consumption**.
5. **Enforce causal challenge timing:** original issuance must be no more than 15 minutes old, no more than two minutes in the future relative to the reviewer, and must precede the reported host inspection (up to the same explicitly bounded two-minute clock skew). An old-but-cryptographically-valid report or issue record cannot be resurrected.
6. **Atomic exclusive consumption:** after complete verification, the reviewer writes `consume-CHALLENGE.json` with `O_EXCL`, file/directory `fsync`, exact reread and full inventory audit. Its content binds the original challenge, independently pinned expectations digest and signed report digest. **Exactly one** concurrent reviewer can succeed. A crash/partial write leaves a durable forensic hold; the code never removes, reuses, resets, or silently truncates it.
7. **Integrate into the actual offline reviewer:** `docker-lab-host-evidence-review.mjs SIGNED.json TRUSTED.pub EXPECTED.json --consume-ledger /ABS/LEDGER` performs the one-time review. The original three-argument **signature-only** form remains compatible but is now explicitly labelled `challengeConsumedExactlyOnce:false` / `signature_only_challenge_replay_not_checked`. A signature-only output **must not be presented as a one-time acceptance**.
8. **Read-only status, concurrency tests and complete regressions:** `docker-lab-host-challenge.mjs status /ABS/LEDGER CHALLENGE` shows only hashed token ID, status and forensic digests. Tests exercise real Phase 38 synthetic host observations, genuine Ed25519 evidence, issuer CLI, **two separate concurrent verifier subprocesses**, incorrect keys/pins, expired/late issuance, files altered/partially written, permissions/symlinks, repeat rejection and previous Phase26–39 Docker safety suites, with a dedicated no-Docker CI workflow.

## One-time independent reviewer workflow

First, independently approve the operator's expected container/context/daemon/image/policy/CLI/config pins and the dedicated attestor public key. Prepare a **reviewer-authored**, canonical, compact `approved-pins.json` with these **nine exact keys in this order**, as approved in your trusted release records:

```json
{
  "operatorTargetSha256": "64-hex",
  "approvedContextSha256": "64-hex",
  "approvedDaemonIdSha256": "64-hex",
  "approvedImageSha256": "64-hex",
  "approvedPolicySha256": "64-hex",
  "approvedClientSha256": "64-hex",
  "approvedConfigManifestSha256": "64-hex",
  "observationOperation": "stop",
  "publicKeySha256": "64-hex"
}
```

**The placeholders above are not valid pins.** The template must be written as exactly `JSON.stringify(template)+"\n"` using real independently approved 64-character lowercase values, and mode 0600. Never derive them from the incoming signed host report. The `publicKeySha256` is the SHA-256 of the *raw 32-byte* Ed25519 public key, not the text file.

The reviewer prepares a private existing ledger (mode 0700) and issues a fresh challenge:

```sh
umask 077
mkdir -m 700 /ABS/PRIVATE/reviewer-host-challenge-ledger
node scripts/docker-lab-host-challenge.mjs issue \
  /ABS/PRIVATE/reviewer-host-challenge-ledger \
  /ABS/PRIVATE/approved-pins.json > /ABS/PRIVATE/issued-once.json
```

The issued JSON includes an `expected` object containing all nine independently approved values plus the new challenge, in Phase39's required canonical order. Save that exact object to a separate private, compact, one-line `/ABS/PRIVATE/expected.json` file (0600), **without editing its values**. Retain the issuance digest and challenge in independent change-control records. Send only the challenge and the separately approved operation/target to the host operator. Never give the host operator the reviewer's private ledger.

The **already-approved, non-root, isolated Linux operator** uses Phase 39's integrated real read-only preflight, with both execution flags disabled, on a pinned disposable target:

```sh
node scripts/docker-lab-host-preflight.mjs --read-only \
  FULL_64_CHARACTER_CONTAINER_ID stop \
  --sign-evidence /ABS/PRIVATE/host-attestor.pk8 \
  --challenge REVIEWER_64_HEX > /ABS/PRIVATE/signed-host-preflight.json
```

On the **independent reviewer machine**, with a trusted clock and separately pinned owner-only public key, consume the challenge **exactly once**:

```sh
node scripts/docker-lab-host-evidence-review.mjs \
  /ABS/PRIVATE/signed-host-preflight.json \
  /ABS/PRIVATE/pinned-host-attestor.pub \
  /ABS/PRIVATE/expected.json \
  --consume-ledger /ABS/PRIVATE/reviewer-host-challenge-ledger \
  > /ABS/PRIVATE/one-time-reviewed.json
```

A successful outcome includes `challengeConsumedExactlyOnce:true` and `reviewerOwnedLedgerVerified:true`. Repeating the review against the same challenge fails, even if the Ed25519 signature is otherwise valid and fresh. `status` can inspect the immutable consumption without changing it. A failed verifier or interrupted write must be investigated; do not delete the file or create a new ledger to override a failed acceptance. Archival, immutable backup, time synchronization and who is allowed to issue challenges remain the responsibility of independently approved reviewer operations.

## Security boundaries

A local reviewer-account attacker can still tamper with its ledger, and a compromised root/kernel/attestor key can forge plausible observations. These files are **durable local one-time evidence**, not a distributed consensus service or immutable hardware attestation. If multiple reviewer hosts are used, each must coordinate through **one authoritative protected ledger**; isolated copies are not globally replay-proof. One-time consumption is not Docker execution authorization.

A successful result still reports `physicalHostIsolationIndependentlyProven:false`, `productionDeploymentAuthorized:false`, `stagingMutationAuthorized:false`, `dockerOperationExecuted:false`, `receiptAccepted:false`, and `operatorSignoffRequired:true`. Separate **physically isolated, independently witnessed real-host** start/stop/crash-recovery/revocation/receipt drills and production change control remain indispensable. The CI suite uses only synthetic fixtures, ephemeral local files and cryptographic operations; no real Docker daemon, Supabase function, paid infrastructure or cloud secret is called.
