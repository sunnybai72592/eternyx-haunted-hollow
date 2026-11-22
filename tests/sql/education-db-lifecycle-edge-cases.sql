-- ETERNYX Education: adversarial publication, authoring, timing and answer checks.
-- Synthetic PostgreSQL fixture ONLY; run after education-db-adversarial.sql.
-- This test neither deploys Supabase migrations nor certifies hosted JWT/PostgREST.

-- Recover fixture IDs in this independent psql process before changing roles.
SELECT pg_catalog.set_config('eternyx.edge_b_draft',
  (SELECT id::text FROM public.tests WHERE title = 'Secondary Instructor Bank'), false);
SELECT pg_catalog.set_config('eternyx.edge_a_test',
  (SELECT id::text FROM public.tests WHERE title = 'CP Fundamentals Assessment'), false);
SELECT pg_catalog.set_config('eternyx.edge_foreign_option',
  (SELECT o.id::text FROM public.options AS o
     JOIN public.questions AS q ON q.id = o.question_id
     JOIN public.tests AS t ON t.id = q.test_id
   WHERE t.title = 'CP Fundamentals Assessment'
   ORDER BY o.id LIMIT 1), false);
DO $edge$
BEGIN
  IF NULLIF(pg_catalog.current_setting('eternyx.edge_b_draft',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('eternyx.edge_a_test',true),'') IS NULL
     OR NULLIF(pg_catalog.current_setting('eternyx.edge_foreign_option',true),'') IS NULL THEN
    RAISE EXCEPTION 'Required Education baseline and adversarial fixtures are missing';
  END IF;
END
$edge$;

-- 1. A connection carrying the authenticated DB role but no auth identity
-- cannot use authorized RPCs. PostgreSQL role alone is not student authority.
SET ROLE authenticated;
SET request.jwt.claim.sub = '';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_student_enrolled_catalog()$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_instructor_list_drafts()$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)$sql$);

-- 2. A legitimate instructor cannot persist malformed question banks.
-- Each rejected SECURITY DEFINER call must roll back its own INSERTs.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft('{}'::jsonb)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft(
    '{"version":1,"title":"Bad Exam","duration_minutes":0,"questions":[]}'::jsonb)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft(
    '{"version":1,"title":"Duplicate Question","duration_minutes":15,
      "questions":[
        {"id":"reused","type":"short_answer","text":"First question","points":2,"options":[]},
        {"id":"reused","type":"short_answer","text":"Second question","points":2,"options":[]}
      ]}'::jsonb)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft(
    '{"version":1,"title":"Two Correct Choices","duration_minutes":15,
      "questions":[{"id":"q","type":"multiple_choice","text":"Pick one option","points":1,
        "options":[{"id":"a","text":"A","correct":true},
                   {"id":"b","text":"B","correct":true}]}]}'::jsonb)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft(
    '{"version":1,"title":"String Correct Value","duration_minutes":15,
      "questions":[{"id":"q","type":"multiple_choice","text":"Pick one option","points":1,
        "options":[{"id":"a","text":"A","correct":"yes"},
                   {"id":"b","text":"B","correct":false}]}]}'::jsonb)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_instructor_create_draft(
    '{"version":1,"title":"Essay With Options","duration_minutes":15,
      "questions":[{"id":"q","type":"short_answer","text":"Explain corrosion","points":3,
        "options":[{"id":"a","text":"Answer key","correct":true}]}]}'::jsonb)$sql$);

-- 3. Only the owning instructor can request publication; they can re-request
-- a rejected draft, but they cannot approve their own request.
DO $edge$
BEGIN
  IF public.education_request_publication(
     pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'Approved instructor could not request review';
  END IF;
END
$edge$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_request_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_admin_review_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid,true)$sql$);

-- 4. A real administrator can reject, then consider a repeat submission.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $edge$
DECLARE v_test uuid := pg_catalog.current_setting('eternyx.edge_b_draft')::uuid;
BEGIN
  IF public.education_admin_review_publication(v_test,false)->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'Admin could not reject an eligible pending request';
  END IF;
  IF pg_catalog.jsonb_array_length(public.education_admin_publication_queue()) <> 0 THEN
    RAISE EXCEPTION 'Rejected request unexpectedly remains in pending queue';
  END IF;
