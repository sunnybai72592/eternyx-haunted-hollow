-- Additional adversarial checks for the synthetic, disposable PostgreSQL CI fixture.
-- Run AFTER education-db-acceptance.sql in a fresh psql connection.
-- This does NOT attest to Supabase gateways, live JWTs, deployed grants or production.
--
-- 1) Anonymous function and sensitive-column boundary.
DO $test$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.start_cbt_attempt(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.save_cbt_answer(uuid,uuid,uuid,text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.submit_cbt_attempt(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.education_instructor_create_draft(jsonb)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.education_admin_enroll_student(uuid,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.education_student_can_read_questions(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role may invoke a protected Education RPC';
  END IF;
  IF pg_catalog.has_column_privilege('authenticated','public.options','is_correct','SELECT')
     OR pg_catalog.has_column_privilege('authenticated','public.options','is_correct','UPDATE')
     OR pg_catalog.has_column_privilege('authenticated','public.user_answers','is_correct','INSERT')
     OR pg_catalog.has_column_privilege('authenticated','public.user_answers','points_awarded','INSERT')
     OR pg_catalog.has_column_privilege('authenticated','public.user_attempts','score','INSERT')
     OR pg_catalog.has_column_privilege('authenticated','public.user_attempts','max_score','INSERT') THEN
    RAISE EXCEPTION 'Browser role retains a private key/grade insert or update privilege';
  END IF;
END
$test$;

-- New psql processes do not share custom session settings from the first test.
-- Retrieve only synthetic fixture row IDs as the fixture owner, then switch roles.
SELECT pg_catalog.set_config(
  'eternyx.education_ci_existing_attempt',
  (SELECT id::text FROM public.user_attempts
   WHERE user_id='00000000-0000-4000-8000-000000000004'::uuid),
  false
);
SELECT pg_catalog.set_config(
  'eternyx.education_ci_published_test',
  (SELECT id::text FROM public.tests WHERE title='CP Fundamentals Assessment'),
  false
);
DO $test$
BEGIN
  IF NULLIF(pg_catalog.current_setting('eternyx.education_ci_existing_attempt',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('eternyx.education_ci_published_test',true),'') IS NULL THEN
    RAISE EXCEPTION 'Prior CBT acceptance fixture is missing';
  END IF;
END
$test$;

-- 2) Student B has no access to student A's published exam, questions, or attempt.
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.tests) <> 0
     OR (SELECT pg_catalog.count(*) FROM public.questions) <> 0
     OR (SELECT pg_catalog.count(*) FROM public.options) <> 0
     OR (SELECT pg_catalog.count(*) FROM public.user_attempts) <> 0
     OR (SELECT pg_catalog.count(*) FROM public.user_answers) <> 0 THEN
    RAISE EXCEPTION 'Cross-student exam or attempt rows were readable';
  END IF;
END
$test$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.save_cbt_answer(
    pg_catalog.current_setting('eternyx.education_ci_existing_attempt')::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid, NULL, NULL)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.submit_cbt_attempt(
    pg_catalog.current_setting('eternyx.education_ci_existing_attempt')::uuid)$sql$);

-- 3) A browser cannot change publication, grades, attempts or answer keys by SQL.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.tests SET is_published=false$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.options SET is_correct=true$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.user_answers SET points_awarded=500$sql$);
SELECT public.education_ci_expect_denied(
  $sql$INSERT INTO public.user_attempts (user_id,test_id,status,score)
  VALUES ('00000000-0000-4000-8000-000000000004'::uuid,
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid,
    'submitted',999)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$INSERT INTO public.user_answers
    (attempt_id,question_id,is_correct,points_awarded)
  VALUES (pg_catalog.current_setting('eternyx.education_ci_existing_attempt')::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,true,999)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_admin_enroll_student(
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid,
    '00000000-0000-4000-8000-000000000005'::uuid)$sql$);

-- 4) Submitted attempts are immutable; repeat submission is idempotent;
-- a student cannot restart their completed unique attempt.
DO $test$
DECLARE
  v_attempt uuid := pg_catalog.current_setting('eternyx.education_ci_existing_attempt')::uuid;
  v_question uuid;
