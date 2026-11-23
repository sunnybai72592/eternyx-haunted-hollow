# ETERNYX Automation Phase 2P — Governed Incident Closure

## Purpose

This phase makes investigation-plan closure a **separately approved, versioned
manual decision** rather than a one-click way to mark an incident resolved.
Every guard is enforced on actual owner-scoped PostgreSQL records, including
a database trigger that protects direct calls to the legacy incident transition
function. The workflow/schedule execution plane remains untouched.

## Ten meaningful safety and operations improvements

1. **Database-enforced planned-case closure gate.** A planned incident
   cannot transition from investigating to resolved unless its plan is
   reviewed/closed, every selected manual review step was acknowledged,
   at least one actual evidence snapshot is stored, and the latest closure
   decision is an approval matching exact incident and plan revisions.
   The old incident endpoint cannot bypass this database trigger.
2. **Genuine owner-scoped closure readiness.** Read current incident
   status/revision, linked plan stage/revision, real evidence count,
   completed/required step counts, last decision and whether approval is
   still current. The response is metadata—not permission to execute.
3. **Explicit defer/approve review decisions.** A defer blocks case
   resolution; a later explicit approval can supersede a defer.
   Neither decision changes the incident status or runs a workflow.
4. **Version-locked approval.** Owner must sign the current incident
   and plan revision. A changed incident/plan version invalidates an
   earlier approval, including when a previously resolved case is reopened.
5. **Immutable closure decision ledger.** Every decision stores the
   owner, related incident/plan, exact revisions, bounded 12–500-character
   review rationale, counts of evidence and acknowledged steps and time.
   Request UUIDs provide exact idempotent retries, and conflicting reuse
   fails closed.
6. **Review budgets.** Five decisions maximum per incident and ten
   newly recorded decisions per owner in a rolling 24-hour window.
   Replay of an already accepted request does not consume another slot.
7. **Owner-only decision history.** The workspace displays up to five
   chronological factual decisions. Receipt IDs and review notes are
   private, not included in external audit exports or public dashboards.
8. **Structured legacy compatibility.** The authenticated Edge routes
   existing incidentTransition requests through a governed wrapper
   returning a clear closure_approval_required conflict when a planned
   case has not been approved. The database trigger is the independent
   final enforcement point. Historical replay requests remain idempotent.
9. **Separate, explicitly confirmed resolution.** After approval,
   the operator must separately enter a resolution note and confirm the
   existing incident status transition. This records an incident event,
   not a workflow action. Incidents without plans preserve the legacy
   incident state lifecycle.
10. **Offline acceptance and strict contracts.** Network-isolated
    PostgreSQL 17 tests validate two-user ownership, actual completed run
    evidence, plan review requirements, defer/approve, direct SQL and
    legacy RPC safety, immutable history, stale decisions after case
    reopen, and absence of new run records. Node tests validate strict
    action inputs and real UI integration. GitGuardian, production builds,
    provenance and desktop/mobile browser journeys are merge gates.

## What "approval" does NOT mean

- This is **one account owner's manual attestation**, not independent
  two-person oversight, a certificate of system health, proof that the
  listed manual review steps were performed correctly, or automatic
  root-cause determination.
- Neither approval nor a case status transition authorizes a webhook,
  new scheduled run, GitHub issue, credential rotation, remediation,
  automatic job retry, or restoration of a quarantined schedule.
- Existing plans in "closed" state can be considered again for a
  reopened incident, but only with a *fresh decision* matching the new
  incident revision. Older human attestations remain historical.
- Plans are not retroactively required for old unplanned cases.
  Those follow the older incident lifecycle. The rule applies to
  incidents that have created an investigation plan.
- Keep review notes nonsecret. Do not enter passwords, tokens,
  confidential raw inputs/outputs or sensitive customer information.
- Hosting and storage costs on existing Supabase may apply, and
  request-count limits do not guarantee a dollar budget.

## Rollout checklist — not performed by a GitHub merge

1. Wait until all checks are green: isolated PostgreSQL 17 test,
   GitGuardian, full Node utility tests, syntax/build/provenance,
   desktop and mobile browser acceptance.
2. Apply migration
   supabase/migrations/20261123120000_automation_governed_incident_closure.sql
   **after Phase 2O and all preceding Automation migrations**.
3. Redeploy the authenticated automation-control Edge Function and
   publish the new AutomationClosureGovernancePanel via AutomationCloudPanel.
   No new secret or external paid API is required.
4. In staging, create two independent users, genuine completed run
   receipts and a real case with captured evidence. Start investigation,
   create a plan and acknowledge its steps.
5. Verify planned resolution is denied before review/approval through
   both the UI and a direct call to the old incident transition RPC.
   Test low-level DB update protection as well.
6. Record defer, then approve. Check immutable receipts, duplicate
   idempotency, changed-content key conflict and daily/per-case quotas.
7. Separately resolve, then reopen. The previous decision must no
   longer authorize resolution. Record a fresh approval and test again.
8. Verify no new workflow run rows, webhook/schedule activations,
   provider calls or secret mutations result from any closure action.
9. Inspect the older no-plan incident lifecycle and make sure it
   remains backward compatible.
10. Monitor storage/access usage and protect case notes. No production
    migration or deployment has been performed by preparing this PR.

## Tests

- tests/automation-governed-closure.test.mjs
- tests/sql/automation-governed-closure-db-smoke.sql
- .github/workflows/automation-governed-closure-sql.yml
- Full repository utility tests, production build, provenance,
  desktop/mobile browser acceptance and GitGuardian
