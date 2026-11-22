-- ETERNYX Education — complete instructor-to-learner CBT rehearsal.
-- Disposable, network-disabled PostgreSQL 17 ONLY, after all current staged
-- Education SQL and acceptance checks. All users/exams below are synthetic.
-- This does NOT run hosted Supabase Auth or certify production.
--
-- 1. Create independent learner identities for this one new exam.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000030'::uuid),
 ('00000000-0000-4000-8000-000000000031'::uuid);

-- 2. Verified teacher drafts the actual MCQ, true/false, and written bank.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
DO $journey$
DECLARE v_created jsonb; v_id uuid;
BEGIN
 IF (public.education_instructor_access()->>'approved')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'E2E verified author missing trusted grant'; END IF;
 v_created := public.education_instructor_create_draft($bank$
 {
  "version":1,"title":"ETERNYX CI End-to-End Corrosion Exam",
  "description":"Disposable graded exam rehearsal","duration_minutes":60,
  "questions":[
   {"id":"cp-anode","type":"multiple_choice",
    "text":"Which anode is sacrificial in cathodic protection?","points":5,
    "options":[{"id":"mg","text":"Magnesium","correct":true},
               {"id":"mmo","text":"Titanium MMO","correct":false}]},
   {"id":"coating-tf","type":"true_false",
    "text":"Does coating generally reduce CP current demand?","points":3,
    "options":[{"id":"yes","text":"True","correct":true},
               {"id":"no","text":"False","correct":false}]},
   {"id":"polarization-short","type":"short_answer",
    "text":"Explain steel polarization under cathodic protection.","points":2,
    "options":[]}
  ]
 }
 $bank$::jsonb);
 v_id := (v_created->>'id')::uuid;
 IF v_id IS NULL OR v_created->>'question_count' <> '3' THEN
   RAISE EXCEPTION 'E2E instructor draft did not persist three real questions';
 END IF;
 PERFORM pg_catalog.set_config('eternyx.journey_test',v_id::text,false);
 IF (public.education_instructor_load_draft(v_id)->>'status') <> 'private_draft'
 THEN RAISE EXCEPTION 'E2E creator cannot recover owned unpublished draft'; END IF;
END
$journey$;

-- 3. Draft is not published by the teacher alone; only admin review can approve.
DO $journey$
BEGIN
 IF (public.education_request_publication(
   pg_catalog.current_setting('eternyx.journey_test')::uuid)->>'status')<>'pending'
 THEN RAISE EXCEPTION 'E2E publication did not request trusted review'; END IF;
END
$journey$;
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_admin_review_publication(
 pg_catalog.current_setting('eternyx.journey_test')::uuid,true)$sql$);

-- 4. Student A cannot enter the unpublished exam prior to admin approval.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000030';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.start_cbt_attempt(
 pg_catalog.current_setting('eternyx.journey_test')::uuid)$sql$);
DO $journey$
BEGIN
 IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog())<>0
 THEN RAISE EXCEPTION 'E2E unpublished draft exposed in learner catalog'; END IF;
END
$journey$;

-- 5. A trusted administrator reviews the pending request and enrolls A ONLY.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
DO $journey$
DECLARE v_id uuid:=pg_catalog.current_setting('eternyx.journey_test')::uuid;
BEGIN
 IF (public.education_admin_review_publication(v_id,true)->>'status')<>'approved'
 THEN RAISE EXCEPTION 'E2E admin did not approve publication'; END IF;
 IF (public.education_admin_enroll_student(
  v_id,'00000000-0000-4000-8000-000000000030'::uuid)->>'status')<>'enrolled'
 THEN RAISE EXCEPTION 'E2E admin enrollment did not persist'; END IF;
END
$journey$;

-- 6. Student B cannot discover, start, save or read the other learner's exam.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000031';
DO $journey$
BEGIN
 IF pg_catalog.jsonb_array_length(public.education_student_enrolled_catalog())<>0
 OR EXISTS (SELECT 1 FROM public.tests
   WHERE id=pg_catalog.current_setting('eternyx.journey_test')::uuid)
 THEN RAISE EXCEPTION 'E2E unenrolled Student B saw protected exam'; END IF;
END
$journey$;
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.start_cbt_attempt(
 pg_catalog.current_setting('eternyx.journey_test')::uuid)$sql$);

-- 7. Student A starts the one permitted attempt and reads only safe options.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000030';
DO $journey$
DECLARE
 v_id uuid:=pg_catalog.current_setting('eternyx.journey_test')::uuid;
 v_attempt jsonb;
 v_mcq uuid; v_tf uuid; v_written uuid;
 v_good uuid; v_wrong uuid;