BEGIN
  SELECT q.id INTO v_question FROM public.questions AS q
  WHERE q.test_id=pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid
  LIMIT 1;
  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Student A lost access to their enrolled question';
  END IF;
  IF public.save_cbt_answer(v_attempt,v_question,NULL,NULL)->>'status'
       IS DISTINCT FROM 'already_submitted' THEN
    RAISE EXCEPTION 'Submitted attempt accepted another answer mutation';
  END IF;
  IF public.submit_cbt_attempt(v_attempt)->>'status'
       IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'Repeat submission did not preserve final state';
  END IF;
END
$test$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid)$sql$);

-- 5) Admin enrollment: duplicate requests do not multiply rows; nonexistent
-- Auth users cannot be enrolled; unstarted enrollments can be revoked.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $test$
DECLARE v_test uuid := pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid;
BEGIN
  PERFORM public.education_admin_enroll_student(
    v_test,'00000000-0000-4000-8000-000000000004'::uuid);
  PERFORM public.education_admin_enroll_student(
    v_test,'00000000-0000-4000-8000-000000000004'::uuid);
  PERFORM public.education_admin_enroll_student(
    v_test,'00000000-0000-4000-8000-000000000005'::uuid);
END
$test$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_admin_enroll_student(
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid,
    '99999999-9999-4999-8999-999999999999'::uuid)$sql$);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $test$
BEGIN
  IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog()) <> 1 THEN
    RAISE EXCEPTION 'Newly enrolled Student B cannot see their one exam';
  END IF;
END
$test$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $test$
BEGIN
  IF public.education_admin_revoke_enrollment(
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid,
    '00000000-0000-4000-8000-000000000005'::uuid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Admin could not revoke a not-yet-started enrollment';
  END IF;
END
$test$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $test$
BEGIN
  IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog()) <> 0 THEN
    RAISE EXCEPTION 'Revoked learner still sees the enrolled catalog entry';
  END IF;
END
$test$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.education_ci_published_test')::uuid)$sql$);

-- 6) Independently approved instructor B can own a second private bank;
-- instructor A cannot load instructor B's questions/correct options.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
SELECT pg_catalog.set_config('eternyx.education_ci_second_draft',
  public.education_instructor_create_draft(
    '{"version":1,"title":"Secondary Instructor Bank","description":"Private alternate bank",
      "duration_minutes":20,"questions":[{"id":"mcq-b","type":"multiple_choice",
       "text":"Which environment conducts ionic current?","points":1,
       "options":[{"id":"b1","text":"Soil","correct":true},
                  {"id":"b2","text":"Dry glass","correct":false}]}]}'::jsonb
  )->>'id', false);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_instructor_load_draft(
    pg_catalog.current_setting('eternyx.education_ci_second_draft')::uuid)$sql$);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000006';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_instructor_create_draft('{}'::jsonb)$sql$);

-- 7) Assert final persisted state as the fixture owner, not through the
-- browser's RLS-limited view. No irreversible external effects occur.
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.education_test_enrollments) <> 1
     OR (SELECT pg_catalog.count(*) FROM public.user_attempts
          WHERE status='submitted') <> 1
     OR (SELECT pg_catalog.count(*) FROM public.user_answers) <> 1
     OR (SELECT pg_catalog.count(*) FROM public.tests
          WHERE title='Secondary Instructor Bank' AND is_published IS FALSE) <> 1 THEN
    RAISE EXCEPTION 'Adversarial Education verification changed persisted exam state';
  END IF;
END
$test$;
SELECT 'Adversarial Education role and lifecycle checks passed in disposable Postgres' AS result;
