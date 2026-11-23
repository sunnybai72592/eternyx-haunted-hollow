# ETERNYX Services Phase 29 — real PostgreSQL 17 compilation in isolated CI

## Observed live status (November 23, 2026)

The connected Supabase project began returning successful harmless `SELECT 1 AS connected` responses, but follow-up requests sometimes failed with **connection timeout**. The connection cannot yet be called consistently healthy.

A successful *read-only* catalog query checked the following production-linked database objects and returned **false for all four**: `public.service_brief_amendments`, `public.service_customer_amendment_queue`, `public.service_admin_amendment_queue` and `public.service_request_journal`. Thus **Services Phases 13 and 14 are not deployed as the required schema objects in the checked database**. This does not say why, and it does not establish their managed migration-history entries. Historical timestamp collisions make a version-only check insufficient.

This PR intentionally performs **no new migration**, no remote SQL write and no staging or production deployment. The source-protection PR #593 is already merged.

## What this PR adds

1. A deterministic, local 13-file Services migration allowlist in `scripts/services-pg17-replay-plan.mjs`, from original request intake to the Phase 14 journal, with Phase 13 before Phase 14.
2. A mandatory recheck against the **already pinned migration collision baseline** and Phase 28 source-integrity guard.
3. Rejection of missing SQL files, changed manifest order, extra files, duplicate entries and unsafe/unrecognized paths.
4. A **synthetic**, empty database/Auth bootstrap that supplies only the role, function and table prerequisites of the Services SQL; it does not import customer data or pretend to reproduce the full Supabase platform.
5. A disposable PostgreSQL 17 Docker container launched with **`--network none`**, no published ports and no Supabase credentials.
6. Actual ordered execution of all thirteen Services migration SQL files, with `psql -X -1 -v ON_ERROR_STOP=1` so each file executes transactionally or fails.
7. Post-replay catalog assertions requiring the Services tables and RLS, five invoker views, anonymous restrictions, authenticated select access, critical triggers and the Phase 13 policy set.
8. Regression tests for manifest tampering, source safety, local bootstrap, replay plumbing and the catalog assertions.
9. A dedicated path-filtered GitHub Actions workflow with `contents: read`, no secret access, no remote SQL access and cleanup of the disposable container.
10. Fail-closed reporting if any source step, PostgreSQL statement or security assertion fails.

## Important scope distinction

**A passing isolated PostgreSQL replay proves only that the reviewed SQL can compile and satisfy basic catalog checks in a disposable PostgreSQL 17 instance with synthetic Auth dependencies.** It cannot prove Supabase Auth compatibility end-to-end, deployed migrations in any remote project, real row isolation, live API access, uptime, customer workflows or launch authorization.

**This is not a production release.** Network isolation means it cannot accidentally deploy to Supabase, and no real identities, service requests, billing or customer records are used. The synthetic `public.is_admin()` intentionally has only stub test behavior; actual admin authorization requires an independent real-account staging test.

## Steps still required before Services launch

1. Determine the reason for intermittent database connectivity through approved operator monitoring and Supabase support if necessary. Confirm repeated healthy read-only connections.
2. Reconcile full **actual managed migration history** and deployed catalog state against the original repository SQL. The repository has eleven historical collision versions; never infer execution from version presence alone or use blind `db push`.
3. For any missing reviewed SQL, use an **operator-approved, collision-aware staging plan**; execute only verified missing migrations in strict dependency order, **Phase 13 before Phase 14**, after an independent review. Do not change production schema from this PR.
4. Once SQL is available, run `docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql` in the intended deployment environment.
5. Run protected manual **real-account staging** acceptance with customer A, customer B, administrator and anonymous client against a distinct nonproduction project. Independently validate read/write policies, original source event lineage, local session cleanup and desktop/mobile journeys.
6. Require product/operator sign-off before production deployment. A GitHub green check or merge alone is not authorization.

Existing source guard: `scripts/services-migration-source-guard.mjs`.
