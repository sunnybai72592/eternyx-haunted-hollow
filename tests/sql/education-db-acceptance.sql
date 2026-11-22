-- Real SQL acceptance, only against the disposable PostgreSQL CI container.
-- Every person and exam is synthetic. No network, external keys or live Supabase.

CREATE FUNCTION public.education_ci_expect_denied(p_sql text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Expected authorization denial, but SQL succeeded';
END;
$fn$;
CREATE FUNCTION public.education_ci_expect_invalid(p_sql text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Expected input validation rejection, but SQL succeeded';
END;
$fn$;

-- Verify the historical broad SELECT/UPDATE grants were actually removed.
DO $fn$
BEGIN
  IF pg_catalog.has_column_privilege('authenticated','public.options','is_correct','SELECT') THEN
    RAISE EXCEPTION 'Answer-key column remains readable by browser role';
  END IF;
  IF pg_catalog.has_column_privilege('authenticated','public.user_answers','points_awarded','UPDATE')
     OR pg_catalog.has_column_privilege('authenticated','public.user_answers','is_correct','UPDATE')
     OR pg_catalog.has_column_privilege('authenticated','public.user_attempts','score','UPDATE') THEN
    RAISE EXCEPTION 'Student grading/score write grants survived staged REVOKE';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated','public.education_instructor_grants','SELECT')
     OR pg_catalog.has_table_privilege('authenticated','public.education_test_enrollments','SELECT') THEN
    RAISE EXCEPTION 'Sensitive instructor/enrollment tables exposed';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated','public.education_publication_ready(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Internal readiness checker exposed';
  END IF;
END;
$fn$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.admin_approve_education_instructor(
    '00000000-0000-4000-8000-000000000006'::uuid,'Fake Teacher')$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_admin_publication_queue()$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_admin_enroll_student(
    '11111111-1111-4111-8111-111111111111'::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT is_correct FROM public.options LIMIT 1$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.user_answers SET points_awarded=999$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.user_attempts SET score=999$sql$);
DO $fn$
BEGIN
  IF (public.education_instructor_access()->>'approved')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Student unexpectedly approved as instructor';
  END IF;
END;
$fn$;

-- Trusted administrator explicitly approves ONLY the intended two instructors.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $fn$
DECLARE v_a jsonb; v_b jsonb;
BEGIN
  SELECT public.admin_approve_education_instructor(
    '00000000-0000-4000-8000-000000000002','Reviewed Instructor A') INTO v_a;
  SELECT public.admin_approve_education_instructor(
    '00000000-0000-4000-8000-000000000003','Reviewed Instructor B') INTO v_b;
  IF v_a->>'approved' <> 'true' OR v_b->>'approved' <> 'true' THEN
    RAISE EXCEPTION 'Admin approval did not return true';
  END IF;
END;
$fn$;

-- Unapproved user has a teacher DB record but cannot author or publish.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000006';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_request_publication(
    '11111111-1111-4111-8111-111111111111'::uuid)$sql$);
DO $fn$
BEGIN
  IF (public.education_instructor_access()->>'approved')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Unapproved teacher record bypassed trusted grant';
  END IF;
END;
$fn$;

-- Approved instructor saves a real, validated private bank via SECURITY DEFINER.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
SELECT pg_catalog.set_config('eternyx.education_ci_test_id',
  (public.education_instructor_create_draft(
    $json$
    {"version":1,"title":"CP Fundamentals Assessment","description":"Corrosion control practice",
     "duration_minutes":25,"questions":[
       {"id":"mcq-1","type":"multiple_choice","text":"Which material is a sacrificial anode?","points":5,
        "options":[{"id":"opt-1","text":"Magnesium","correct":true},{"id":"opt-2","text":"Steel","correct":false}]},
       {"id":"tf-1","type":"true_false","text":"Does coating reduce CP current demand?","points":3,
        "options":[{"id":"opt-true","text":"True","correct":true},{"id":"opt-false","text":"False","correct":false}]},
       {"id":"essay-1","type":"short_answer","text":"Explain polarization in cathodic protection","points":2,"options":[]}
     ]}
    $json$::jsonb
  )->>'id'),false);
DO $fn$
DECLARE
 v_id uuid := pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid;
 v_loaded jsonb;
 v_drafts jsonb;
BEGIN
  SELECT public.education_instructor_load_draft(v_id) INTO v_loaded;
  SELECT public.education_instructor_list_drafts() INTO v_drafts;
  IF v_loaded->>'status' <> 'private_draft'
     OR pg_catalog.jsonb_array_length(v_loaded->'bank'->'questions') <> 3
     OR pg_catalog.jsonb_array_length(v_drafts) <> 1 THEN
    RAISE EXCEPTION 'Owned private authoring read-back failed';
  END IF;
  -- MCQ choices intentionally restore in stable UUID order; correctness
  -- must be checked by option identity rather than list position.
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_array_elements(v_loaded->'bank'->'questions'->0->'options') AS o(value)
      WHERE o.value->>'correct' = 'true') <> 1
     OR NOT EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_array_elements(v_loaded->'bank'->'questions'->0->'options') AS o(value)
       WHERE o.value->>'text' = 'Magnesium' AND o.value->>'correct' = 'true'
     ) THEN
    RAISE EXCEPTION 'Authorized authoring view lost correct answer identity';
  END IF;
  IF (public.education_request_publication(v_id)->>'status') <> 'pending' THEN
    RAISE EXCEPTION 'Teacher publication request did not enter pending state';
  END IF;
