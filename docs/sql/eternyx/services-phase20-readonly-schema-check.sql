-- ETERNYX Services Phase 20: OPERATOR-ONLY read-only SQL catalog audit.
-- Run only after the project SQL Editor becomes responsive.
-- Never apply this file as a migration. No data writes, admin escalation,
-- changes to RLS, or unauthorized access to another customer's records.
--
-- Acceptance:
--  * Every required object exists.
--  * service_brief_amendments is RLS-enabled.
--  * Three Phase 13/14 views are security_invoker=true.
--  * The 13/14 private resources reject anon SELECT and allow authenticated SELECT
--    (RLS and admin checks decide which authenticated ROWS can be read).
--  * Phase 13 write policies and server-owned triggers exist/enabled.
-- This catalog check must be accompanied by the real account A/B/Admin
-- Data API acceptance workflow. Neither alone constitutes a full audit.

SELECT current_database() AS connected_database, current_setting('server_version') AS postgres_version;

WITH expected(name, kind) AS (
  VALUES
    ('service_requests', 'table'),
    ('service_request_activity', 'table'),
    ('service_scope_reviews', 'table'),
    ('service_scope_responses', 'table'),
    ('service_clarification_questions', 'table'),
    ('service_clarification_answers', 'table'),
    ('service_brief_amendments', 'table'),
    ('service_request_triage', 'table'),
    ('service_customer_amendment_queue', 'invoker_view'),
    ('service_admin_amendment_queue', 'invoker_view'),
    ('service_request_journal', 'invoker_view')
)
SELECT expected.name AS object_name,
       expected.kind,
       c.oid IS NOT NULL AS exists,
       CASE WHEN expected.kind = 'table'
            THEN COALESCE(c.relrowsecurity, false)
            ELSE NULL END AS table_rls_enabled,
       CASE WHEN expected.kind = 'invoker_view'
            THEN COALESCE('security_invoker=true' = ANY(c.reloptions), false)
            ELSE NULL END AS view_invokes_callers_privileges,
       CASE WHEN c.oid IS NOT NULL
            THEN has_table_privilege('anon', c.oid, 'SELECT')
            ELSE NULL END AS anon_can_select_object,
       CASE WHEN c.oid IS NOT NULL
            THEN has_table_privilege('authenticated', c.oid, 'SELECT')
            ELSE NULL END AS authenticated_can_select_object
FROM expected
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = expected.name
ORDER BY expected.kind, expected.name;

-- Phase 13 trigger guards must actually be enabled, not only defined.
SELECT expected.trigger_name,
       t.oid IS NOT NULL AS exists,
       COALESCE(t.tgenabled IN ('O','A'), false) AS enabled
FROM (VALUES
  ('service_brief_amendment_stamp_review'),
  ('service_brief_amendment_burst_guard'),
  ('service_clarification_close_stamp'),
  ('service_clarification_question_burst_guard')
) AS expected(trigger_name)
LEFT JOIN pg_catalog.pg_trigger t ON t.tgname = expected.trigger_name
 AND t.tgrelid IN (
   to_regclass('public.service_brief_amendments'),
   to_regclass('public.service_clarification_questions')
 )
ORDER BY expected.trigger_name;

-- An RLS policy is not sufficient on its own: perform the 3-account
-- read-isolation acceptance workflow as well.
SELECT schemaname, tablename, policyname, cmd, roles, qual IS NOT NULL AS has_using,
       with_check IS NOT NULL AS has_with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'service_brief_amendments','service_request_activity',
  'service_clarification_questions','service_clarification_answers',
  'service_request_triage'
)
ORDER BY tablename, policyname;

-- Monitoring: aggregated connection states, not raw SQL statements or PII.
SELECT state, count(*) AS connections
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY count(*) DESC;
