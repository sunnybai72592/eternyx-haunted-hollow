# Docker Phase 27 — strict read-only signed-agent recovery inventory

Phase 26 (merged PR #618) protects the real signed Docker agent against fabricating a failed outcome after an ambiguous Docker attempt. An exclusive recovery lock and the original `reserved → attempted` journal must remain in place for independent incident investigation.

The previous `listLabClaims()` lists at most 100 matching claim files, ignores lock files and other unexpected names, and returns a partial listing if the directory is larger. It is useful for routine compatibility but **must not be interpreted as complete signed-agent forensic clearance**.

## Operator's recommended read-only command

From the separately authorized operator host, with existing owner-private local agent journals:

    node scripts/docker-lab-recovery.mjs --strict-inventory

This command performs local filesystem reads only. It **does not** connect to a Docker Engine, Supabase or any network endpoint, initiate a claim, replay a receipt, clear a lock, repair a journal or retry an operation. It never creates a missing recovery journal directory. If you cannot inspect the actual private directory as its owning user, it **fails**.

The legacy `node scripts/docker-lab-recovery.mjs` and `node scripts/docker-lab-recovery.mjs CLAIM_UUID` remain available for compatibility, but the no-argument list **is not a complete journal and lock security audit**.

## What it checks

1. The real recovery directory exists, is a real non-symlinked, operator-owned and owner-private directory. A missing directory is never created as a side effect.
2. **Every** file is inventoried in sorted order. There must be **no more than 100 total files**, including claims and locks. More than 100 means a **hard error**, not truncated success. Unknown, duplicate, malformed or noncanonical names fail.
3. All records must be regular, owner-private, no-follow files of at most 16 KiB (agent locks at most 2 KiB). File descriptor device/inode, size and timestamps are checked against names before/after reading. Symlinks, permissions drift and unsafe file identities fail.
4. Every `agent-UUID.lock` must contain the exact canonical `active` JSON record, matching filename identity and valid timestamp. A lock's existence **does not prove** its owner process is alive, or that it is safe to delete.
5. Each `claim-UUID.jsonl` must parse using the actual production durable-journal state machine: exact IDs, event ordering and timestamp rules. It is then cross-checked against a bounded raw-byte SHA-256 snapshot. Invalid, partially written or replaced files block the entire audit.
6. Two complete, back-to-back directory snapshots must match, including inventory, ordered records and SHA-256 fingerprints. A file added, removed, replaced or modified during inspection fails rather than certifying inconsistent evidence.
7. Correlates attempted-only claims, reserved-only claims, terminal-but-unacknowledged claims, missing locks and orphan agent locks into explicit `manual_review_required` findings. Each claim and lock retains its SHA-256 for independent private evidence custody.

## Interpretation

The output reports `disposition: "manual_review_required"` if it sees an unresolved claim or any retained lock. A claim that has only `reserved` is **not proof** a mutation was never sent: the process may have died during journaling. An `attempted` claim is **UNKNOWN** until independently investigated even if another read-only Docker inspection sees the desired container state.

A durable terminal claim without an acknowledgement remains a manual-reconciliation case. The tool **never** sets `receiptReplayAuthorized` true. It cannot prove whether a lock is stale or currently active, verify the cloud receipt, attest physical isolation, or authorize a container mutation.

**Do not remove an agent lock or its journal, auto-retry a claim, or use `--resend-receipt` on the basis of this report alone.** Review the operator's local process list, original signed claim/permit, stable real Docker state, source/version pins, remote server receipt status and independent site controls under a separately approved incident runbook.

## CI boundary

Run:

    node --test tests/docker-strict-recovery-inventory.test.mjs

The dedicated workflow validates the actual production `lockLabAgent`, `reserveLabClaim` and `appendLabEvent` fsynced files in disposable local directories. It checks overflow, symlinks, permissions, changed JSON, orphan locks, missing directory, missing locks and real recovery CLI invocation with a private HOME. It never accesses an actual Docker Engine or hosted staging environment.

**Still required before a field release:** actual physically isolated host acceptance; independent operator signoff; real signed agent interruption staging proof; secure receipt-only recovery checks. CI passing is not host or production authorization.
