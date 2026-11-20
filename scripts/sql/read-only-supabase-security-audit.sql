-- ETERNYX read-only Supabase SECURITY METADATA INVENTORY.
-- Paste in Supabase SQL Editor; run only as an authorized project administrator.
-- Catalog-only, reads NO application rows, tokens, auth.users, secrets or customer PII.
-- Save the value of audit_json for local review, NOT to a public GitHub artifact.
-- No ALTER/GRANT/REVOKE/DDL, no side effects.
SELECT jsonb_pretty(jsonb_build_object(
  'schema', 'public',
  'tables', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rls', c.relrowsecurity,
      'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
      'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
      'policy_count', (SELECT count(*) FROM pg_policies pol WHERE pol.schemaname = n.nspname AND pol.tablename = c.relname)
    ) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ),
  'functions', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'signature', p.oid::regprocedure::text,
      'security_definer', p.prosecdef,
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
      'search_path_fixed', COALESCE(
        EXISTS (SELECT 1 FROM unnest(p.proconfig) AS setting WHERE setting LIKE 'search_path=%'), false)
    ) ORDER BY p.oid::regprocedure::text), '[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ),
  'policies', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'table', tablename, 'name', policyname,
      'uses_admin_helper', (
        COALESCE(qual, '') ILIKE '%is_admin(%'
        OR COALESCE(with_check, '') ILIKE '%is_admin(%'
        OR COALESCE(qual, '') ILIKE '%get_current_user_role(%'
        OR COALESCE(with_check, '') ILIKE '%get_current_user_role(%'),
      'targets_public', 'public' = ANY(roles)
    ) ORDER BY tablename, policyname), '[]'::jsonb)
    FROM pg_policies
    WHERE schemaname = 'public'
  ),
  'views', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'security_invoker', COALESCE('security_invoker=true' = ANY(c.reloptions), false),
      'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
      'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT')
    ) ORDER BY c.relname), '[]'::jsonb)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  )
)) AS audit_json;
