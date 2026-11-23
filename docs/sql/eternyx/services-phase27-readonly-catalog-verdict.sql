-- ETERNYX Services Phase 27 — operator-only, strictly READ-ONLY database release gate.
-- Run in the correct project's Supabase SQL Editor AFTER SELECT 1 works.
-- This file must NEVER be passed to migration/apply commands.
-- No business data, UUIDs, passwords, emails, query text, or customer rows returned.
-- Independent real-account A/B/Admin/anonymous staging checks remain MANDATORY.
--
-- The result is a point-in-time catalog verdict, NOT proof of deployed
-- migration history, cross-account row security, or production readiness.
--
-- Expected boolean true for catalog_checks_passed; zero checks failed.
-- Any false or missing check is a BLOCKER, never a "warning" to waive.

WITH
expected_objects(name, required_kind, require_rls, require_invoker, forbid_anon_select, allow_auth_select) AS (
  VALUES
    ('service_brief_amendments', 'table', true, false, true, true),
    ('service_customer_amendment_queue', 'view', false, true, true, true),
    ('service_admin_amendment_queue', 'view', false, true, true, true),
    ('service_request_journal', 'view', false, true, true, true),
    ('service_requests', 'table', true, false, true, false),
    ('service_request_activity', 'table', true, false, true, false),
    ('service_scope_reviews', 'table', true, false, true, false),
    ('service_scope_responses', 'table', true, false, true, false),
    ('service_clarification_questions', 'table', true, false, true, false),
    ('service_clarification_answers', 'table', true, false, true, false),
    ('service_request_triage', 'table', true, false, true, false)
),
observed_objects AS (
  SELECT e.name, e.required_kind, e.require_rls, e.require_invoker,
         e.forbid_anon_select, e.allow_auth_select, c.oid, c.relkind,
         COALESCE(c.relrowsecurity, false) AS row_security,
         COALESCE('security_invoker=true' = ANY(c.reloptions), false) AS invoker,
         CASE WHEN c.oid IS NOT NULL
           THEN has_table_privilege('anon', c.oid, 'SELECT') ELSE NULL
         END AS anon_select,
         CASE WHEN c.oid IS NOT NULL
           THEN has_table_privilege('authenticated', c.oid, 'SELECT') ELSE NULL
         END AS authenticated_select
  FROM expected_objects e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = n.oid AND c.relname = e.name
),
object_tests AS (
  SELECT 'object/' || name || '/exists_and_kind' AS check_id,
         (oid IS NOT NULL AND (
           (required_kind = 'table' AND relkind IN ('r','p')) OR
           (required_kind = 'view' AND relkind = 'v')
         )) AS passed FROM observed_objects
  UNION ALL
  SELECT 'object/' || name || '/rls',
         (NOT require_rls OR row_security) FROM observed_objects
  UNION ALL
  SELECT 'object/' || name || '/security_invoker',
         (NOT require_invoker OR invoker) FROM observed_objects
  UNION ALL
  SELECT 'object/' || name || '/anon_restricted',
         (NOT forbid_anon_select OR anon_select IS FALSE) FROM observed_objects
  UNION ALL
  SELECT 'object/' || name || '/authenticated_select',
         (NOT allow_auth_select OR authenticated_select IS TRUE) FROM observed_objects
),
expected_policies(tablename, policyname, cmd, needs_using, needs_check) AS (
  VALUES
    ('service_brief_amendments', 'service_brief_amendments_participant_read', 'SELECT', true, false),
    ('service_brief_amendments', 'service_brief_amendments_owner_insert', 'INSERT', false, true),
    ('service_brief_amendments', 'service_brief_amendments_admin_review', 'UPDATE', true, true)
),
policy_tests AS (
  SELECT 'policy/' || e.policyname AS check_id,
         EXISTS(
           SELECT 1 FROM pg_catalog.pg_policies p
           WHERE p.schemaname = 'public'
             AND p.tablename = e.tablename
             AND p.policyname = e.policyname
             AND p.cmd = e.cmd
             AND 'authenticated' = ANY(p.roles)
             AND (NOT e.needs_using OR p.qual IS NOT NULL)
             AND (NOT e.needs_check OR p.with_check IS NOT NULL)
         ) AS passed
  FROM expected_policies e
),
expected_triggers(tablename, triggername) AS (
  VALUES
    ('service_brief_amendments', 'service_brief_amendment_stamp_review'),
    ('service_brief_amendments', 'service_brief_amendment_burst_guard'),
    ('service_clarification_questions', 'service_clarification_close_stamp'),
    ('service_clarification_questions', 'service_clarification_question_burst_guard')
),
trigger_tests AS (
  SELECT 'trigger/' || e.triggername AS check_id,
         EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger t
           JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
           JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public'
             AND c.relname = e.tablename
             AND t.tgname = e.triggername
             AND t.tgenabled IN ('O','A')
             AND NOT t.tgisinternal
         ) AS passed
  FROM expected_triggers e
),
function_tests AS (
  SELECT 'function/public.is_admin()' AS check_id,
         to_regprocedure('public.is_admin()') IS NOT NULL AS passed
  UNION ALL
  SELECT 'schema/eternyx_private',
         to_regnamespace('eternyx_private') IS NOT NULL
),
all_tests AS (
  SELECT * FROM object_tests
  UNION ALL SELECT * FROM policy_tests
  UNION ALL SELECT * FROM trigger_tests
  UNION ALL SELECT * FROM function_tests
)
SELECT
  COALESCE(bool_and(passed IS TRUE), false) AS catalog_checks_passed,
  COUNT(*) AS checks_evaluated,
  COUNT(*) FILTER (WHERE passed IS NOT TRUE) AS checks_failed,
  COALESCE(
    array_agg(check_id ORDER BY check_id)
      FILTER (WHERE passed IS NOT TRUE),
    ARRAY[]::text[]
  ) AS failed_check_ids,
  'This is catalog-only evidence. Managed migration history and real account staging MUST be verified separately.'::text
    AS verification_limit
FROM all_tests;
