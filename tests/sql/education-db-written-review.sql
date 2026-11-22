-- Isolated, additive PostgreSQL acceptance for staged written-review RPCs.
-- Requires the existing baseline/adversarial/expiry fixture in the same DB.
-- Synthetic owner writes below are TEST SETUP ONLY, never learner privilege.

SELECT pg_catalog.set_config('eternyx.review_test',
 (SELECT id::text FROM public.tests WHERE title='CP Fundamentals Assessment'),false);
SELECT pg_catalog.set_config('eternyx.review_attempt',
 (SELECT id::text FROM public.user_attempts
 WHERE test_id=pg_catalog.current_setting('eternyx.review_test')::uuid
   AND user_id='00000000-0000-4000-8000-000000000004'::uuid),false);
SELECT pg_catalog.set_config('eternyx.review_question',
 (SELECT id::text FROM public.questions
 WHERE test_id=pg_catalog.current_setting('eternyx.review_test')::uuid
 AND question_type='short_answer'),false);
DO $test$
BEGIN
 IF pg_catalog.current_setting('eternyx.review_test',true) IS NULL
    OR pg_catalog.current_setting('eternyx.review_attempt',true) IS NULL
    OR pg_catalog.current_setting('eternyx.review_question',true) IS NULL THEN
   RAISE EXCEPTION 'Missing synthetic written assessment fixture';
 END IF;
 INSERT INTO public.user_answers(attempt_id,question_id,short_answer_text)
 VALUES (pg_catalog.current_setting('eternyx.review_attempt')::uuid,
         pg_catalog.current_setting('eternyx.review_question')::uuid,
         'Polarization shifts the steel potential to limit anodic dissolution');
END
$test$;
SELECT pg_catalog.set_config('eternyx.review_answer',
 (SELECT id::text FROM public.user_answers
 WHERE attempt_id=pg_catalog.current_setting('eternyx.review_attempt')::uuid
 AND question_id=pg_catalog.current_setting('eternyx.review_question')::uuid),false);

-- 1. No direct review-table rights, including SELECT and forged INSERT/UPDATE.
DO $test$
BEGIN
 IF pg_catalog.has_table_privilege('anon','public.education_written_reviews','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.education_written_reviews','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.education_written_reviews','INSERT')
 OR pg_catalog.has_table_privilege('authenticated','public.education_written_reviews','UPDATE')
 OR pg_catalog.has_function_privilege('anon','public.education_instructor_written_review_queue()','EXECUTE')
 OR pg_catalog.has_function_privilege('anon','public.education_instructor_review_written_answer(uuid,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Written review table or RPC exposed to an unauthorized role'; END IF;
END
$test$;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_written_review_queue()$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,2)$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT * FROM public.education_written_reviews$sql$);
SELECT public.education_ci_expect_denied(
 $sql$INSERT INTO public.education_written_reviews(answer_id,points_awarded,reviewer_user_id)
 VALUES (pg_catalog.current_setting('eternyx.review_answer')::uuid,999,
 '00000000-0000-4000-8000-000000000004'::uuid)$sql$);

-- 2. An unapproved instructor gets no review authority.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000006';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_written_review_queue()$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,1)$sql$);

-- 3. Approved Instructor B cannot read or grade Instructor A's answers.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
DO $test$
BEGIN
 IF pg_catalog.jsonb_array_length(public.education_instructor_written_review_queue())<>0
 THEN RAISE EXCEPTION 'Foreign instructor saw a learner response'; END IF;
END
$test$;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,1)$sql$);

-- 4. Instructor A can see only their completed written response.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
DO $test$
DECLARE v_queue jsonb := public.education_instructor_written_review_queue();
BEGIN
 IF pg_catalog.jsonb_array_length(v_queue)<>1
 OR v_queue->0->>'answer_id' IS DISTINCT FROM pg_catalog.current_setting('eternyx.review_answer')
 OR v_queue->0->>'test_id' IS DISTINCT FROM pg_catalog.current_setting('eternyx.review_test')
 OR (v_queue->0->>'points_possible')::integer<>2
 OR v_queue->0->'reviewed_points'<>'null'::jsonb
 OR v_queue->0->>'response_text' IS DISTINCT FROM
 'Polarization shifts the steel potential to limit anodic dissolution'
 THEN RAISE EXCEPTION 'Owned instructor written-review queue is invalid'; END IF;
END
$test$;
-- 5. Negative/over-max/NULL points never create a review.
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,-1)$sql$);
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,3)$sql$);
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,NULL)$sql$);
-- 6. Review persists a partial-credit rubric mark but NOT official grade.
DO $test$
DECLARE v_review jsonb;
BEGIN
 v_review:=public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,1);
 IF v_review->>'status'<>'review_recorded'
 OR v_review->>'points_awarded'<>'1'
 OR v_review->>'official_score_updated'<>'false'
 THEN RAISE EXCEPTION 'Reviewer did not receive an unfinalized confirmation'; END IF;
END
$test$;
-- 7. Duplicate identical review is truly idempotent (timestamp preserved).
SELECT pg_catalog.set_config('eternyx.review_time',
 (public.education_instructor_written_review_queue()->0->>'reviewed_at'),false);
DO $test$
BEGIN
 PERFORM public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,1);
 IF (public.education_instructor_written_review_queue()->0->>'reviewed_at')
 IS DISTINCT FROM pg_catalog.current_setting('eternyx.review_time')
 THEN RAISE EXCEPTION 'Identical review updated audit timestamp'; END IF;
END
$test$;
-- 8. Authorized correction is permitted before trusted grade aggregation.
DO $test$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,2);
 IF v_result->>'points_awarded'<>'2'
 OR (public.education_instructor_written_review_queue()->0->>'reviewed_points')::integer<>2
 THEN RAISE EXCEPTION 'Instructor correction was not persisted'; END IF;
END
$test$;
-- 9. No final score, grade fields, or completion status are fabricated.
RESET ROLE;
DO $test$
BEGIN
 IF (SELECT pg_catalog.count(*) FROM public.education_written_reviews)<>1
 OR (SELECT score FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.review_attempt')::uuid) IS NOT NULL
 OR (SELECT max_score FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.review_attempt')::uuid) IS NOT NULL
 OR (SELECT points_awarded FROM public.user_answers
 WHERE id=pg_catalog.current_setting('eternyx.review_answer')::uuid) IS NOT NULL
 OR (SELECT status FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.review_attempt')::uuid)<>'submitted'
 THEN RAISE EXCEPTION 'Staged written review falsely finalized a learner grade'; END IF;
END
$test$;
-- 10. Revoking a verified instructor removes access immediately.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
DO $test$
BEGIN
 IF public.admin_revoke_education_instructor(
 '00000000-0000-4000-8000-000000000002'::uuid) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Admin could not revoke instructor'; END IF;
END
$test$;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_written_review_queue()$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.review_answer')::uuid,0)$sql$);
RESET ROLE;
SELECT 'Education written-review authorization, idempotency and no-score-leak checks passed' AS result;
