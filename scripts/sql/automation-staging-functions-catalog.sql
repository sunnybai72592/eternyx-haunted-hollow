-- Isolated STAGING catalog proof, never a migration and never a deployment.
-- Must be run with trusted TLS, production-ref denial and read-only role.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';

-- Verify the exact RPC families depended on by the three Automation
-- Edge Functions. This tests presence, not semantic contract correctness.
SELECT 'automation_rpc_catalog_present=' || (
  SELECT count(*)=7
  FROM (VALUES
    ('automation_save_workflow'),
    ('automation_record_run'),
    ('automation_register_webhook'),
    ('automation_record_webhook_run'),
    ('automation_save_schedule'),
    ('automation_claim_due_schedule'),
    ('automation_complete_scheduled_run')
  ) AS required(name)
  WHERE EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=required.name
  )
)::text;

-- A deployed handler must not operate on tenant-owned Automation tables
-- whose base-table RLS has been silently disabled.
SELECT 'automation_rls_enabled=' || (
  SELECT count(*)=4 AND coalesce(bool_and(c.relrowsecurity),false)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN (
    'automation_workflows','automation_runs',
    'automation_webhook_triggers','automation_schedules'
  ) AND c.relkind='r'
)::text;

SELECT 'automation_schema_present=' || (
    to_regclass('public.automation_workflows') IS NOT NULL AND
    to_regclass('public.automation_runs') IS NOT NULL AND
    to_regclass('public.automation_webhook_triggers') IS NOT NULL AND
    to_regclass('public.automation_schedules') IS NOT NULL
)::text;
COMMIT;