END
$edge$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
DO $edge$
BEGIN
  IF public.education_request_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'Rejected draft cannot be re-requested';
  END IF;
END
$edge$;

-- 5. Revoking instructor approval while publication is pending blocks review.
-- Reinstating the trusted approval can make the still-pending draft eligible.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $edge$
BEGIN
  IF public.admin_revoke_education_instructor(
    '00000000-0000-4000-8000-000000000003'::uuid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Admin could not revoke instructor B';
  END IF;
END
$edge$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_admin_review_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid,true)$sql$);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.education_request_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)$sql$);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $edge$
DECLARE v_test uuid := pg_catalog.current_setting('eternyx.edge_b_draft')::uuid;
BEGIN
  IF public.admin_approve_education_instructor(
    '00000000-0000-4000-8000-000000000003'::uuid,'Reviewed Instructor B'
  )->>'approved' <> 'true' THEN
    RAISE EXCEPTION 'Trusted instructor approval could not be restored';
  END IF;
  IF public.education_admin_review_publication(v_test,true)->>'status' <> 'approved' THEN
    RAISE EXCEPTION 'Re-reviewed test did not publish';
  END IF;
END
$edge$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.education_admin_review_publication(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid,true)$sql$);

-- 6. Unenrolled Student B must not see or enter that newly published test.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $edge$
BEGIN
  IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog()) <> 0 THEN
    RAISE EXCEPTION 'Unenrolled Student B sees the newly approved exam';
  END IF;
END
$edge$;
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)$sql$);
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
DO $edge$
BEGIN
  IF public.education_admin_enroll_student(
     pg_catalog.current_setting('eternyx.edge_b_draft')::uuid,
     '00000000-0000-4000-8000-000000000005'::uuid
   )->>'status' <> 'enrolled' THEN
    RAISE EXCEPTION 'Admin could not enroll Student B';
  END IF;
END
$edge$;

-- 7. An enrolled student can start but cannot save an answer from another
-- question/test, unknown question, or prose in an objective question.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $edge$
DECLARE v_started jsonb;
BEGIN
  SELECT public.start_cbt_attempt(
     pg_catalog.current_setting('eternyx.edge_b_draft')::uuid) INTO v_started;
  IF v_started->>'status' <> 'in_progress' THEN
    RAISE EXCEPTION 'Student B could not start their own approved exam';
  END IF;
  PERFORM pg_catalog.set_config('eternyx.edge_b_attempt', v_started->>'id', false);
END
$edge$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.save_cbt_answer(
    pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,NULL,NULL)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.save_cbt_answer(
    pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid,
    (SELECT id FROM public.questions
      WHERE test_id=pg_catalog.current_setting('eternyx.edge_b_draft')::uuid LIMIT 1),
    pg_catalog.current_setting('eternyx.edge_foreign_option')::uuid,NULL)$sql$);
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.save_cbt_answer(
    pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid,
    (SELECT id FROM public.questions
      WHERE test_id=pg_catalog.current_setting('eternyx.edge_b_draft')::uuid LIMIT 1),
    NULL,'Forged short answer on a multiple choice question')$sql$);

-- 8. Valid save, replace and clear operations work before expiry.
DO $edge$
DECLARE
  v_attempt uuid := pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid;
  v_question uuid;
  v_choice uuid;
BEGIN
  SELECT q.id, o.id INTO v_question,v_choice FROM public.questions AS q
  JOIN public.options AS o ON o.question_id=q.id
  WHERE q.test_id=pg_catalog.current_setting('eternyx.edge_b_draft')::uuid
    AND o.option_text='Soil' LIMIT 1;
  IF v_question IS NULL OR v_choice IS NULL THEN
    RAISE EXCEPTION 'Student B cannot see a permitted option';
  END IF;
  -- Keep only the synthetic option/question UUIDs for post-deadline probes:
  -- student RLS may deliberately hide option rows after the deadline.
  PERFORM pg_catalog.set_config('eternyx.edge_b_question',v_question::text,false);
  PERFORM pg_catalog.set_config('eternyx.edge_b_choice',v_choice::text,false);
  IF public.save_cbt_answer(v_attempt,v_question,v_choice,NULL)->>'status' <> 'saved' THEN
    RAISE EXCEPTION 'Initial objective answer save failed';
  END IF;
  IF public.save_cbt_answer(v_attempt,v_question,NULL,NULL)->>'status' <> 'cleared' THEN
    RAISE EXCEPTION 'Objective answer clear failed';
  END IF;
  IF public.save_cbt_answer(v_attempt,v_question,v_choice,NULL)->>'status' <> 'saved' THEN
    RAISE EXCEPTION 'Objective answer re-save failed';
  END IF;
