# Docker Phase 31 — refuse a new signed mutation when older unresolved evidence exists

PR #643 (Phase 30) introduced a durable per-container `O_EXCL` lock keyed to a full 64-character container ID. That lock coordinates new signed-agent processes using the same private local journal. However, **a claim written by an older version without any container lock** could still show `reserved`, `attempted` with UNKNOWN outcome, or an unacknowledged terminal result. The new agent could acquire the now-absent target lock and attempt another signed operation despite the older evidence.

This phase updates the **real signed agent**, not a UI placeholder. The server's Ed25519 permit, independent rootless Engine/context/image/policy pins, per-container lock and Phase 26 UNKNOWN journaling remain mandatory. Nothing enables production Docker execution.

## Protected execution sequence

1. Poll and verify the server-signed authorization and its short expiry, as before.
2. Acquire the exact target's durable exclusive lock. A second agent cannot claim this same target under the same owner-private journal directory.
3. **While holding the target lock, before creating the claim**, run the existing double-read `auditSignedAgentRecoveryDirectory()`. Only a complete, stable, owner-private, canonical inventory of at most 100 files qualifies. Refuse missing, corrupt, tampered, symlinked, unreadable, unsafe-permission or changing evidence.
4. Verify the exact newly held **container lock** and **agent lock** are in this same inventory, with the exact original agent UUID, claim UUID and 64-character container ID. A competing or orphaned agent lock with unknown target is not treated as safe history.
5. Reject any prior claim for the **same container** with `outcome=null` (including historical `reserved` or `attempted`), any unacknowledged result, or a legacy `failed` outcome, **even if acknowledged**. Pre-Phase-26 `failed` could have represented an ambiguous Docker command and cannot be upgraded to independent proof of non-execution.
6. Only after that read-only history clearance may the agent create the new claim with `O_EXCL`. After fsyncing `attempted`, it repeats the rootless daemon and last-moment Docker target inspections. Immediately before the mutating CLI call, it runs **a second complete recovery-history scan**. It must see the original new claim with precisely `reserved → attempted`, no terminal receipt, and the original matching locks; any newly appeared older unresolved claim denies execution.
7. A failed history scan never clears a lock, erases a journal, invents a signed failure receipt, or retries a mutation. Because it occurs after acquiring the local target lock, the agent keeps the exclusive agent and container locks for operator investigation. The existing UNKNOWN path after attempted journaling stays unchanged.

## What is and is not authorized

The pure `requireSignedContainerHistoryClear()` function yields a narrow `historyChecked:true` observation. It explicitly sets `executionAuthorizedByHistoryAlone:false`. This is **not** a live Docker host attestation, remote acknowledgement check, customer permission, or production release approval.

- An older acknowledged `completed` or pre-attempt `guard_denied` claim does not alone block a later, separately approved claim.
- An older unacknowledged `completed` or `guard_denied` claim **does** block until independently reconciled.
- Older `failed` claims of legacy uncertain meaning remain under review even with a stored receipt.
- An unresolved claim for **another exact container** does not itself establish risk for this target; an orphaned agent lock with **no attributable target** is denied conservatively.
- Any corrupt, truncated or unexpectedly named journal entry blocks the **entire** scan. An overfull private journal is **not** presented as complete and is never silently pruned.

All locks and journals remain in `~/.eternyx/docker-lab-journal`. No automatic lock cleanup, journal deletion, terminal outcome fabrication or history migration is performed. Review unresolved cases as a trusted operator, preserve evidence and use a separately authorized incident process. **Do not clear a lock or replay a claim based on this runbook.**

## Verification

```sh
node --test tests/docker-signed-container-history-fence.test.mjs
node --test tests/docker-container-lock.test.mjs
node --test tests/docker-strict-recovery-inventory.test.mjs
```

The dedicated CI runs these tests plus prior agent/Ed25519/UNKNOWN recovery suites with actual fsynced owner-private *temporary* journals. A fake local Docker socket or live daemon is never used. This guards a specific real-agent admission gap; real isolated-host staging, independent site safety and release review remain necessary before enabling anything outside the offline test harness.
