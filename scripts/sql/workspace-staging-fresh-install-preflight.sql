-- Workspace Phase 48: read-only deployment preflight. Run only on explicitly approved staging.
-- Catalog data only; no app rows, credentials, fixture accounts or mutations.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT jsonb_build_object(
  'read_only',current_setting('transaction_read_only')='on',
  'database',current_database(),
  'migration_history_present',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
  'applied_workspace_versions',(SELECT coalesce(jsonb_agg(version ORDER BY version),'[]'::jsonb)
    FROM supabase_migrations.schema_migrations WHERE version IN ('20261123050000','20261123180000','20261124010000','20261124030000','20261124050000','20261124070000','20261124090000','20261124110000','20261124130000','20261124150000','20261124170000','20261124190000','20261124210000','20261124230000')),
  'workspace_public_relations',(SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND left(c.relname,10)='workspace_'),
  'workspace_public_function_count',(SELECT count(*) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND left(p.proname,10)='workspace_'),
  'workspace_bucket_exists',EXISTS(SELECT 1 FROM storage.buckets WHERE id='workspace-private'),
  'workspace_storage_policy_names',(SELECT coalesce(jsonb_agg(polname ORDER BY polname),'[]'::jsonb)
    FROM pg_catalog.pg_policy WHERE polrelid='storage.objects'::regclass AND left(polname,10)='workspace_'),
  'auth_users_exists',to_regclass('auth.users') IS NOT NULL,
  'storage_objects_exists',to_regclass('storage.objects') IS NOT NULL,
  'realtime_publication_exists',EXISTS(SELECT 1 FROM pg_catalog.pg_publication WHERE pubname='supabase_realtime')
) AS preflight;
ROLLBACK;