END
$edge$;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.save_cbt_answer(
    pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid,
    '11111111-1111-4111-8111-111111111111'::uuid,NULL,NULL)$sql$);
SELECT public.education_ci_expect_denied(
  $sql$SELECT public.submit_cbt_attempt(
    pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid)$sql$);

-- 9. Simulate an expired attempt by moving ONLY a synthetic fixture clock.
-- Database time, not the browser clock, must enforce expiry and preserve saved
-- responses. Only the trusted fixture owner can make this setup mutation.
RESET ROLE;
UPDATE public.user_attempts SET start_time=clock_timestamp()-INTERVAL '30 minutes'
WHERE id=pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid
  AND status='in_progress';
DO $edge$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.user_attempts
      WHERE id=pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid
        AND start_time < clock_timestamp()-INTERVAL '20 minutes') <> 1 THEN
    RAISE EXCEPTION 'Synthetic expiry fixture was not moved behind deadline';
  END IF;
END
$edge$;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
DO $edge$
DECLARE
  v_question uuid := pg_catalog.current_setting('eternyx.edge_b_question')::uuid;
  v_choice uuid := pg_catalog.current_setting('eternyx.edge_b_choice')::uuid;
  v_attempt uuid := pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid;
BEGIN
  IF public.save_cbt_answer(v_attempt,v_question,v_choice,NULL)->>'status' <> 'expired' THEN
    RAISE EXCEPTION 'Expired attempt accepted a save';
  END IF;
  IF public.submit_cbt_attempt(v_attempt)->>'status' <> 'auto_submitted' THEN
    RAISE EXCEPTION 'Expired attempt status did not remain auto-submitted';
  END IF;
  IF public.save_cbt_answer(v_attempt,v_question,v_choice,NULL)->>'status'
    <> 'already_submitted' THEN
    RAISE EXCEPTION 'Expired attempt accepted a subsequent write';
  END IF;
END
$edge$;
SELECT public.education_ci_expect_invalid(
  $sql$SELECT public.start_cbt_attempt(
    pg_catalog.current_setting('eternyx.edge_b_draft')::uuid)$sql$);

-- 10. Final integrity checked as database fixture owner: approved publication,
-- separate student enrollment, preserved A result and B expired answer.
RESET ROLE;
DO $edge$
DECLARE v_b_attempt uuid := pg_catalog.current_setting('eternyx.edge_b_attempt')::uuid;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.tests
      WHERE title='Secondary Instructor Bank' AND is_active AND is_published) <> 1
     OR (SELECT pg_catalog.count(*) FROM public.education_publication_requests
      WHERE test_id=pg_catalog.current_setting('eternyx.edge_b_draft')::uuid
        AND status='approved') <> 1
     OR (SELECT pg_catalog.count(*) FROM public.education_test_enrollments) <> 2
     OR (SELECT pg_catalog.count(*) FROM public.user_attempts WHERE status='submitted') <> 1
     OR (SELECT pg_catalog.count(*) FROM public.user_attempts
         WHERE id=v_b_attempt AND status='auto_submitted' AND end_time IS NOT NULL) <> 1
     OR (SELECT pg_catalog.count(*) FROM public.user_answers
         WHERE attempt_id=v_b_attempt AND points_awarded IS NULL
           AND is_correct IS NULL) <> 1
     OR (SELECT pg_catalog.count(*) FROM public.tests
         WHERE title LIKE 'Bad Exam%' OR title='Duplicate Question'
            OR title='Two Correct Choices' OR title='String Correct Value'
            OR title='Essay With Options') <> 0 THEN
    RAISE EXCEPTION 'Education edge-case lifecycle violated persisted integrity';
  END IF;
END
$edge$;
SELECT 'Education authoring, publication, and deadline edge cases passed in isolated PostgreSQL' AS result;
