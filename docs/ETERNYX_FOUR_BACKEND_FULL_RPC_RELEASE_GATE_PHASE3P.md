# ETERNYX — Phase 3P: Real four-function database dependency gate

**Status:** source and disposable PostgreSQL integration. No production migrations, Supabase Edge Function deployments, new paid project, secret access, live schedule ticks or hosted webhook events.

## Why this release gate is necessary

Phase 3O added `automation-control`, `automation-webhook`, `automation-scheduler-worker`, and `ctf-verified` to the protected staging function release. It verified the foundations and only seven Automation SQL RPCs. However, the actual Automation control handler calls **dozens more** RPCs. A project with the seven required foundations but without later incident, investigation, case, provider and policy migrations might pass the old gate despite broken real actions.

The production project currently lacks **all Automation and verified CTF foundations**. This PR does not attempt to migrate production or claim the four services are live.

## Changes

1. Build a **complete source-derived inventory** from every literal `.rpc("name")` and `.from("table")` call in all four Edge Function handlers.
2. Fail closed if a new dynamic or unvalidated RPC/table key appears, preventing source changes from silently evading the release gate.
3. Confirm every referenced RPC has a corresponding checked-in `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` migration declaration. No missing SQL definition can pass the source preflight.
4. Derive a fixed SQL catalog from reviewed, validated identifiers. The query uses `BEGIN READ ONLY`, 5-second statement timeout, 2-second lock timeout, and `pg_catalog` only.
5. Verify **every** source-referenced public RPC exists in the actual target database.
6. Verify **every** referenced public table exists and that **every** such owner-facing table has RLS enabled.
7. Parse only three bounded count lines from PostgreSQL, reject malformed output and counts smaller or larger than the exact source inventory. All metadata, never user data.
8. Pin the staging connection to the independently reviewed project ref, HTTPS/TLS `verify-full`, explicit CA, clean libpq environment and short timeouts; do not accept database credentials in SQL output.
9. Add the full source inventory and real database catalog checks to the **manual-only, required-reviewer, protected staging release**, before installing/deploying any function.
10. Expand the networkless PostgreSQL 17 cross-pillar CI to include the **real CTF SQL foundation** and execute the generated read-only dependency catalog after the Automation/Docker/Workspace/Services migration replay.
11. Deliberately disable Automation workflow RLS in the disposable CI database and verify that the complete release gate fails.
12. Add regression tests for all four source manifests, source-to-migration SQL completeness, fabricated catalog evidence, dynamic RPC bypasses, production safety, malformed row counts, and release order.

### Run locally

`npm run backend:four:rpc:check`

`node scripts/eternyx-backend-rpc-surface.mjs --source`

`node scripts/eternyx-backend-rpc-surface.mjs --sql` (prints catalog SQL only; never connects)

A result is **source-backed** and **offline verified**, not deployment authorization.

## Remaining blockers for actual cloud operation

The connected Supabase account has a single production project and no independently approved staging environment. The production migration journal has 28 entries ending at `20261122213215` (Services follow-through); no verified CTF or Automation migrations are applied. Migration timestamps in the repository also collide across pillars, requiring a separately reviewed staging mirror and migration-history reconciliation.

Even after the full SQL catalog passes in staging, protected operator approval, correct secrets, function inventory, negative-auth checks, authenticated two-account acceptance, and separately approved live event tests are necessary. A successful check or PR merge must never be described as the four production services being deployed.

No production schema, secret or Edge Function was changed by this PR.