END;
$fn$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_admin_review_publication(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid,true)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT is_correct FROM public.options LIMIT 1$sql$);

-- Approved Instructor B cannot read, re-publish or replace A's answer keys.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_instructor_load_draft(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_request_publication(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid)$sql$);

-- Admin sees request metadata, approves, enrolls Student A.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $fn$
DECLARE
  v_test uuid:=pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid;
  v_queue jsonb;
BEGIN
  SELECT public.education_admin_publication_queue() INTO v_queue;
  IF pg_catalog.jsonb_array_length(v_queue) <> 1 THEN
    RAISE EXCEPTION 'Pending review queue did not show one request';
  END IF;
  IF (public.education_admin_review_publication(v_test,true)->>'status') <> 'approved' THEN
    RAISE EXCEPTION 'Trusted admin did not approve published exam';
  END IF;
  IF (public.education_admin_enroll_student(
    v_test,'00000000-0000-4000-8000-000000000004')->>'status') <> 'enrolled' THEN
    RAISE EXCEPTION 'Trusted admin did not enroll student A';
  END IF;
END;
$fn$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_admin_review_publication(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid,true)$sql$);

-- No student may see or enter an unenrolled exam.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $fn$
BEGIN
  IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog()) <> 0 THEN
    RAISE EXCEPTION 'Unenrolled student saw someone else test';
  END IF;
END;
$fn$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid)$sql$);

-- Student A can see their own catalog, start exactly one timed exam,
-- save a real option UUID, then finalize; answer keys still remain hidden.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
DO $fn$
DECLARE
  v_id uuid:=pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid;
  v_attempt jsonb;
  v_option uuid;
  v_question uuid;
  v_submitted jsonb;
BEGIN
  IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog()) <> 1 THEN
    RAISE EXCEPTION 'Student did not see their enrolled exam';
  END IF;
  SELECT public.start_cbt_attempt(v_id) INTO v_attempt;
  IF v_attempt->>'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'Enrolled student could not start exam';
  END IF;
  PERFORM pg_catalog.set_config('eternyx.education_ci_attempt_id',v_attempt->>'id',false);
  SELECT o.id, o.question_id INTO v_option,v_question
  FROM public.options AS o
  WHERE o.option_text='Magnesium'
  LIMIT 1;
  IF v_option IS NULL OR v_question IS NULL THEN
    RAISE EXCEPTION 'Student cannot read permitted option labels in owned active attempt';
  END IF;
  IF (public.save_cbt_answer((v_attempt->>'id')::uuid,v_question,v_option,NULL)->>'status') <> 'saved' THEN
    RAISE EXCEPTION 'Student answer was not saved via secured RPC';
  END IF;
  SELECT public.submit_cbt_attempt((v_attempt->>'id')::uuid) INTO v_submitted;
  IF v_submitted->>'status' <> 'submitted' THEN
    RAISE EXCEPTION 'Expected manual submission before deadline';
  END IF;
  IF (public.submit_cbt_attempt((v_attempt->>'id')::uuid)->>'status') <> 'submitted' THEN
    RAISE EXCEPTION 'Repeat submission did not remain idempotent';
  END IF;
END;
$fn$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT is_correct FROM public.options LIMIT 1$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.user_attempts SET score=1000$sql$);
SELECT public.education_ci_expect_denied(
  $sql$UPDATE public.user_answers SET is_correct=true$sql$);

-- Enrollments cannot be revoked once an attempt exists.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_admin_revoke_enrollment(
    pg_catalog.current_setting('eternyx.education_ci_test_id')::uuid,
    '00000000-0000-4000-8000-000000000004'::uuid)$sql$);
RESET ROLE;
DO $fn$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.tests WHERE is_active IS TRUE AND is_published IS TRUE) <> 1
      OR (SELECT pg_catalog.count(*) FROM public.education_test_enrollments) <> 1
      OR (SELECT pg_catalog.count(*) FROM public.user_attempts WHERE status='submitted') <> 1 THEN
    RAISE EXCEPTION 'Final persisted assessment state was incorrect';
  END IF;
END;
$fn$;
SELECT 'Education staging SQL executed, permissions and exam lifecycle verified in disposable Postgres' AS result;
