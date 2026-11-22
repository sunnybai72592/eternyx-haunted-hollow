# ETERNYX Automation Phase 2M — Evidence-linked Incident Cases and Manual Recovery Reviews

## What this milestone does

Phase 2M builds a genuine owner-only operational case management layer on
the existing deterministic text-workflow platform. It works with **persisted
database records**, not fabricated alerts, and does not add paid APIs,
background incident bots, automatic workload retries, or external writes.

### Ten improvements bundled into this PR

1. **Verified incident evidence**: create a case only when an existing
   owner-owned completed run, failed schedule state, expired schedule lease,
   or previously recorded quarantine receipt exists.
2. **Honest semantics**: a completed run may be manually flagged for
   investigation; completion itself does not indicate a failure. Failed
   schedule/expired lease claims require current database evidence when opened.
3. **Per-incident severity and review notes**: bounded low/medium/high cases,
   a clear human-authored title and note; source metadata snapshot includes
   only run counts or schedule states, never plaintext inputs, ciphertext,
   credentials, API tokens or webhook secrets.
4. **Duplicate and quota safety**: unique owner/source incident, durable
   creation UUID idempotency, maximum 10 newly opened cases per rolling 24h
   and at most 20 unresolved cases per owner account.
5. **Explicit case lifecycle**: open → investigating → resolved; resolved
   cases can be reopened for investigation. Never represent a review decision
   as automatic workflow restart.
6. **Optimistic revisions + replay guard**: every case transition requires
   an exact current revision and bounded review note, with a fresh request
   UUID. Same-key retries are idempotent, stale revisions and invalid
   state transitions fail closed.
7. **Append-only timeline**: a per-incident, owner-only activity history
   includes opening and subsequent status transitions, prior/current states
   and review notes; up to 30 events per case, no client-side invented events.
8. **Factual case analytics and filtering**: measured counts for open,
   investigating, resolved, high-severity unresolved, linked schedule sources
   and completed-run reviews; server-side status/severity filters and a
   clearly identified 30-case list cap. These are manually reported cases,
   NOT complete infrastructure failure statistics.
9. **Quarantine review gates**: inspect an existing schedule quarantine
   receipt and its current schedule state. Only a still-disabled, unleased
   schedule at the exact quarantine revision can be reviewed. The owner
   records one of two explicit decisions: keep quarantined or reviewed for
   **separate manual** restoration, with a rationale. One decision per receipt,
   max five per rolling 24h, replay-safe.
10. **No-action security + acceptance**: all incident/review writes use an
    authenticated Edge Function and service-only, RLS-enabled PostgreSQL
    tables/functions; Node regressions and isolated PostgreSQL 17 tests
    verify tenant isolation, evidence validation, revision fencing, timelines,
    real quota boundaries, and that no workflow run or external operation
    is started by an incident/review action.

## Important security boundaries

- The incident inbox is **manual case management**, not an alerting agent
  that detects every failure. A factual source-evidence snapshot records
  what was observed **at creation**; it does not prove ongoing current state.
- A resolved incident does NOT restart a scheduled task, unblock a policy,
  approve a webhook request, authorize a GitHub write, or delete audit
  records.
- A review called "reviewed for manual restore" is **advisory**. It never
  re-enables the schedule. Separate existing Schedule Controls, including
  their authorization and quota restrictions, remain required.
- Quarantine records may be cleaned up through Phase 2L's opportunistic
  retention, so old receipts might not remain available for new review.
  Review decisions already recorded remain in the separate private ledger.
- Case notes persist. Do NOT enter access tokens, passwords, sensitive
  customer data, raw workflow inputs or confidential output text.
- Existing Supabase hosting/storage may cost money. These request quotas
  are not a monetary budget guarantee.
- There is no claim that worker liveness, external webhook connectivity,
  upstream failure rates or future recovery success are verified here.

## Deployment (not performed by PR creation or merge)

1. Review all code and wait for GitGuardian, isolated PostgreSQL 17,
   Node utility tests, production application build, release provenance,
   desktop/mobile Chrome acceptance, and repo protection checks to pass.
2. Apply migration:
   supabase/migrations/20261123090000_automation_incident_management.sql
   after all preceding Automation migrations through Phase 2L.
3. Redeploy authenticated automation-control Edge Function, then publish
   AutomationIncidentCenter and the integrated AutomationCloudPanel.
   No new external service key, paid provider or GPU is necessary.
4. In staging, create owner A and B with completed real workflow runs.
   Verify A cannot create cases from B's run or read B's incident timeline.
   Verify a manually flagged completed run isn't labeled as a detected failure.
5. Verify a schedule must actually be failed or have an expired lease before
   the backend permits the corresponding case. Test actual stored quarantine
   receipt evidence and one-case-per-source replay.
6. Exercise open → investigating → resolved → investigating with version
   conflicts, duplicate UUID attempts, immutable original notes, 10/day
   case creation and 20-unresolved active case quotas.
7. Inspect an active leased schedule; a review must NOT bypass its lease.
   After an actual quarantine, review it while disabled at the correct
   revision, and verify its enabled state remains false with **zero new
   completed runs**.
8. If a separate manual restoration is eventually desired, use the
   existing user-controlled Schedule Controls and verify their independent
   signing/quotas/worker settings. Do not auto-retry incidents.
9. Monitor storage and access permissions. No production changes, deployments,
   secret mutations or third-party actions occur merely by merging this PR.

## Verification

- node --test tests/automation-incidents.test.mjs
- The repository's normal Node tests, syntax checks and production build
- GitHub Actions: Automation Incident Management and Recovery Review SQL
  Acceptance, using disposable networkless PostgreSQL 17

This milestone is a real incident-management foundation, not a claim that
the whole ETERNYX platform now has automated root-cause analysis.
