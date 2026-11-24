-- One-time synthetic staging fixtures. NOT a migration or Auth account creator.
-- Run only through the guarded staging operator script. Never use production.
\getenv a_email ETERNYX_RLS_TEST_A_EMAIL
\getenv b_email ETERNYX_RLS_TEST_B_EMAIL
\getenv i_email ETERNYX_RLS_INSTRUCTOR_EMAIL
\getenv operator_email ETERNYX_EDU_FIXTURE_OPERATOR_EMAIL
\getenv approval ETERNYX_EDU_FIXTURE_APPROVAL
BEGIN;
SELECT set_config('education.fixture.a', :'a_email', true) AS a,
 set_config('education.fixture.b', :'b_email', true) AS b,
 set_config('education.fixture.i', :'i_email', true) AS i,
 set_config('education.fixture.operator', :'operator_email', true) AS operator,
 set_config('education.fixture.approval', :'approval', true) AS approval
\gset
CREATE TEMP TABLE education_fixture_manifest (data jsonb) ON COMMIT PRESERVE ROWS;
DO $fixture$
DECLARE
 a uuid; b uuid; instructor uuid; operator_id uuid; teacher uuid;
 exam uuid; mcq uuid; essay uuid; choice uuid; attempt uuid; answer uuid; written uuid;
 learner uuid; kind text; receipt jsonb; manifest jsonb := '{}'::jsonb;
 prefix constant text := 'ETERNYX synthetic acceptance v1 / ';
