-- ETERNYX integrated release inventory; run only in Eternyx Staging (mhodwvypfbxafamkrgsk).
-- Single read-only query. Counts are not proof of authenticated journeys.
WITH public_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
), public_rpcs AS (
  SELECT p.oid,p.proname,p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
)
SELECT jsonb_build_object(
  'public_tables', (SELECT count(*) FROM public_tables),
  'rls_disabled', (SELECT count(*) FROM public_tables WHERE NOT relrowsecurity),
  'anon_select_tables', (SELECT count(*) FROM public_tables WHERE has_table_privilege('anon',oid,'SELECT')),
  'confirmed_nonanonymous_accounts', (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL AND NOT coalesce(is_anonymous,false)),
  'admin_records', (SELECT count(*) FROM public.admin_users),
  'instructor_grants', (SELECT count(*) FROM public.education_instructor_grants),
  'workspace_named_tables', (SELECT count(*) FROM public_tables WHERE relname LIKE 'workspace\_%' ESCAPE '\' OR relname LIKE 'team\_%' ESCAPE '\'),
  'workspace_named_rpcs', (SELECT count(*) FROM public_rpcs WHERE proname LIKE 'workspace\_%' ESCAPE '\' OR proname LIKE 'team\_%' ESCAPE '\'),
  'automation_workflows', (SELECT count(*) FROM public.automation_workflows),
  'cybersecurity_engagements', (SELECT count(*) FROM public.pentest_engagements),
  'services_requests', (SELECT count(*) FROM public.service_requests),
  'migration_count', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'authenticated_journeys_verified', false,
  'production_promotion_authorized', false
) AS inventory;
