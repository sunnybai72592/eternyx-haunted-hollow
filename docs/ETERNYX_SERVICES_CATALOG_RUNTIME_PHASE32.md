# ETERNYX Services Phase 32 — execute the real catalog release gate in PG17

**Scope:** no new migration, no remote SQL write, no staging or production change, no paid service, no new staging account, no copied business data. All SQL mutation cases run exclusively against the existing network-isolated and disposable PostgreSQL 17 container from Phase 29/30, after its 13-file migration replay and synthetic four-actor RLS tests.

## Why Phase 32

PR #613's manually protected Services staging release workflow requires an operator-reviewed Phase 27 catalog verdict with **64 checks** and zero failures before real-account staging acceptance can start. Until Phase 32, the SELECT-only operator SQL had source-pattern unit tests but was **not executed** in the disposable PostgreSQL CI replay. Its success/failure behavior was therefore not independently exercised against real PostgreSQL catalog objects.

The linked Eternyx Supabase database remains intermittently unavailable to the management SQL connector. The connected account still lists no separate nonproduction staging project. A previous successful read-only catalog inspection found the Phase 13 amendment table/queues and Phase 14 journal absent. These are deployment blockers and are not changed by this pull request.

## Connected improvements

1. Preserve the exact operator-facing Phase 27 SQL file as a **SELECT-only, metadata-only** audit. The new replay generator reads the original file, not a separately reimplemented query.
2. **Require authenticated SELECT** on every required Services table as well as on the required views. The earlier operator query only checked that specific four Phase 13/14 objects granted authenticated SELECT; the other source tables were not held to that contract.
3. Export one shared constant, SERVICES_CATALOG_CHECKS = 64, from the existing staging gate module so the offline SQL replay and protected staging attestation use the same check count.
4. Validate that Phase 27 remains a single SELECT-only CTE query, not an unreviewed DML/DDL payload.
5. Execute the real Phase 27 query against a clean PostgreSQL 17 schema after all **13** ordered Services SQL migrations are actually replayed and customer A/B/admin/anon SQL-RLS exercises pass.
6. Require a real SQL verdict with catalog_checks_passed TRUE, checks_evaluated exactly 64, checks_failed 0, and zero failed_check_ids.
7. In an independent transaction, deliberately GRANT anonymous SELECT on the protected journal; require the real operator query to fail its corresponding privacy check.
8. In an independent transaction, deliberately REVOKE authenticated SELECT on the activity table; require the newly strengthened query to detect the missing required client permission.
9. In independent transactions, DISABLE the Phase 13 amendment table's RLS and remove the Phase 14 journal's security_invoker option; require the query to detect both.
10. In separate independent transactions, disable an amendment burst-protection trigger and drop the owner-insert policy; require the query to fail both security checks.
11. Require a **ROLLBACK** after the positive baseline and after every deliberately corrupted catalog state; never leave weakened SQL settings behind even in the disposable container.
12. Add regression tests and path-filtered CI wiring so changes to the SQL audit itself, the shared staging verifier, or this runner re-execute the real catalog test.

The generator does not connect to a database, execute shell commands, fetch remote resources, or trust operator-supplied SQL. The existing GitHub workflow performs all actual SQL inside a Docker container started with --network none and no published ports, remote DB credentials, or service-role keys.

## Running locally

On the reviewed repository source:

  node --test tests/services-pg17-catalog-verdict-phase32.test.mjs
  node scripts/services-pg17-catalog-verdict-regressions.mjs --stdout

The second command **prints SQL**, it does not run it. That generated SQL contains deliberate GRANT, REVOKE, ALTER and DROP POLICY mutations, so **never execute it against Supabase, staging, production or a shared database**. It is meant exclusively for a fresh isolated PostgreSQL test container after the Phase 29 bootstrap and complete migration replay.

The Phase 27 file itself remains read-only and may be run separately by a trusted operator against a reviewed Supabase staging project to inspect the actual catalog. This is not permission to deploy or repair migrations.

## What a green CI result does and does not prove

Passing means PostgreSQL 17 built the reviewed 13-migration Services chain, the synthetic actor SQL-RLS exercises passed, and the exact Phase 27 catalog query both passed the pristine synthetic schema and **rejected six security regressions**. It does **not** establish deployed Supabase schema, stable SQL connectivity, real Auth sessions, independent managed migration-history reconciliation, actual customer row isolation, or a production release.

To proceed to release, arrange a separate budget-approved staging project, restore reliable SQL, independently review collisions and truly deployed history, authorize missing schema changes only in dependency order (**Phase 13 before Phase 14**), run the catalog query on staging and complete protected **real-account staging** plus desktop/mobile journeys. Services remains **not production-ready** until those gates pass.

No real customer data or payments are involved in this phase.
