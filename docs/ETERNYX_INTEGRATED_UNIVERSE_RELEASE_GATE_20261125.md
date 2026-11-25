# Integrated ETERNYX release gate — 2026-11-25

Decision: **HOLD production promotion**. Read-only observation is not functional acceptance. All gates are blocking unless the exact release scope is explicitly excluded and inaccessible. Do not grant access, copy real accounts, enable paid resources, repair migration history, or deploy production through this runbook.

## Observed live baseline

Run `scripts/eternyx-integrated-staging-inventory.sql` in the exact staging project (mhodwvypfbxafamkrgsk) using the management SQL interface. The committed query was executed there on 2026-11-25: 71 public tables, 0 RLS disabled, 0 directly anon SELECT-readable, 60 migrations, 2 confirmed nonanonymous Auth users, 0 admin records, 0 instructor grants, 0 workspace/team-prefixed tables and RPCs, 0 automation workflows, 0 pentest engagements, 0 service requests. The inventory always returns false for journey verification and production authorization; those decisions require separate evidence. Missing relations or failed SQL mean incomplete inventory, not success.

Production (wcncuarekaofmfurbtbh): 28 migration ledger entries from a successful count query; full ledger and catalog reads timed out. Both projects reported healthy; staging PostgreSQL 17.12.0.000, production 17.4.1.074. Staging 9 active Edge Functions, production 39. Three staging Automation functions missing from production: automation-control, automation-webhook, automation-scheduler-worker. The ctf-verified slug is also absent from production. Staging lacks 34 production function slugs; five slugs are shared. Compare function source digests, JWT settings, secrets presence (never values), API exposures, storage policies, job locks, schema objects and dependency order. Counts and deployment versions alone cannot establish parity. Staging advisor: 45 RLS/no-policy notices, 19 authenticated-executable SECURITY DEFINER warnings, 1 leaked-password warning. Review intended private/RPC-only surfaces and actual authorization tests rather than automatically opening access. Main disable-rls function returns HTTP 410; independently check deployed source/behavior before release.

## Gate A — staging acceptance

Use dedicated synthetic identities and unique fixtures, exact staging origin, publishable client credentials for real JWT tests, bounded operations, redacted evidence and scoped cleanup. Never substitute SQL role simulation for real login. Never use service-role access as positive evidence for an end user.

| Gate | Required evidence | Current blocker |
|---|---|---|
| Cybersecurity | Two distinct signed-in accounts, owner CRUD, outsider denial, private Storage/evidence gateway denial and revocation, no data leak | No engagement fixtures; review #787, #794; verify live gateway cutover state before enabling |
| Workspace | Rehearse exact 14 migrations from #793, review catalog and approve staging application; real owner/editor/viewer/outsider read/write, Realtime, Storage and revocation checks using package scripts | #793 open; zero named staging tables/RPCs |
| Automation | Two real owner JWTs; own/other workflow read/write/run, webhook replay/auth and scheduler disabled/controlled test lifecycle; worker recovery | No workflow fixtures; use #778 and #788 acceptance paths |
| Education | Four isolated identities and synthetic package; verified instructor approval/draft/publication, student enrollment/attempt/grade, cross-account denial, revoke and cleanup | No instructor or admin records; #792 merged, #799 open |
| Services | Two customers and one approved staging admin; create requests, clarification, triage, scope, status, cross-customer denial and audit history | No admin or request fixtures; existing services:staging:acceptance is read-only, add separately scoped lifecycle evidence |

For each gate retain exact commit SHA, project ref, run ID, time, fixture namespace, distinct-role verification, positive and negative outcomes, cleanup status, and independent reviewer identity. No raw tokens, PII, evidence files, or private identifiers in public GitHub logs.

## Gate B — backend deployment

1. Obtain full read-only production ledger and schema inventory; stop on timeout or ambiguous history. Map reviewed repository migrations to staging/prod ledger entries with hashes and prerequisites. Distinguish staging-only baseline wrappers from production migrations. Do not infer missing SQL by subtracting migration counts.
2. Rehearse ordered candidate on disposable PG17 with production-compatible schema only, never production records. Confirm data preservation, RLS, grants, storage and function behavior. Record rollback/forward-fix plan and independently reviewed backup readiness.
3. Deploy to staging only after relevant rehearsal and scoped approval, verify source digests and negative and positive user journeys. Keep workers and paid providers disabled unless separately authorized.
4. Require independently approved exact production migration/function manifest and rollback plan. Production changes must use an explicit protected release decision; this PR does not grant it. Re-check live drift immediately before applying, and halt if source or environment differs.
5. Post-release verify synthetic non-billing smoke, monitors, error rates and rollback triggers.

## Gate C — one integrated experience

Pin the candidate commit and frontend deployment ID. Run desktop and mobile browser acceptance across home/navigation, signup/sign-in/out/refresh, account/profile, Developer Studio, Cybersecurity/Labs, Automation, AI Arsenal/AI Video, Education, Workspace, Services, and pricing/subscription/portal. Validate each real tool produces a result or truthful unavailable state; do not represent simulations as hosted capability. Test unauthorized routes, expired sessions, offline/slow/retry, duplicate submissions, refresh, deep links, focus/keyboard, reduced motion and mobile overflow. Verify sandbox billing checkout/webhook/entitlements/portal/cancellation; no live charges in acceptance. Confirm redacted request correlation, error monitoring, alert ownership, health checks, recovery and rollback. Document manual and automated evidence, no blanket green from unit tests alone.

Final promotion decision requires independent approval of the exact candidate, all three gates, and a tested rollback plan. Until then: HOLD.
