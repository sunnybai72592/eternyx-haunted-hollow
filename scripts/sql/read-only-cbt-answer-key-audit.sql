-- ETERNYX Education CBT: read-only metadata inspection.
-- Run only as an authorized owner in Supabase SQL Editor.
-- This query reads NO student records, passwords, question text, or answer keys.
-- No statements here change permissions or database data.
WITH relation_state AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('tests', 'questions', 'options', 'user_attempts', 'user_answers')
)
SELECT jsonb_build_object(
  'audit', 'eternyx-cbt-privilege-metadata-v1',
  'table_rls', COALESCE((
    SELECT jsonb_object_agg(table_name, rls_enabled)
    FROM relation_state
  ), '{}'::jsonb),
  'browser_role_can_select_answer_key',
    has_column_privilege('authenticated', 'public.options', 'is_correct', 'SELECT'),
  'browser_role_can_write_answer_grading',
    has_column_privilege('authenticated', 'public.user_answers', 'is_correct', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.user_answers', 'points_awarded', 'UPDATE'),
  'browser_role_can_insert_answer_grading',
    has_column_privilege('authenticated', 'public.user_answers', 'is_correct', 'INSERT')
    OR has_column_privilege('authenticated', 'public.user_answers', 'points_awarded', 'INSERT'),
  'browser_role_can_write_attempt_scores',
    has_column_privilege('authenticated', 'public.user_attempts', 'score', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.user_attempts', 'max_score', 'UPDATE'),
  'browser_role_can_insert_attempt_scores',
    has_column_privilege('authenticated', 'public.user_attempts', 'score', 'INSERT')
    OR has_column_privilege('authenticated', 'public.user_attempts', 'max_score', 'INSERT'),
  'cbt_policies', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'with_check', with_check
    ) ORDER BY tablename, policyname)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('tests', 'questions', 'options', 'user_attempts', 'user_answers')
  ), '[]'::jsonb)
) AS cbt_security_metadata;
