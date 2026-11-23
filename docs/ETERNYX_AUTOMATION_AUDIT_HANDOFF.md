# ETERNYX Automation Phase 2U — Audit Review Lineage and Manual Handoff

## Purpose

Phase 2T captures immutable private audit packages from genuine owner-owned
incident evidence and records manual review decisions. Phase 2U creates a
separate **owner-attested handoff receipt** bound to the CURRENT latest
review and CURRENT source package. It does **not** authorize release,
deployment, worker execution, CI verification, service-health checks, or
a second independent person's review.

## Ten substantive improvements in one PR

1. **Current source check:** A stored Phase 2T package is recomputed
   from its linked, actual evidence and incident/plan/audit metadata.
   Mismatched revisions, newer evidence, broken ledger invariants or
   missing source evidence invalidate current-review eligibility.
2. **True latest-review precedence:** A newer needs_attention decision
   supersedes older reviewed-for-manual-checklist attestations, even
   when the underlying incident has not changed.
3. **Exact review-linked handoff:** The operator explicitly signs a
   handoff bound to package UUID, latest review UUID and incident
   revision. Old review IDs cannot authorize a new receipt.
4. **Freshness invalidation after review changes:** If an owner later
   records another positive review, the former handoff stays historical
   and is NOT considered current until the latest review is separately
   acknowledged again.
5. **Version invalidation after case changes:** A status transition
   or evidence/plan/audit change invalidates the current handoff.
   History is never silently rewritten or deleted.
6. **Human limitations acknowledgment:** Four mandatory confirmations
   state that the owner checked the source and that CI, deployment,
   worker liveness and external delivery have NOT been verified.
   A handoff is a *one-owner* attestation, not independent two-person
   approval or a cryptographic proof of release safety.
7. **Append-only, bounded receipts:** Immutable owner-private table,
   explicit request UUID idempotency, exact intent matching, per-owner
   advisory serialization, up to four handoffs per package and up to
   twenty new handoffs per owner over a rolling 24 hours.
8. **Owner-specific handoff history:** Up to four real chronological
   receipts per package, with private 12–500-character owner notes.
   The downloadable report omits those private notes and request keys.
9. **Integrated operator UI and safe exports:** Current package freshness
   reason, latest review ID/decision/date, latest handoff ID/date,
   clearly labeled source readiness, owner confirmation, private history,
   allowlisted JSON/CSV and strictly non-executing actions. Embedded in
   Phase 2T's existing owner audit-package workspace.
10. **Real regression and database acceptance:** Node validator tests
    reject fabricated provenance, swapped identities, stale/revoked
    review lineage, false CI/deployment claims and secret-bearing
    exports. Disposable networkless PostgreSQL 17 tests run on
    *actual Phase 2T owner packages* with two accounts, valid evidence,
    negative-then-positive review, invalid/replayed handoff UUIDs,
    status revision updates and zero newly created workflow runs.

## What this does not do

- **No release authorization:** A manually reviewed package and
  handoff cannot initiate a deployment, job, webhook, schedule,
  automatic recovery, code merge, credential action or paid inference.
- **No external verification:** GitHub Actions, deployment state,
  worker health, networking, webhook delivery, runtime security or
  release approval are never queried or claimed by these functions.
- **No independent reviewer:** The receipt is signed by the
  authenticated same-account operator. It does not establish a
  second individual's identity or review independence.
- **No cryptographic tamper proof:** Database consistency compares
  existing rows with other existing rows. It does not prove
  missing records or coordinated tampering are impossible.
- **No raw private data exports:** Notes remain in owner-only
  handoff history and are omitted from JSON/CSV exports.
  Avoid personal data, credentials, tokens and customer content
  in owner-authored notes.

## Deployment, verification and rollback

1. Merge only when PostgreSQL 17, GitGuardian, Node utility tests,
   application builds, release provenance, and desktop/mobile
   browser acceptance checks are all green.
2. Apply migration
   supabase/migrations/20261123170000_automation_audit_handoff.sql
   AFTER the earlier Phase 2T and preceding Automation migrations.
3. Redeploy authenticated automation-control Edge Function and
   publish the updated AutomationAuditPackagePanel with its
   AutomationAuditHandoffPanel. No new paid provider or secret.
4. Stage two independent users and genuine run/evidence/incident
   records. Verify owner-only package assessment and history.
5. Verify latest positive review makes a current package eligible.
   Record handoff, retry same UUID, and reject changed UUID intent.
6. Record a later needs_attention decision. Confirm it revokes
   current handoff status; a new positive review must be followed
   by a new matching handoff receipt.
7. Change the case/plan/evidence and verify source staleness and
   version fencing; historical receipts remain readable.
8. Inspect private receipt data and note-free exports for
   cross-tenant access, credentials, raw workflow data and
   spurious deployment/uptime assertions.
9. Verify audit/handoff functions never create run receipts,
   resume schedules, trigger webhooks or change case state.
10. Monitor Supabase compute/storage/latency and prevent
    uncontrolled repeated handoffs. Revert deployment by rolling
    back application/Edge features; manage database migration
    reversal separately after evaluating stored owner data.

**A GitHub merge is not a database migration, Edge deployment or
frontend publish. No production release is performed by this PR.**

## Test assets

- tests/automation-audit-handoff.test.mjs
- tests/sql/automation-audit-handoff-db-smoke.sql
- .github/workflows/automation-audit-handoff-sql.yml
- Existing Phase 2T SQL fixtures plus standard Node/build/browser checks
