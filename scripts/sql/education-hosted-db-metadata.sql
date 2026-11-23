-- Only catalog metadata (never accounts, answer keys, responses or actual grades).
-- Run through the guarded CI tool on a distinct, approved staging database.
BEGIN TRANSACTION READ ONLY;
SELECT pg_catalog.jsonb_build_object('schema',1,'checks',pg_catalog.jsonb_build_object(
  'rls_tests', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.tests')),false),
  'rls_questions', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.questions')),false),
  'rls_options', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.options')),false),
  'rls_user_attempts', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.user_attempts')),false),
  'rls_user_answers', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.user_answers')),false),
  'rls_education_final_grades', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.education_final_grades')),false),
  'rls_education_written_reviews', COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.education_written_reviews')),false),
  'no_anon_answer_key', COALESCE(NOT pg_catalog.has_column_privilege('anon',pg_catalog.to_regclass('public.options'),'is_correct','SELECT'),false),
  'no_student_answer_key', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.options'),'is_correct','SELECT'),false),
  'no_student_attempt_score_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'score','UPDATE'),false),
  'no_student_attempt_max_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'max_score','UPDATE'),false),
  'no_student_attempt_status_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'status','UPDATE'),false),
  'no_student_attempt_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'status','INSERT'),false),
  'no_student_answer_grade_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'is_correct','UPDATE'),false),
  'no_student_answer_points_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'points_awarded','UPDATE'),false),
  'no_student_answer_direct_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'short_answer_text','UPDATE'),false),
  'no_student_answer_grade_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'points_awarded','INSERT'),false),
  'no_student_ledger_select', COALESCE(NOT pg_catalog.has_table_privilege('authenticated',pg_catalog.to_regclass('public.education_final_grades'),'SELECT'),false),
  'no_anon_ledger_select', COALESCE(NOT pg_catalog.has_table_privilege('anon',pg_catalog.to_regclass('public.education_final_grades'),'SELECT'),false),
  'atomic_start_rpc', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.start_cbt_attempt(uuid)') AND p.prosecdef AND ('search_path='=ANY(COALESCE(p.proconfig,ARRAY[]::text[])) OR 'search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))) AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')),
  'atomic_save_rpc', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.save_cbt_answer(uuid,uuid,uuid,text)') AND p.prosecdef AND ('search_path='=ANY(COALESCE(p.proconfig,ARRAY[]::text[])) OR 'search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))) AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')),
  'atomic_submit_rpc', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.submit_cbt_attempt(uuid)') AND p.prosecdef AND ('search_path='=ANY(COALESCE(p.proconfig,ARRAY[]::text[])) OR 'search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))) AND pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')),
  'trusted_final_grade_rpc', EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure('public.education_finalize_cbt_grade(uuid)') AND p.prosecdef AND ('search_path='=ANY(COALESCE(p.proconfig,ARRAY[]::text[])) OR 'search_path=""'=ANY(COALESCE(p.proconfig,ARRAY[]::text[]))) AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')),
  'no_student_attempt_score_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'score','INSERT'),false),
  'no_student_attempt_max_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'max_score','INSERT'),false),
  'no_student_attempt_time_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'end_time','UPDATE'),false),
  'no_student_attempt_time_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_attempts'),'end_time','INSERT'),false),
  'no_student_answer_correct_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'is_correct','INSERT'),false),
  'no_student_answer_text_insert', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'short_answer_text','INSERT'),false),
  'no_student_answer_option_update', COALESCE(NOT pg_catalog.has_column_privilege('authenticated',pg_catalog.to_regclass('public.user_answers'),'selected_option_id','UPDATE'),false),
  'finalized_review_lock_enabled', EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid WHERE c.oid=pg_catalog.to_regclass('public.education_written_reviews') AND t.tgname='education_lock_final_review' AND NOT t.tgisinternal AND t.tgenabled IN ('O','A'))
))::text;
ROLLBACK;
