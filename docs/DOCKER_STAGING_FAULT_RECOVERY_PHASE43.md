# Docker Phase 43 — read-only fault windows, UNKNOWN hold and receipt reconciliation evidence

**Prerequisite:** Phase 42 / PR #783 merged. The original signed Docker agent has durable per-agent/per-target journals, full original recovery scans, a narrow receipt-only replay gate, and a separate local receipt-accepted evidence gate. Phase 42 binds a signed read-only host preflight and two lifecycle observations to a witness statement. **None of this proves real crash injection, signed permit revocation, or a remote server receipt.**

Phase 43 adds an operator-facing **original-journal, read-only fault/recovery matrix** and independent cross-snapshot review. It cannot run Docker, contact Supabase, send/resend a receipt, automatically clear a lock, infer a mutation from `State.Status`, or enable staging/production.

## Eight improvements in one integrated PR

1. **Original owner-private fsynced journal evidence only:** the operator CLI runs the real `auditSignedAgentRecoveryDirectory()` twice and refuses if the *complete* claim, lock and container-lock inventories change. Never accepts an uploaded JSON inventory as real host evidence.
2. **Exact independent claim/agent/container/operation pins:** require full lowercase 64-character container ID and exact agent and claim UUID, original journal identity, complete claim-file digest, valid ordered event sequence and intact per-agent lock. Require exclusive same-container lock for reserved or UNKNOWN; refuse it after terminal stage.
3. **Eight disjoint fault windows:** reserved before attempt; attempted without terminal (**UNKNOWN**); pre-attempt guard-denied; completed terminal without receipt; failed terminal (ambiguous); locally acknowledged guard-denied; locally acknowledged completed; and legacy failed with local receipt. No arbitrary label or unsupported event sequence is accepted.
4. **Use real, already-merged receipt-only fences:** only `completed_unacknowledged` or `guard_denied_unacknowledged` may pass `requireSignedReceiptReplayClear()` as *local historical evidence*. No response can authorize actual resending. Legacy failed, reserved, attempted/UNKNOWN and already-acknowledged records never become a replayable successful operation.
5. **Separate local acknowledgement from cloud proof:** only exact original `requireSignedReceiptAcknowledgedEvidence()` may establish `localAcknowledgmentHistoryValidated:true`. Even then, `remoteReceiptIndependentlyVerified:false` and `productionDeploymentAuthorized:false`, because original local acknowledgement is **not** independent Supabase/server-signature verification.
6. **Fail-closed historical and forensic controls:** full same-container history prevents another unresolved, failed or unacknowledged claim from being hidden. Unknown unrelated agent locks, missing exclusive container lock, wrong identity, public files, symlinks, malformed journals, unexpected files or forged inventory flags refuse observation.
7. **Immutable read-only before/after review:** two sanitized domain-separated SHA-256 reports can be compared only against independently pinned claim/agent/target/operation. The reviewer verifies canonical report fields, exact observed stages, fail-closed booleans, original event hashes, monotonic timestamps, a maximum 15-minute gap, and permitted local journal transitions. An unchanged UNKNOWN with stable original files is correctly classified as **hold preserved**, never successful execution; an appended fsynced terminal or local receipt line is only a local-history advance.
8. **Offline review CLI, dedicated CI and runbook:** real filesystem regression tests for all eight windows, UNKNOWN preservation, terminal-to-ack changes, guard denial, failed legacy history, retained locks and corrupted original files. Dedicated GitHub workflow reruns Phase26–42 Docker suites, the normal install/build and browser CI remains separate, and no runner contacts a Docker Engine or Supabase.

## Future operator workflow — no live host work is performed by this PR

Independent physical host approval, separate signed permit acceptance/revocation drill and original Phase40/42 attested witness records remain mandatory. Only on a **separately authorized** non-root isolated Linux staging operator machine, keep `ETERNYX_REMOTE_LAB_ENABLED` and `DOCKER_REMOTE_LAB_ENABLED` disabled.

Run:

```sh
node scripts/docker-staging-fault-recovery-review.mjs snapshot \
  /ABS/OWNER-PRIVATE/docker-lab-journal \
  AGENT_UUID CLAIM_UUID FULL_64_CHARACTER_CONTAINER_ID \
  stop attempted_outcome_unknown > /ABS/PRIVATE/incident-before.json
```

Replace the stage with the **actually expected original fault window** (one of the exact eight exported labels). An incorrect expected stage refuses observation, rather than reclassifying an incident. The CLI reports a sanitized, local SHA-256 snapshot without changing the claim or calling Docker. The journal must already exist; do not create a clean replacement journal to override an earlier hold.

After an **independently approved and witnessed** offline observation or incident triage, repeat this command with the observed expected stage and save the result to a different private file. Only a separate, trusted reviewer may supply a private canonical `approved.json` containing exactly `agentId`, `claimId`, `containerId`, `operation` (in that order), **not copied from the submitted snapshot**. Compare using:

```sh
node scripts/docker-staging-fault-recovery-review.mjs compare \
  /ABS/PRIVATE/incident-before.json \
  /ABS/PRIVATE/incident-after.json \
  /ABS/PRIVATE/approved.json
```

A positive output means **the locally fsynced signed-agent journal changed consistently or a UNKNOWN hold remained intact**; it cannot authenticate who changed the journal, an actual kernel crash, Docker mutation causality, a revoked permit, server receipt or external operator witness. If actual approval requires those proofs, stop: retain the full immutable host claim and separately conduct witnessed isolated-host interruption/permit/receipt tests and server-side owner A/B verification.

### Explicit no-go for UNKNOWN and terminal failures

- `reserved_pre_attempt`: no durable attempt recorded; do not claim Docker executed.
- `attempted_outcome_unknown`: Docker may or may not have executed; **never retry Docker or synthesize a receipt**; retain original target/agent locks and manually reconcile.
- `failed_terminal_ambiguous` or `failed_legacy_locally_acknowledged`: an agent failure is not independent proof of a safe or failed Docker mutation; retain quarantine.
- `completed_unacknowledged` / `guard_denied_unacknowledged`: a verified original local receipt-only *preflight* is not an authorization or a server acknowledgement; any actual receipt-only sending needs its existing separate explicit operator action and signed endpoint controls.
- `completed_locally_acknowledged` / `guard_denied_locally_acknowledged`: the local record reports acknowledgement; this does **not** prove server-side authentication independently.

**All success output hardcodes** `automaticDockerRetryAuthorized:false`, `automaticReceiptResendAuthorized:false`, `stagingDockerExecutionAuthorized:false`, `productionDeploymentAuthorized:false`, `remotePermitRevocationVerified:false`, `remoteReceiptIndependentlyVerified:false`, `physicalHostIsolationProven:false`, `crashInjectionIndependentlyWitnessed:false`, and `recoveryLocksAutomaticallyReleased:false`.

## Still outstanding for release

Actual independently witnessed **isolated** rootless host containment checks; real signed-permit expiry/revocation and server evidence; controlled SIGKILL before/after attempted/outcome fsync; server signed-receipt delivery, loss, duplicate and acknowledgement reconciliation; owner A/B database permissions; operator signoff. These cannot be replaced by CI simulation or a self-reported local journal, regardless of the number of passing tests.