BEGIN
 IF current_setting('education.fixture.approval') <> 'I_APPROVE_ONE_TIME_EDUCATION_STAGING_FIXTURES' THEN
  RAISE EXCEPTION 'Fixture approval required';
 END IF;
 -- Serialize this one-time operation; existing rows are never replaced or deleted.
 PERFORM pg_advisory_xact_lock(184728, 20261124);
 IF EXISTS (SELECT 1 FROM public.tests WHERE title LIKE prefix || '%') THEN
  RAISE EXCEPTION 'Synthetic fixture already exists; inspect it, never automatically retry';
 END IF;
 SELECT id INTO STRICT a FROM auth.users WHERE lower(email)=lower(current_setting('education.fixture.a')) AND email ~* '^rls-[^@]+@[^@]+[.][^@]+$';
 SELECT id INTO STRICT b FROM auth.users WHERE lower(email)=lower(current_setting('education.fixture.b')) AND email ~* '^rls-[^@]+@[^@]+[.][^@]+$';
 SELECT id INTO STRICT instructor FROM auth.users WHERE lower(email)=lower(current_setting('education.fixture.i')) AND email ~* '^rls-[^@]+@[^@]+[.][^@]+$';
 SELECT id INTO STRICT operator_id FROM auth.users WHERE lower(email)=lower(current_setting('education.fixture.operator')) AND email ~* '^rls-[^@]+@[^@]+[.][^@]+$';
 IF (SELECT count(DISTINCT x) FROM unnest(ARRAY[a,b,instructor,operator_id]) x) <> 4
 OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id IN (a,b,instructor))
 OR NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id=operator_id)
 OR EXISTS (SELECT 1 FROM public.education_instructor_grants WHERE user_id IN (a,b,instructor,operator_id))
 OR EXISTS (SELECT 1 FROM public.teachers WHERE user_id IN (a,b,instructor,operator_id)) THEN
  RAISE EXCEPTION 'Four distinct dedicated identities, one preapproved operator, and ungranted learners/instructor required';
 END IF;
 INSERT INTO public.teachers(user_id,name) VALUES(instructor,'Synthetic staging instructor') RETURNING id INTO teacher;
 INSERT INTO public.education_instructor_grants(user_id,teacher_id) VALUES(instructor,teacher);
 FOR kind IN SELECT unnest(ARRAY['read','fresh','final-a','final-b','pending','running','legacy']) LOOP
  learner := CASE WHEN kind='final-b' THEN b ELSE a END;
  INSERT INTO public.tests(title,description,duration_minutes,teacher_id,is_active,is_published)
  VALUES(prefix||kind,'Synthetic test fixture only; not a real credential',1440,teacher,true,true) RETURNING id INTO exam;
  INSERT INTO public.questions(test_id,question_text,question_type,points,order_index)
  VALUES(exam,'Which method measures a potential difference?','multiple_choice',5,1) RETURNING id INTO mcq;
  INSERT INTO public.questions(test_id,question_text,question_type,points,order_index)
  VALUES(exam,'Explain polarization in a short sentence.','short_answer',2,2) RETURNING id INTO essay;
  INSERT INTO public.options(question_id,option_text,is_correct)
  VALUES(mcq,'Voltage measurement',true) RETURNING id INTO choice;
  INSERT INTO public.options(question_id,option_text,is_correct) VALUES(mcq,'Mass measurement',false);
  INSERT INTO public.education_publication_requests(test_id,teacher_id,status,reviewed_at,reviewed_by)
  VALUES(exam,teacher,'approved',clock_timestamp(),operator_id);
  INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by) VALUES(exam,learner,operator_id);
  IF kind='fresh' THEN
   manifest:=manifest||jsonb_build_object('ETERNYX_EDU_WRITE_TEST_ID',exam,'ETERNYX_EDU_WRITE_MCQ_ID',mcq,
    'ETERNYX_EDU_WRITE_MCQ_OPTION_ID',choice,'ETERNYX_EDU_WRITE_ESSAY_ID',essay);
   CONTINUE; -- Do not consume the fresh one-time exam.
  END IF;
  INSERT INTO public.user_attempts(user_id,test_id,status,start_time,end_time,score,max_score)
  VALUES(learner,exam,CASE WHEN kind IN ('read','running') THEN 'in_progress' ELSE 'submitted' END,
   clock_timestamp(),CASE WHEN kind IN ('read','running') THEN NULL ELSE clock_timestamp() END,
   CASE WHEN kind='legacy' THEN 5 ELSE NULL END,CASE WHEN kind='legacy' THEN 7 ELSE NULL END)
  RETURNING id INTO attempt;
  INSERT INTO public.user_answers(attempt_id,question_id,selected_option_id)
  VALUES(attempt,mcq,choice) RETURNING id INTO answer;
  IF kind='read' THEN
   manifest:=manifest||jsonb_build_object('ETERNYX_EDU_STAGING_TEST_ID',exam,'ETERNYX_EDU_STAGING_QUESTION_ID',mcq,
    'ETERNYX_EDU_STAGING_OPTION_ID',choice,'ETERNYX_EDU_STAGING_ATTEMPT_ID',attempt,'ETERNYX_EDU_STAGING_ANSWER_ID',answer);
  ELSIF kind IN ('final-a','final-b') THEN
   INSERT INTO public.user_answers(attempt_id,question_id,short_answer_text)
   VALUES(attempt,essay,'Synthetic fixture response: polarization changes electrode potential.') RETURNING id INTO written;
   INSERT INTO public.education_written_reviews(answer_id,points_awarded,reviewer_user_id) VALUES(written,2,instructor);
   -- Real trusted grading function, not a fabricated ledger row.
   receipt:=public.education_finalize_cbt_grade(attempt);
   IF (receipt->>'score')::int IS DISTINCT FROM 7 OR (receipt->>'max_score')::int IS DISTINCT FROM 7
   OR NOT EXISTS (SELECT 1 FROM public.education_final_grades WHERE attempt_id=attempt AND score=7 AND max_score=7) THEN
    RAISE EXCEPTION 'Synthetic official finalization failed';
   END IF;
   IF kind='final-a' THEN
    manifest:=manifest||jsonb_build_object('ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT',attempt,
     'ETERNYX_EDU_REVIEW_TEST_ID',exam,'ETERNYX_EDU_REVIEW_ATTEMPT_ID',attempt,'ETERNYX_EDU_REVIEW_ANSWER_ID',written);
   ELSE
    manifest:=manifest||jsonb_build_object('ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT',attempt);
   END IF;
  ELSE
   manifest:=manifest||jsonb_build_object('ETERNYX_EDU_RESULT_'||upper(kind)||'_A_ATTEMPT',attempt);
  END IF;
 END LOOP;
 manifest:=manifest||jsonb_build_object('ETERNYX_EDU_RESULT_A_SCORE','7','ETERNYX_EDU_RESULT_A_MAX','7',
  'ETERNYX_EDU_RESULT_B_SCORE','7','ETERNYX_EDU_RESULT_B_MAX','7',
  'ETERNYX_EDU_REVIEW_AWARDED_POINTS','2','ETERNYX_EDU_FINALIZE_EXPECTED_SCORE','7','ETERNYX_EDU_FINALIZE_EXPECTED_MAX','7');
 INSERT INTO education_fixture_manifest VALUES(manifest);
END
$fixture$;
COMMIT;
SELECT data::text FROM education_fixture_manifest;
