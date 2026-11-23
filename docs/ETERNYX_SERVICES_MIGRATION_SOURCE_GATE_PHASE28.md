# ETERNYX Services Phase 28 — pinned migration-source CI gate

**Scope:** offline source integrity only; **no new migration**, database write, schema change, production restart, staging fixture mutation or Supabase API call.

## Real blocker

At the November 23, 2026 check, project metadata displayed `ACTIVE_HEALTHY`, but the connected production-linked Supabase database still failed `SELECT 1` and managed migration-history requests with **connection timeout**. SQL availability is not recovered. No operator has proven which Phase 13 or Phase 14 SQL actually ran.

The repository contains **11 historical collision versions** involving 25 migration files. Services shares:

- `20261123040000` with Automation and Docker (Services Phase 13: `service_brief_amendments`).
- `20261123050000` with Automation, Docker and Workspace (Services Phase 14: `service_request_journal`).

A colliding version being listed in managed history **cannot prove which file's SQL executed**. The existing source baseline fingerprints migration contents; the Phase 28 gate reuses those fingerprints instead of inventing a second collision baseline.

## What this phase delivers

1. Adds `scripts/services-migration-source-guard.mjs`, a local no-network inventory wrapper using the existing collision-forensics `generateReport()`.
2. Blocks any unreviewed content/membership change to the fingerprinted historical collision groups.
3. Requires both specific Services Phase 13/14 files to remain in the appropriate pinned collision groups and checks source order **Phase 13 before Phase 14**.
4. Requires the Phase 13 amendment table, RLS enablement, anon revocation, restricted authenticated INSERT/UPDATE column grants, participant/owner/admin policies, review and burst triggers.
5. Requires the owner/admin amendment queue views to preserve `security_invoker=true` and the admin-only predicate.
6. Requires the Phase 14 unified journal to preserve `security_invoker=true`, anon restriction, authenticated SELECT and owner/admin access predicate.
7. Requires all six participant-visible underlying event sources in the journal and rejects referencing the internal `service_request_triage` table.
8. Rejects explicit public/anonymous SELECT or other broad write grants in these two Services migrations.
9. Emits a small static JSON verdict with identifiers, **`sourceSafetyPassed`**, deterministic defects and explicit false `remoteSqlConnected`, `verifiedAppliedMigrationHistory` and deployment authorization flags.
10. Adds local regression tests and a `pull_request`-only GitHub workflow (also manually dispatchable) that checks the source with **read-only repository permissions, no supplied secrets and no remote database operations**.

## Running the check

From a checked-out branch with Node.js 22:

```bash
node scripts/services-migration-source-guard.mjs
node --test tests/services-migration-source-guard-phase28.test.mjs
```

A zero exit code means only that source content matches the reviewed **local baseline** and structural safety requirements. It does **not** prove successful SQL execution, correct applied history, live RLS isolation, or launch readiness. The GitHub workflow does not run the manually protected live Services staging acceptance.

## What still prevents launch

1. Diagnose connection timeouts using the Supabase Dashboard, resource/connection metrics and support when necessary. Restore `SELECT 1` before any manual SQL audit.
2. Reconcile actual managed migration history with deployed schema and all historical version collisions. Review and only apply truly missing approved DDL **Phase 13 before Phase 14**. Never blind `db push` or hand-edit history.
3. Run `docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql` manually in the correct project once SQL access is restored; a passing catalog verdict is necessary but insufficient.
4. Run separate protected **real-account staging** acceptance with customer A, customer B, administrator and anonymous actor against an approved nonproduction Supabase project; verify row-level privacy and actual saved workflow fixtures.
5. Complete authenticated desktop/mobile release checks and owner sign-off. Services remains **not production-ready** until all independent live gates pass.

Existing baseline: `scripts/automation-migration-collision-forensics.mjs` and `scripts/automation-migration-collision-baseline.json`.
