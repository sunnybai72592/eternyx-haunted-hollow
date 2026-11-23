# ETERNYX Services Phase 37 — verify staging auditor privileges, not merely its username

**No new migration, no remote SQL write, no staging project creation, no paid infrastructure, no production changes.** Phase 37 improves the protected Services release gate introduced in Phase 36.

## New real database security check

The Phase 36 proof already connects to a dedicated staging SQL auditor and verifies the live 13 named migrations, the six important Services objects and the 64-check catalog verdict. However, a database account having a reassuring username does not prove it lacks write access or privileged role membership.

Phase 37 runs **seven additional metadata-based privilege checks**, in the SAME read-only transaction as the Phase 36 live audit, BEFORE any test-user Supabase Auth sign-in:

1. PostgreSQL role attributes show LOGIN enabled and SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS and INHERIT disabled.
2. No membership in powerful PostgreSQL/Supabase roles, including service_role, postgres, supabase_admin, pg_database_owner, pg_write_all_data and server-file/program roles.
3. No effective CREATE privilege on the current database.
4. No effective CREATE permission on any non-system schema.
5. No effective INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER permission on any non-system table/view (including existing Services and Auth data).
6. No USAGE or UPDATE permission on any non-system sequence (which could otherwise advance or mutate sequence values).
7. Both the current transaction and connection's default_transaction_read_only setting report on.

The query reads only pg_catalog role/schema/class/privilege metadata and current settings; it does not read any customer/business record. It uses the effective PostgreSQL privilege helper functions, so broad membership and grants are not overlooked merely because the auditor has no direct grant on a particular Services table.

Each result must be the literal boolean TRUE. Any FALSE, NULL, missing assertion, extra field or wrong type prevents the Phase 36 staging acceptance from completing. A previously valid operator-supplied JSON report cannot override failing live database security metadata. GitHub logs contain only fixed pass/fail codes, never the SQL login secret, project reference, connection errors or raw database records.

## Real mutation checks in disposable PostgreSQL 17

An extra CI test executes the EXACT privilege query under a synthetic **LOGIN-enabled, NOINHERIT** least-privilege SQL role in the existing network-isolated disposable PostgreSQL 17 container.

The replay checks a clean role, then deliberately grants and removes five distinct dangerous capabilities in separate transactions: INSERT on the Services request table, CREATE on public schema, CREATEDB, pg_write_all_data membership, and USAGE on a synthetic sequence. Each real PostgreSQL mutation must flip its expected metadata check to FALSE. The runner subsequently verifies all seven checks return TRUE after cleanup, drops the ephemeral sequence and test role, and destroys the Docker container. No remote database is accessed by this workflow.

The unit tests additionally attack the live proof parser: every one of the seven booleans FALSE, NULL, absent or not a boolean must block staging acceptance, even if the migration and catalog counts are otherwise green.

## Limitations and operational blocker

These are **effective metadata/role assertions, not a universal proof that a SQL user cannot modify database state**. In particular, callable SECURITY DEFINER routines and extensions may have their own security implications and require separate manual review; the gate explicitly reports securityDefinerFunctionEffectsProven=false. Database superusers can change role privileges after a snapshot. Metadata checks cannot prove which migration SQL file was applied under a historical version collision. Real customer A/B/admin/anonymous acceptance is still mandatory.

As of November 23, 2026, only the production-linked Eternyx Supabase project is visible. Read-only history/catalog show the first 11 named Services migrations and their earlier objects; Phase 13/14 named migrations and checked objects are absent. **Do not point this auditor at that project.** A separately approved nonproduction staging project must be provisioned, historical migrations reviewed (including the eleven collisions), and approved missing schema deployed to staging in dependency order (**Phase 13 before Phase 14**) before the protected workflow can run.

An authorized DBA must separately create and review the dedicated least-privilege staging auditor. No project or role is created by this PR. Its account credentials belong in protected GitHub Environment secrets only, never source control or customer records.

The Services pillar is **not production-ready** solely because Phase 37 CI passes. Real-account staging tests and operator deployment sign-off are required.
