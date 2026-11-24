# Docker Phase 42 — independent witness evidence, pinned lifecycle linkage and one-time acceptance

**Prerequisite:** Docker Phase 41 / PR #772 merged. Phase 41 adds *read-only* before/after rootless Docker lifecycle observations and a pure independent comparison. Phase 39 authenticates a separate *read-only before-action* host preflight; Phase 40 offers a durable reviewer-issued and exactly-once-consumed challenge. No previous phase independently witnessed a staged lifecycle change.

Phase 42 binds **the original Phase 39 signed baseline, both original Phase 41 lifecycle captures and their verified comparison** to a **second, independently pinned Ed25519 witness identity**. It reuses the actual Phase 40 private challenge ledger, rather than inventing a weaker replay guard. This is an *offline human witness statement*, **not cryptographic proof that an action happened on a physically isolated host**.

## Seven substantial improvements in one PR

1. **Cryptographic cross-phase binding:** the host-signed preflight must match the Phase 41 *before* capture for approved container, context, daemon, image, hardened policy, hash-pinned Docker CLI/config, intended operation, observed pre-state and original private recovery inventory digest. The preflight and before capture must be at most 2 minutes apart. The after capture must follow before by at most 15 minutes, with Phase 41's original lifecycle epoch/status checks.
2. **Independent witness key:** witness signing requires a separate Ed25519 key **different from the host attestor's key**. Private-key loading reuses Phase 39's owner-only, O_NOFOLLOW bounded real-file gate. An independent reviewer pins the witness's *raw* public key SHA-256 rather than trusting a key provided in the signed bundle.
3. **Explicit witness acknowledgment:** no default signing. The signing CLI requires the literal `--attest-independent-witness` argument, which states that a human is authenticating **their statement of review only**, not authorizing Docker action. The witness signature must follow the post-action read-only observation by no more than one minute.
4. **Exact domain-separated Ed25519 message:** covers the original Phase 39 signed-bundle digest, Phase 41 before and after snapshot hashes, Phase 41 comparison digest, independently retained host/policy pin digests, challenge, and UTC witness time. Missing/reordered/extra fields, altered lifecycle snapshots, forged approval flags, noncanonical signatures, swapped keys or expired/future-dated evidence fail closed.
5. **Mandatory one-time reviewer acceptance:** the review CLI first authenticates the **host signature**, verifies independent Phase 41 pinned lifecycle consistency, authenticates the **distinct witness signature**, and only then calls Phase 40's **O_EXCL + fsync** challenge consumption. A second or concurrent reviewer cannot both succeed; interrupted writes still leave immutable forensic holds. It cannot bypass consumption through a signature-only success mode.
6. **Private canonical offline CLI:** `scripts/docker-staging-witness-evidence.mjs` has a strictly read-only `sign` and a `review` command. Both use bounded, canonical one-line JSON, absolute paths, O_NOFOLLOW reads, owner-only reviewer pin and public-key files, explicit distinct keys and generic sanitized failure messages. No Docker binary invocation, Supabase API call, claim write or deployment.
7. **Tests, no-Docker CI, runbook:** synthetic Phase 38 real evaluator + Phase 39 signed baseline + Phase 41 before/after start/stop/restart objects + Phase 40 issued challenge, genuine two-key Ed25519 verification, adversarial input tamper, stale clocks, key-reuse refusal, local concurrent independent review subprocesses, and all previous Phase 26–41 offline safety suites.

## Reviewer/operator sequence — manual and separate approval required

1. An independent safety/release reviewer first approves the **actual physically isolated, non-production rootless Linux host** through separate trusted controls. The CI suite cannot attest an actual host or network.
2. Independently pin the host attestor's Ed25519 public key and target/context/daemon/image/policy/CLI/config values as described in Phases 39–40. Independently pin a **different** witness public key's SHA-256. Keep both private keys out of source control and shared logs.
3. The reviewer issues a single fresh challenge using Phase 40's `docker-lab-host-challenge.mjs issue` from the same owner-private ledger, retaining the immutable issuance record. This **must be an unconsumed challenge**; do not separately consume it during the Phase 39 baseline.
4. The approved host operator (non-root, outside CI, with both lab-execution switches disabled) runs the existing Phase 39 signed `--read-only FULL_ID OP --sign-evidence PRIVATE_HOST_KEY --challenge TOKEN` **before** the separate staging action. Then capture a Phase 41 `--capture-lifecycle before FULL_ID OP` within two minutes. Both operations are read-only and carry the same original approved target and operation.
5. A distinct, independently authorized human executes and witnesses **one separate, specifically approved isolated staging action** under the original signed permit/daemon/revocation policy. Phase 42 does **not** issue a permit or perform this action. Observe the original Phase 41 `--capture-lifecycle after FULL_ID OP` promptly, ideally within a minute of the action.
6. The independent witness signs the original canonical evidence using the actual offline CLI, e.g.:

```sh
node scripts/docker-staging-witness-evidence.mjs sign \
 /ABS/host-signed.json /ABS/host-attestor.pub /ABS/host-approved.json \
 /ABS/staging-before.json /ABS/staging-after.json /ABS/lifecycle-approved.json \
 /ABS/witness-private.pk8 --attest-independent-witness \
 > /ABS/staging-witness-signed.json
```

7. A **different reviewer** on the designated trusted reviewer host performs one irrevocable review. Its files `host-approved.json` and `lifecycle-approved.json` must be independently retained Phase39/41 manifests in the exact original key order (not copied from submissions). Its owner-only `witness-pins.json` contains **exactly** `{"witnessPublicKeySha256":"<64 lowercase hex>"}` plus LF; the digest is SHA-256 of the raw 32 Ed25519 public-key bytes. Both public-key text files contain only the 43-character canonical base64url representation plus LF, mode 0600:

```sh
node scripts/docker-staging-witness-evidence.mjs review \
 /ABS/staging-witness-signed.json \
 /ABS/host-signed.json /ABS/host-attestor.pub /ABS/host-approved.json \
 /ABS/staging-before.json /ABS/staging-after.json /ABS/lifecycle-approved.json \
 /ABS/witness.pub /ABS/witness-pins.json \
 /ABS/private-original-phase40-ledger \
 > /ABS/staging-one-time-reviewed.json
```

8. Retain a reviewed evidence receipt in independent change-control storage. A **single** success means a distinct witness attestor authenticated the *claimed* staged action and one challenge was durably consumed. An already-used challenge, an incident hold, partial journal write, stale observation, unsupported host, missing independent approver, or mismatched security pin is a **hard stop**. Never delete/overwrite consumption records or regenerate a fresh challenge merely to defeat a refusal.

## Claims this phase deliberately **does not** make

Even when `separatelyPinnedWitnessSignatureValid:true` and `reviewerOneTimeChallengeConsumed:true`, output still includes:

- `independentHostIsolationProven:false`
- `actionCausalityIndependentlyProven:false`
- `permitRevocationDrillProven:false`
- `crashRecoveryDrillProven:false`
- `receiptReconciliationProven:false`
- `stagingExecutionAuthorized:false`
- `productionDeploymentAuthorized:false`

A key-holder may sign a false statement; signatures do not attest physical access, Linux kernel state, Docker daemon provenance or command causality. Witness acceptance also cannot replace **actual** isolated-host network escape/containment, signed permit revocation, interrupted/UNKNOWN recovery, receipt reconciliation, owner A/B isolation and human release approval. No production keys, staging server writes or container mutation are introduced in this PR.
