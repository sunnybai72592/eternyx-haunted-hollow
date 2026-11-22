# ETERNYX Automation Phase 2O — Evidence-Gated Investigation Plans & UTC Case Trends

## Purpose

Phase 2O gives a human operator an auditable process for investigating a real
Automation incident without conflating review with execution or remediation.
It adds authenticated investigation-plan state, fixed review step choices,
immutable review attestations, staged sign-off and a measured daily incident
activity report. Nothing automatically retries a job or restores a schedule.

## Ten improvements delivered

1. **Real evidence-gated plan creation.** Only an owner-owned incident in
   **investigating** state, at its exact current revision, and with at least
   one previously captured database evidence snapshot may receive a plan.
   One plan per incident; no fabricated plan for nonexistent sources.
2. **Six fixed, safe review actions:** review persisted evidence, inspect real
   run history, inspect workflow execution policy, check actual schedule state,
   review quarantine history, document findings/outcome. Choose any 1–6 unique
   steps. There is no arbitrary code, URL, script, schedule command or AI
   completion of these steps.
3. **Idempotent owner plan receipts.** A request UUID binds exact incident,
   revision and selected steps. Same request replays without duplicate
   creation; different content with the same UUID fails.
4. **Explicit human review notes.** Each selected step can receive one
   **human attestation** with a bounded 12–500-character note. This does not
   certify a worker is alive or a diagnostic was actually run. Repeated
   step IDs, arbitrary steps or acknowledgments outside draft are refused.
5. **Optimistic concurrency and immutable audit events.** Each step
   acknowledgment and stage transition includes the exact expected plan
   revision, request UUID and a note. Stale changes fail; replays are
   idempotent only if revision, step/stage and note match. Events are
   append-only and private.
6. **Staged manual sign-off.** A draft can become reviewed only after all
   selected steps have explicit attestations and the incident remains
   investigating. A reviewed plan may become closed only after the
   **separate** incident lifecycle reports resolved. Neither event executes,
   re-enables, approves or changes any underlying workflow.
7. **Bounded private lifecycle.** Maximum ten new plans per owner per rolling
   24 hours; at most six step acknowledgments plus two stage events per plan.
   One plan per incident. All new tables have RLS enabled, browser roles
   explicitly revoked and service-only owner-authenticated RPCs.
8. **Truthful plan detail screen.** Load the actual case revision, stored
   evidence count, plan state, acknowledged count and up to eight historical
   attestations. The interface distinguishes a human checklist from
   automated remediation, with confirmation before side-effecting review
   records.
9. **Real 7-/30-day UTC case activity.** PostgreSQL counts manually opened
   incidents and recorded resolution-transition events per UTC calendar day,
   returns exact 7 or 30 day buckets and totals, including zero-activity days.
   The graph never invents runtime failures, uptime or background alerts.
10. **Safe daily CSV export and real acceptance.** The app requires
    authenticated database report provenance and validates UTC date
    continuity, totals and counts before rendering or downloading. The CSV
    quotes cells and guards spreadsheet formulas. Node tests and a disposable
    network-isolated PostgreSQL 17 suite cover two-owner isolation,
    evidence prerequisites, immutable review events, stage gates, reporting
    and zero new workflow executions.

## Important limitations

- These steps are **operator-review acknowledgments**, not tool-verified
  results. Users should enter clear, nonsecret findings without credentials,
  personally identifying data, private customer inputs or output text.
- A completed plan remains a historical plan. If an incident is later
  reopened, the prior closure does not certify the new investigation
  complete. Case status and plan status are shown separately.
- CSV trends count actual manually recorded **incidents** and resolution
  **events**, which may differ from unique incidents if cases are reopened.
  They are not a job failure rate.
- No external webhook delivery, worker uptime, scheduling, credit charging,
  GPU use, GitHub issue creation or AI inference is performed by this feature.
- Existing Supabase execution/storage may incur usage charges; these request
  quotas are not monetary spending caps.
- Frontend case discovery lists the latest 30 owner cases. The backend still
  enforces exact owner and incident checks; no arbitrary discovery or
  cross-owner reads are supported.

## Rollout (NOT automatically performed)

1. Wait for all CI checks: isolated PostgreSQL 17 acceptance, GitGuardian,
   Node utility regressions, syntax/build/provenance, desktop and mobile
   browser journeys. Review the SQL, API and UI together.
2. Apply the migration AFTER previous phases through 2N:
   supabase/migrations/20261123110000_automation_investigation_plans.sql
3. Redeploy the authenticated automation-control Edge Function and publish
   AutomationInvestigationPlanPanel through AutomationCloudPanel. No new
   paid provider or secret required.
4. In staging, create two users, real workflow runs, owner incidents and a
   genuine evidence snapshot. Verify no plan can be created while case open
   or if evidence is missing. Reject nonowner plan modifications.
5. Simulate stale revisions, duplicate request UUIDs, unselected steps,
   incomplete draft signoff and premature closure. Assert no schedule or
   run row is changed by these review actions.
6. Validate exactly 7/30 consecutive UTC days, real event totals and
   zero-activity dates; test CSV formulas and downloaded privacy.
7. Confirm plan closure only after a **separate** incident resolution, and
   verify historical plan closure is not treated as current uptime.
8. Monitor database and hosting cost in staging; no worker process,
   background job or third-party service is provisioned in this PR.

## Verification

- tests/automation-investigation-plans.test.mjs
- tests/sql/automation-investigation-plans-db-smoke.sql
- .github/workflows/automation-investigation-plans-sql.yml
- Existing repository unit tests, production build and browser journeys

Merging this PR does not apply migrations, deploy Edge Functions or
promote frontend assets to production.