BEGIN
 IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(
   public.education_student_enrolled_catalog()) AS c(item)
   WHERE c.item->>'id'=v_id::text)<>1
 THEN RAISE EXCEPTION 'E2E enrolled learner missing own catalog entry'; END IF;
 v_attempt:=public.start_cbt_attempt(v_id);
 IF v_attempt->>'status'<>'in_progress' THEN
   RAISE EXCEPTION 'E2E student start was not in-progress'; END IF;
 PERFORM pg_catalog.set_config('eternyx.journey_attempt',v_attempt->>'id',false);
 IF (public.start_cbt_attempt(v_id)->>'id')<>(v_attempt->>'id')
 THEN RAISE EXCEPTION 'E2E duplicate start did not reuse the same attempt'; END IF;
 SELECT q.id INTO v_mcq FROM public.questions AS q
 WHERE q.test_id=v_id AND q.question_type='multiple_choice';
 SELECT q.id INTO v_tf FROM public.questions AS q
 WHERE q.test_id=v_id AND q.question_type='true_false';
 SELECT q.id INTO v_written FROM public.questions AS q
 WHERE q.test_id=v_id AND q.question_type='short_answer';
 SELECT o.id INTO v_good FROM public.options AS o
 WHERE o.question_id=v_mcq AND o.option_text='Magnesium';
 SELECT o.id INTO v_wrong FROM public.options AS o
 WHERE o.question_id=v_tf AND o.option_text='False';
 IF v_good IS NULL OR v_wrong IS NULL OR v_written IS NULL
 THEN RAISE EXCEPTION 'E2E student safe options are unavailable'; END IF;
 IF (public.save_cbt_answer((v_attempt->>'id')::uuid,v_mcq,v_good,NULL)->>'status')<>'saved'
 OR (public.save_cbt_answer((v_attempt->>'id')::uuid,v_tf,v_wrong,NULL)->>'status')<>'saved'
 OR (public.save_cbt_answer((v_attempt->>'id')::uuid,v_written,NULL,
    'Polarization lowers anodic dissolution by shifting steel potential')->>'status')<>'saved'
 THEN RAISE EXCEPTION 'E2E answers were not persisted'; END IF;
 PERFORM pg_catalog.set_config('eternyx.journey_written_question',v_written::text,false);
END
$journey$;
SELECT public.education_ci_expect_denied(
 $sql$SELECT is_correct FROM public.options LIMIT 1$sql$);
SELECT public.education_ci_expect_denied(
 $sql$UPDATE public.user_answers SET points_awarded=999$sql$);

-- 8. Student B is denied even when supplied the real attempt UUID.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000031';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.save_cbt_answer(
 pg_catalog.current_setting('eternyx.journey_attempt')::uuid,
 pg_catalog.current_setting('eternyx.journey_written_question')::uuid,
 NULL,'forged response')$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.submit_cbt_attempt(
 pg_catalog.current_setting('eternyx.journey_attempt')::uuid)$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
 pg_catalog.current_setting('eternyx.journey_attempt')::uuid)$sql$);

-- 9. Student A submits exactly once; later saves cannot change the exam.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000030';
DO $journey$
DECLARE v_id uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
 v_receipt jsonb;
BEGIN
 IF (public.submit_cbt_attempt(v_id)->>'status')<>'submitted'
 OR (public.submit_cbt_attempt(v_id)->>'status')<>'submitted'
 THEN RAISE EXCEPTION 'E2E submission was not idempotent'; END IF;
 IF (public.save_cbt_answer(v_id,
     pg_catalog.current_setting('eternyx.journey_written_question')::uuid,
     NULL,'late tampering')->>'status')<>'already_submitted'
 THEN RAISE EXCEPTION 'E2E late answer write was accepted'; END IF;
 v_receipt:=public.education_student_verified_result(v_id);
 IF v_receipt->>'grade_status'<>'pending_review'
 OR v_receipt->'score'<>'null'::jsonb
 OR v_receipt->'max_score'<>'null'::jsonb
 THEN RAISE EXCEPTION 'E2E published an unreviewed official score'; END IF;
END
$journey$;

-- 10. Trusted grader must refuse all partial writes before essay review.
SET ROLE service_role;
DO $journey$
DECLARE v_id uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
 v_result jsonb;
BEGIN
 v_result:=public.education_finalize_cbt_grade(v_id);
 IF v_result->>'status'<>'pending_review'
 OR (v_result->>'pending_manual_review')::integer<>1
 OR v_result->'score'<>'null'::jsonb
 THEN RAISE EXCEPTION 'E2E finalizer did not await instructor review'; END IF;
END
$journey$;
RESET ROLE;
DO $journey$
DECLARE v_id uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
BEGIN
 IF (SELECT score FROM public.user_attempts WHERE id=v_id) IS NOT NULL
 OR (SELECT max_score FROM public.user_attempts WHERE id=v_id) IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.education_final_grades WHERE attempt_id=v_id)
 OR EXISTS(SELECT 1 FROM public.user_answers
    WHERE attempt_id=v_id AND points_awarded IS NOT NULL)
 THEN RAISE EXCEPTION 'E2E pending essay triggered partial grade writes'; END IF;
END
$journey$;

-- 11. Foreign approved instructor cannot see or grade teacher A's essay.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
DO $journey$
BEGIN
 IF EXISTS(
   SELECT 1 FROM pg_catalog.jsonb_array_elements(
    public.education_instructor_written_review_queue()) AS e(item)
   WHERE e.item->>'attempt_id'=pg_catalog.current_setting('eternyx.journey_attempt')
 ) THEN RAISE EXCEPTION 'E2E foreign reviewer read private written response'; END IF;
