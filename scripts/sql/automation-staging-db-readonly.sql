-- Read-only automation staging metadata probe.
-- The operator-approved runner enforces TLS verify-full, a pinned CA,
-- default_transaction_read_only, an isolated project ref and statement limits.
-- No user rows, passwords, table contents, SQL bodies or tokens are selected.
-- DO NOT use this on an existing/production project.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';

SELECT 'connection_ok=' || (current_database() = 'postgres')::text;
SELECT 'transaction_read_only=' ||
  (current_setting('transaction_read_only') = 'on')::text;
SELECT 'migration_history_present=' ||
  (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text;
SELECT 'automation_workflows_present=' ||
  (to_regclass('public.automation_workflows') IS NOT NULL)::text;
SELECT 'automation_runs_present=' ||
  (to_regclass('public.automation_runs') IS NOT NULL)::text;
SELECT 'automation_webhooks_present=' ||
  (to_regclass('public.automation_webhook_triggers') IS NOT NULL)::text;
SELECT 'automation_schedules_present=' ||
  (to_regclass('public.automation_schedules') IS NOT NULL)::text;

-- If the history relation is missing, psql fails on this statement, rather
-- than reporting "all migrations absent" from a fabricated empty result.
-- Duplicate versions alone cannot identify which competing SQL file ran.
SELECT 'applied_collision_version=' || version
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261115060000','20261123030000','20261123040000',
  '20261123050000','20261123070000','20261123080000',
  '20261123090000','20261123100000','20261123110000',
  '20261123120000','20261123130000'
)
ORDER BY version;

COMMIT;
