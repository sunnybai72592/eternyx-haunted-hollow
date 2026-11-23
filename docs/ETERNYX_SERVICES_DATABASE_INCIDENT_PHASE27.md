# ETERNYX Services Phase 27 — database incident evidence and read-only catalog release gate

**This PR introduces no new migration, no deployment, no database writes and no changes to business data.** Its purpose is to make the Phase 13–14 catalog requirements mechanically reviewable once the correct Supabase project's SQL interface is reachable.

## What is actually known

On November 23, 2026, the connected Eternyx project continued to report `ACTIVE_HEALTHY` in its management metadata. Nonetheless a trivial `SELECT 1 AS connected` and managed migration-history listing each failed with `Connection terminated due to connection timeout`.

A separate read-only aggregation of available Supabase PostgreSQL logs in the tool's last-24-hours window showed:

- **SQLSTATE 57014**: 351 `ERROR` and 24 `FATAL` entries, consistent with repeated query cancellation/timeouts.
- **SQLSTATE 08006**: one `FATAL` connection-related entry in that severity-filtered aggregation.
- These are observations about log events, **not** counts of affected users, **not** proof of a single cause and **not** proof that a particular Services query caused the failure.
- A management health label only reflects the management status, not an independently successful SQL round trip. The backend incident remains unresolved.

Do not automatically increase timeouts, kill arbitrary sessions, restart Supabase, upgrade to a paid compute tier, or claim an issue with a specific migration without diagnosis.

## Operator-first recovery actions — no repeat retries

1. Open the correct Eternyx Supabase Dashboard and use Database/Observability metrics to inspect connection utilization, CPU, RAM, disk IO and recent Postgres/PostgREST logs. Identify whether the reported connection timeout is caused by exhausting connections, resource pressure, long-running queries, network/platform conditions, or another verified reason. Investigate the `57014` events; their cause cannot be inferred from SQLSTATE alone.
2. From the project's SQL Editor, use **only** `SELECT 1 AS connected;` as the first database probe. If that also times out, stop here. Contact Supabase Support with the sanitized project ref, error and UTC occurrence time, and request examination of connection/database health. Do not try applying migrations to fix it.
3. When SQL access is restored, independently inspect the managed `supabase_migrations.schema_migrations` history, actual catalog, and historical duplicate migration versions in the full repository. Do not edit migration history, rename applied SQL, apply old DDL blindly or issue a wholesale `db push`.
4. Run the existing operator SELECT-only audit `docs/sql/eternyx/services-phase20-readonly-schema-check.sql` to review object metadata and connection states. Then run `docs/sql/eternyx/services-phase27-readonly-catalog-verdict.sql` as a separate **manual SQL Editor query**, not as a migration.
5. The Phase 27 audit must return one verdict row with **`catalog_checks_passed = true`**, `checks_failed = 0`, and an empty `failed_check_ids` array. A missing result, SQL error, unknown flag or any failed identifier means this catalog gate is **BLOCKED**. Record the output in restricted operator evidence; never upload private database dumps to GitHub.
6. Reconcile the SQL catalog outcome with the actual managed migrations. Only for truly missing reviewed changes and separately approved staging execution, deploy **Phase 13 before Phase 14** with operator-approved procedure. Never infer which migrations ran from file presence or a GitHub merge.
7. Independently run the protected manual `Services staging acceptance (manual, real accounts)` GitHub workflow against a **separate nonproduction project** using two real customer fixture identities, one verified administrator, and an anonymous client. Complete desktop/mobile signed-in scenarios, role and RLS checks, journal provenance, local Auth cleanup, and explicit owner sign-off.
8. Treat production as **not production-ready** until successful restored connectivity, verified schema/history, manual real-account staging acceptance, and operational approval.

## What Phase 27 catalog verdict actually checks

- Object existence and type for Services request, activity, scope, clarification, triage and Phase 13/14 resources.
- RLS enabled on relevant source tables.
- `security_invoker=true` on the customer/admin amendment queues and unified journal.
- Anonymous SELECT prohibition on private resources.
- Authenticated SELECT on Phase 13/14 participant-facing objects.
- Correct command, authenticated role and ownership/check predicate *presence* for the three Phase 13 amendment policies.
- Correct target tables and enabled state of four server-owned amendment/clarification triggers.
- Presence of the trusted `public.is_admin()` function and `eternyx_private` schema.
- Single-line aggregate fail-closed verdict without customer records or raw query contents.

**Catalog structure is not sufficient to prove row isolation or policy semantics.** The three real actors, anonymous client and staging fixture tests are separate required evidence. Even a green catalog result is not proof of actual migration application history.

## Not part of this PR

This phase cannot repair the observed database timeout from a source-code commit. It does not change Postgres/connection-pool settings, replay migrations, alter users, deploy Edge Functions, enable payments/fulfillment, or grant access to private records.

References: [Supabase connection management](https://supabase.com/docs/guides/database/connection-management), [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase query timeouts](https://supabase.com/docs/guides/database/postgres/timeouts).
