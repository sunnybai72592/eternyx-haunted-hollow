# ETERNYX Services — Database Connection Recovery and Migration Gate

## Why a healthy project status may not mean a working database

A Supabase management project status of ACTIVE_HEALTHY is not itself a
successful SQL connection test. The remote database SQL endpoint and
migration-list endpoint both returned "Connection terminated due to
connection timeout" in multiple turns. This does not, by itself,
establish the cause: connection exhaustion, database load,
platform/network conditions, or another failure may be involved.

Official troubleshooting references:
- https://supabase.com/kb/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout
- https://supabase.com/docs/guides/database/connection-management
- https://supabase.com/docs/guides/deployment/database-migrations

## Safe recovery sequence: Phase 13 before Phase 14

1. In the correct connected Supabase Dashboard project, inspect database
   health/connection metrics, active sessions, recent logs, platform
   notifications and the SQL Editor. If the SQL Editor is responsive,
   start with a harmless read-only statement:

       SELECT 1 AS connected;

2. If basic SQL also times out, investigate connections, resource
   pressure and Supabase logs or contact Supabase Support with the
   project reference and exact sanitized error. Do not speculate that
   a migration is missing or re-run potentially non-idempotent DDL.

3. Once the database is reachable, inspect the supported managed
   migration history and read-only schema state. Management-applied
   version identifiers may differ from repository filenames.
   **Do not edit migration history manually.** Follow the official
   Supabase migration-repair process only when a genuine mismatch is
   verified and reconciled.

4. Check Phase 13 and Phase 14 schema existence before applying SQL:

       SELECT
         to_regclass('public.service_brief_amendments')
           IS NOT NULL AS phase13_amendment_table,
         to_regclass('public.service_customer_amendment_queue')
           IS NOT NULL AS phase13_owner_queue,
         to_regclass('public.service_admin_amendment_queue')
           IS NOT NULL AS phase13_admin_queue,
         to_regclass('public.service_request_journal')
           IS NOT NULL AS phase14_activity_journal;

       SELECT c.relname, c.relrowsecurity, c.reloptions
       FROM pg_class AS c
       JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
       AND c.relname IN (
         'service_brief_amendments',
         'service_customer_amendment_queue',
         'service_admin_amendment_queue',
         'service_request_journal'
       );

   The Phase 13 amendment table should have RLS enabled. Owner/admin
   amendment views and the Phase 14 journal view should have
   security_invoker=true. Preserve source-table RLS and narrowly
   scoped authenticated write grants.

5. Only after verifying what has already been applied, use the approved
   migration operation to apply any missing reviewed changes in order:
   Phase 13, then Phase 14. Do not re-run already-applied DDL or
   modify the migrations history table directly.

6. Verify the final row-level policies, role grants, triggers and
   security_invoker flags, and run real customer A, customer B and
   administrator tests. The owner must not read another customer's
   request journal or amendment; anon must not read private history.
   Admin access must remain restricted by is_admin and RLS.

7. Run Phase 16's manual, signed-in feature checks. Query available
   means the API endpoint is accessible for this session; it is NOT
   proof of correct RLS isolation, historical migrations, or a
   completed service workflow.

## Unsafe shortcuts to avoid

Do not edit migration history manually, disable RLS, expose service
role credentials in frontend code, enable public anonymous access to
bypass an error, delete customer records, or claim GitHub merge means
database changes were deployed.

The recovery process creates no read receipts, financial transactions,
SLAs, or delivery authorizations.