END
$journey$;

-- 12. Approved owner reviews the submitted essay and assigns 1/2 points.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
DO $journey$
DECLARE
 v_attempt uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
 v_review text;
 v_answer uuid;
BEGIN
 SELECT e.item->>'answer_id' INTO v_review
 FROM pg_catalog.jsonb_array_elements(public.education_instructor_written_review_queue()) AS e(item)
 WHERE e.item->>'attempt_id'=v_attempt::text;
 -- Retrieve the single allowed answer ID through the authenticated queue,
 -- without direct private-table SELECT privileges.
 IF v_review IS NULL THEN
   RAISE EXCEPTION 'E2E owner did not receive written review item'; END IF;
 v_answer:=v_review::uuid;
 IF (public.education_instructor_review_written_answer(v_answer,1)->>'status')
   <>'review_recorded' THEN
   RAISE EXCEPTION 'E2E authorized human mark was not recorded'; END IF;
 PERFORM pg_catalog.set_config('eternyx.journey_written_answer',v_answer::text,false);
END
$journey$;

-- 13. A single service-role transaction computes 5 + 0 + 1 = 6 / 10.
SET ROLE service_role;
DO $journey$
DECLARE v_attempt uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
 v_result jsonb;
BEGIN
 v_result:=public.education_finalize_cbt_grade(v_attempt);
 IF v_result->>'status'<>'finalized'
 OR (v_result->>'score')::integer<>6
 OR (v_result->>'max_score')::integer<>10
 OR (v_result->>'pending_manual_review')::integer<>0
 THEN RAISE EXCEPTION 'E2E official grade was not exactly 6/10'; END IF;
 IF (public.education_finalize_cbt_grade(v_attempt)->>'status')<>'already_finalized'
 THEN RAISE EXCEPTION 'E2E trusted regrading was not an immutable replay'; END IF;
END
$journey$;
RESET ROLE;

-- 14. Verify exact finalized answer breakdown is trusted and consistent.
DO $journey$
DECLARE v_attempt uuid:=pg_catalog.current_setting('eternyx.journey_attempt')::uuid;
BEGIN
 IF (SELECT score FROM public.user_attempts WHERE id=v_attempt)<>6
 OR (SELECT max_score FROM public.user_attempts WHERE id=v_attempt)<>10
 OR (SELECT pg_catalog.count(*) FROM public.education_final_grades
     WHERE attempt_id=v_attempt AND score=6 AND max_score=10)<>1
 OR (SELECT pg_catalog.sum(points_awarded) FROM public.user_answers
     WHERE attempt_id=v_attempt)<>6
 OR (SELECT pg_catalog.count(*) FROM public.user_answers AS a
    JOIN public.questions AS q ON q.id=a.question_id
    WHERE a.attempt_id=v_attempt AND q.question_type='short_answer'
    AND a.points_awarded=1 AND a.is_correct IS NULL)<>1
 OR (SELECT pg_catalog.count(*) FROM public.user_answers AS a
    JOIN public.questions AS q ON q.id=a.question_id
    WHERE a.attempt_id=v_attempt AND q.question_type='multiple_choice'
    AND a.points_awarded=5 AND a.is_correct IS TRUE)<>1
 OR (SELECT pg_catalog.count(*) FROM public.user_answers AS a
    JOIN public.questions AS q ON q.id=a.question_id
    WHERE a.attempt_id=v_attempt AND q.question_type='true_false'
    AND a.points_awarded=0 AND a.is_correct IS FALSE)<>1
 THEN RAISE EXCEPTION 'E2E trusted 6/10 question breakdown was inconsistent'; END IF;
END
$journey$;

-- 15. Real learner's five-field receipt is verified; B/anon have no access.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000030';
DO $journey$
DECLARE r jsonb;
BEGIN
 r:=public.education_student_verified_result(
   pg_catalog.current_setting('eternyx.journey_attempt')::uuid);
 IF r->>'grade_status'<>'finalized' OR r->>'score'<>'6' OR
    r->>'max_score'<>'10' OR r->>'finalized_at' IS NULL OR
    (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(r))<>5
 THEN RAISE EXCEPTION 'E2E verified learner receipt not 6/10'; END IF;
END
$journey$;
SELECT public.education_ci_expect_denied(
 $sql$SELECT score FROM public.education_final_grades$sql$);
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000031';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
 pg_catalog.current_setting('eternyx.journey_attempt')::uuid)$sql$);

-- 16. After official finalization, instructor corrections cannot rewrite marks.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.journey_written_answer')::uuid,2)$sql$);

-- 17. Enrollment is immutable once this student took the exam.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_admin_revoke_enrollment(
 pg_catalog.current_setting('eternyx.journey_test')::uuid,
 '00000000-0000-4000-8000-000000000030'::uuid)$sql$);
RESET ROLE;
SELECT 'Education integrated 17-step instructor-to-student exam lifecycle PASSED in isolated PostgreSQL' AS result;
