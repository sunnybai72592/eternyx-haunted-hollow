# ETERNYX Automation Phase 2Q — Evidence-Linked Reopening Governance

## Purpose

This phase adds a **separate, explicit manual approval gate** before reopening a
previously resolved incident that has an investigation plan. It also introduces
a unified, redacted audit trace from actual database records. A review, hold,
approval or reopening never retries a job, activates a schedule, dispatches a
webhook, invokes an AI provider or certifies worker health.

## Ten improvements in one PR

1. **Evidence-linked owner reopening**: a resolved incident with an existing
   reviewed/closed investigation plan requires explicit approval tied to a
   real owner-owned evidence snapshot and the current case/plan revisions.
2. **Fail-closed historical path**: a PostgreSQL BEFORE trigger rejects direct
   SQL and calls to the previous incident-transition function if a planned
   resolved incident is reopened without a current valid owner approval.
   Existing incidents without a plan retain their previous lifecycle.
3. **Structured verified preflight**: reads actual incident status/revision,
   plan status/revision, stored evidence count, latest reopening decision and
   whether a separate manual reopening is allowed. It does not run any job.
4. **Explicit hold/approve with bounded reason**: the owner selects a real
   incident evidence receipt, one of four controlled reasons
   (new_evidence / recurrence / incomplete_review / other) and a
   12–500-character rationale. An existing snapshot is not assumed to be
   newly captured evidence; operators should select the appropriate reason.
5. **Immutable versioned decision history**: each hold/approval records
   source evidence, case revision, plan revision, fixed reason, private note
   and monotonic decision sequence. Same-key retries replay without duplicates,
   changed-request UUID intent is rejected.
6. **Per-owner/per-case rate limits**: max 10 new reopening review decisions
   per rolling 24 hours and max 5 decisions for a single incident. A held
   case remains resolved until an explicit later approval overrides it.
7. **Separate status confirmation**: after owner approval, the operator
   separately signs off a resolved → investigating status transition with a
   new note. The existing authenticated Edge routes the old incident action
   through the governed wrapper while the database trigger independently
   enforces correctness.
8. **Version invalidation**: an approval is valid only for the case/plan
   revisions it reviewed. Once a case reopens, older reopening approvals
   cannot authorize the next reopening and older closure approvals cannot
   immediately re-resolve the new investigation.
9. **Five-ledger unified audit trace**: actual owner-only incident status
   events, evidence captures, investigation-plan reviews, closure decisions
   and reopening decisions in chronological order. No client-generated
   placeholder entries, confidential workflow text, credentials, request
   keys or review notes in the trace export. Source-specific private
   histories still retain owner-authored notes as before.
10. **Validated local audit JSON/CSV + acceptance tests**: authenticated
    source provenance and allowlisted metadata for JSON and spreadsheet-safe
    CSV; strict Node regressions; disposable networkless PostgreSQL 17 tests
    with two owners proving evidence existence, hold/approve order, exact UUID
    idempotency, cross-tenant privacy, old-RPC and raw SQL guard, case status
    revision fencing and no new execution receipts.

## Important governance limits

- Approval is **one account owner's attestation**, not independent review by
  another administrator, proof of fresh evidence, automated root-cause
  detection or independent worker-health verification.
- A reopened case keeps its historical plan and audit. It is **not**
  automatically assigned newly completed review steps, and no previous
  review is rerun. To resolve again, Phase 2P's separate closure policy
  still requires a new current-version approval.
- Case trace is metadata-only. Existing private decision-history endpoints
  expose owner-authored notes, which should never contain credentials,
  personal information or confidential customer data.
- Existing Supabase execution/storage may incur usage fees. Request
  quotas are not financial spending caps.
- Owner case discovery in the UI shows up to 30 cases. Backend functions
  enforce exact owner and source IDs even where UI discovery is bounded.
- No new paid GPU, external inference API, cron worker, email/SMS alert,
  third-party write or production deployment is performed here.

## Staging and release checklist

1. Require green GitGuardian, PostgreSQL 17 acceptance, full Node utility
   tests, syntax, production build/provenance and desktop/mobile browser
   acceptance checks.
2. Apply migration
   supabase/migrations/20261123130000_automation_governed_reopen_trace.sql
   **after** all previous Automation migrations through Phase 2P.
3. Redeploy authenticated automation-control and publish
   AutomationReopenGovernancePanel through AutomationCloudPanel.
   No new secret or external key is required.
4. In staging, create two users with real completed-run records and
   incidents; investigate, capture evidence, create plan, acknowledge the
   review and resolve with a valid Phase 2P closure decision.
5. Confirm resolved planned case cannot reopen through existing Edge action,
   direct prior RPC, or direct SQL without Phase 2Q approval. Confirm
   cross-account evidence and decision access is denied.
6. Record HOLD followed by APPROVE. Confirm only the latest monotonic
   decision is effective, duplicate UUID replay is safe, and changed
   intent under the same UUID fails.
7. Separately reopen with a new incident note. Confirm new case revision,
   stale approval blocking and Phase 2P's old closure-approval invalidation.
8. Verify unified trace metadata is genuine, ordered, owner-scoped and free
   of user notes, request fingerprints and credentials. Test local safe
   JSON and CSV export.
9. Confirm no new completed-run rows or activated schedules are caused by
   any reopen/review/audit action; monitor database/storage usage.
10. Do not treat a GitHub merge as Supabase migration, Edge deployment or
    published frontend. All production operations remain separate.

## Verification files

- tests/automation-governed-reopen.test.mjs
- tests/sql/automation-governed-reopen-db-smoke.sql
- .github/workflows/automation-governed-reopen-sql.yml
- Normal repository utility tests, build, provenance and browser journeys
