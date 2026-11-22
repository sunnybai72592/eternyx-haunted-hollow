-- ETERNYX Services read-only release preflight.
-- Does NOT create sample customers, mutate production data, or bypass RLS.
-- Run in Supabase SQL editor using a trusted administrative connection.
-- All 'pass' rows must be true before declaring the schema ready.
-- This does not replace separate authenticated A/B account tests.

WITH service_tables(name) AS (
  VALUES
    ('service_requests'),
    ('service_request_activity'),
    ('service_request_triage'),
    ('service_scope_reviews'),
    ('service_scope_responses')
),
tables AS (
  SELECT name, to_regclass('public.' || name) AS relation
  FROM service_tables
)
SELECT
  'table_security' AS check_type,
  name,
  (
    relation IS NOT NULL
    AND (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = relation)
    AND NOT has_table_privilege('anon', relation, 'SELECT')
    AND NOT has_table_privilege('authenticated', relation, 'DELETE')
    AND has_table_privilege('authenticated', relation, 'SELECT')
    AND (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = name) >= 2
  ) AS pass
FROM tables
UNION ALL
SELECT
  'admin_view_security',
  'service_admin_attention_queue',
  (
    to_regclass('public.service_admin_attention_queue') IS NOT NULL
    AND (SELECT 'security_invoker=true' = ANY(c.reloptions)
         FROM pg_class c
         WHERE c.oid = to_regclass('public.service_admin_attention_queue'))
    AND NOT has_table_privilege('anon', 'public.service_admin_attention_queue', 'SELECT')
  )
UNION ALL
SELECT
  'trigger_enabled',
  required.trigger_name,
  EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = required.table_name
      AND t.tgname = required.trigger_name
      AND t.tgenabled = 'O'
  )
FROM (VALUES
  ('service_requests', 'service_request_activity_insert'),
  ('service_requests', 'service_request_activity_status'),
  ('service_requests', 'service_request_update_time'),
  ('service_requests', 'service_request_scope_guard'),
  ('service_requests', 'service_requests_delivery_gate'),
  ('service_request_triage', 'service_triage_update_time')
) AS required(table_name, trigger_name)
ORDER BY check_type, name;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE name IN (
  'service_requests', 'service_request_activity', 'service_scope_triage',
  'services_delivery_gate', 'service_admin_attention_queue'
)
ORDER BY version;

-- Prove owner/admin isolation separately with signed-in staging accounts.
