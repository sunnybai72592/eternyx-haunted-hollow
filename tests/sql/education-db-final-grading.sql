-- ETERNYX Education: trust-only atomic CBT finalization acceptance.
-- Disposable local PostgreSQL 17, after previous written-review acceptance.
-- Synthetic fixture mutations here do NOT occur in any hosted database.

-- 1) Ledger must not be exposed; service_role may execute only the approved
-- finalizer RPC, not mutate the protected ledger directly.
DO $gate$
BEGIN
 IF pg_catalog.has_table_privilege('anon','public.education_final_grades','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.education_final_grades','SELECT')
 OR pg_catalog.has_table_privilege('authenticated','public.education_final_grades','INSERT')
 OR pg_catalog.has_table_privilege('service_role','public.education_final_grades','INSERT')
 OR pg_catalog.has_function_privilege('anon','public.education_finalize_cbt_grade(uuid)','EXECUTE')
 OR pg_catalog.has_function_privilege('authenticated','public.education_finalize_cbt_grade(uuid)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('service_role','public.education_finalize_cbt_grade(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Atomic grading ledger or RPC privilege boundary failed'; END IF;
END
$gate$;
SELECT pg_catalog.set_config('eternyx.final_a_attempt',
 (SELECT a.id::text FROM public.user_attempts AS a
 JOIN public.tests AS t ON t.id=a.test_id AND t.title='CP Fundamentals Assessment'
 WHERE a.user_id='00000000-0000-4000-8000-000000000004'::uuid),false);
SELECT pg_catalog.set_config('eternyx.final_b_attempt',
 (SELECT a.id::text FROM public.user_attempts AS a
 JOIN public.tests AS t ON t.id=a.test_id AND t.title='Secondary Instructor Bank'
 WHERE a.user_id='00000000-0000-4000-8000-000000000005'::uuid),false);
SELECT pg_catalog.set_config('eternyx.final_a_review',
 (SELECT r.answer_id::text FROM public.education_written_reviews AS r
 JOIN public.user_answers AS a ON a.id=r.answer_id
 WHERE a.attempt_id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid),false);
DO $gate$
BEGIN
 IF NULLIF(pg_catalog.current_setting('eternyx.final_a_attempt',true),'') IS NULL
 OR NULLIF(pg_catalog.current_setting('eternyx.final_b_attempt',true),'') IS NULL
 OR NULLIF(pg_catalog.current_setting('eternyx.final_a_review',true),'') IS NULL
 THEN RAISE EXCEPTION 'Missing completed review or CBT fixtures'; END IF;
END
$gate$;

SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_a_attempt')::uuid)$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT * FROM public.education_final_grades$sql$);
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_a_attempt')::uuid)$sql$);

-- 2) Revoked reviewer's historical mark cannot finalize silently. The trusted
-- service returns pending_review and makes ZERO grade updates.
SET ROLE service_role;
DO $gate$
DECLARE v_response jsonb;
BEGIN
 v_response := public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_a_attempt')::uuid);
 IF v_response->>'status' <> 'pending_review'
 OR (v_response->>'pending_manual_review')::integer <> 1
 OR v_response->'score' <> 'null'::jsonb
 OR v_response->'max_score' <> 'null'::jsonb THEN
 RAISE EXCEPTION 'Revoked or unreviewed written mark was unexpectedly finalized'; END IF;
END
$gate$;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(NULL)$sql$);
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(
 '11111111-1111-4111-8111-111111111111'::uuid)$sql$);
RESET ROLE;
DO $gate$
BEGIN
 IF (SELECT pg_catalog.count(*) FROM public.education_final_grades) <> 0
 OR (SELECT score FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid) IS NOT NULL
 OR (SELECT max_score FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid) IS NOT NULL
 OR (SELECT points_awarded FROM public.user_answers
 WHERE attempt_id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid
 AND selected_option_id IS NOT NULL) IS NOT NULL THEN
 RAISE EXCEPTION 'Incomplete manual review left partial official grade writes'; END IF;
END
$gate$;

-- 3) Trusted service fails closed for a still-running attempt.
INSERT INTO auth.users(id)
VALUES ('00000000-0000-4000-8000-000000000012'::uuid);
INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by)
VALUES (
 (SELECT id FROM public.tests WHERE title='Secondary Instructor Bank'),
 '00000000-0000-4000-8000-000000000012'::uuid,
 '00000000-0000-4000-8000-000000000001'::uuid
);
INSERT INTO public.user_attempts(user_id,test_id,status)
VALUES ('00000000-0000-4000-8000-000000000012'::uuid,
 (SELECT id FROM public.tests WHERE title='Secondary Instructor Bank'),
 'in_progress');
-- Synthetic database owner resolves the ID before role switching. The
-- service role intentionally has no direct user_attempts SELECT grant.
SELECT pg_catalog.set_config('eternyx.final_running_attempt',
 (SELECT id::text FROM public.user_attempts
  WHERE user_id='00000000-0000-4000-8000-000000000012'::uuid),false);
SET ROLE service_role;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_running_attempt')::uuid)$sql$);
RESET ROLE;

-- 4) Reject a selected objective option from a different question/exam
-- even if a fixture owner forged its foreign-key-valid UUID.
SELECT pg_catalog.set_config('eternyx.final_b_original_option',
 (SELECT a.selected_option_id::text FROM public.user_answers AS a
 WHERE a.attempt_id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid),false);
UPDATE public.user_answers SET selected_option_id=(
 SELECT o.id FROM public.options AS o
 JOIN public.questions AS q ON q.id=o.question_id
 JOIN public.tests AS t ON t.id=q.test_id AND t.title='CP Fundamentals Assessment'
 LIMIT 1)
WHERE attempt_id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;
SET ROLE service_role;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_b_attempt')::uuid)$sql$);
RESET ROLE;
UPDATE public.user_answers
 SET selected_option_id=pg_catalog.current_setting('eternyx.final_b_original_option')::uuid
WHERE attempt_id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;

-- 5) Reject forged prose on an objective question; no ledger or score updates.
UPDATE public.user_answers SET short_answer_text='Forged extra answer'
WHERE attempt_id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;
SET ROLE service_role;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_b_attempt')::uuid)$sql$);
RESET ROLE;
UPDATE public.user_answers SET short_answer_text=NULL
WHERE attempt_id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;

-- 6) Legacy grade mutations are NOT overwritten without a coordinated
-- backfill/reconciliation. This prevents pretending old graded rows are new.
UPDATE public.user_attempts SET max_score=1 WHERE
 id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;
SET ROLE service_role;
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_b_attempt')::uuid)$sql$);
RESET ROLE;
UPDATE public.user_attempts SET max_score=NULL WHERE
 id=pg_catalog.current_setting('eternyx.final_b_attempt')::uuid;

-- 7) Re-verifying the instructor is a trusted ADMIN operation; the genuine
-- stored review now qualifies and the service computes 5+2=7 of 5+3+2=10.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
DO $gate$
BEGIN
 IF public.admin_approve_education_instructor(
 '00000000-0000-4000-8000-000000000002'::uuid,'Reverified Instructor A'
 )->>'approved' <> 'true' THEN
 RAISE EXCEPTION 'Authorized instructor reapproval failed'; END IF;
END
$gate$;
SET ROLE service_role;
DO $gate$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_a_attempt')::uuid);
 IF v_result->>'status' <> 'finalized'
 OR (v_result->>'score')::integer <> 7
 OR (v_result->>'max_score')::integer <> 10
 OR (v_result->>'pending_manual_review')::integer <> 0 THEN
 RAISE EXCEPTION 'Trusted mixed objective/written score was not 7/10'; END IF;
END
$gate$;

-- 8) An auto-submitted objective-only attempt is independently finalizable.
DO $gate$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_b_attempt')::uuid);
 IF v_result->>'status' <> 'finalized'
 OR (v_result->>'score')::integer <> 1
 OR (v_result->>'max_score')::integer <> 1 THEN
 RAISE EXCEPTION 'Trusted objective-only auto-submitted score is wrong'; END IF;
END
$gate$;

-- 9) Retrying either finalizer returns the exact original grade and cannot
-- change the immutable audit time or create duplicate grade ledgers.
RESET ROLE;
SELECT pg_catalog.set_config('eternyx.final_a_time',
 (SELECT finalized_at::text FROM public.education_final_grades
 WHERE attempt_id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid),false);
SET ROLE service_role;
DO $gate$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.education_finalize_cbt_grade(
 pg_catalog.current_setting('eternyx.final_a_attempt')::uuid);
 IF v_result->>'status'<>'already_finalized'
 OR (v_result->>'score')::integer<>7 OR (v_result->>'max_score')::integer<>10 THEN
 RAISE EXCEPTION 'Grade retry was not idempotent'; END IF;
END
$gate$;
RESET ROLE;
DO $gate$
BEGIN
 IF (SELECT finalized_at::text FROM public.education_final_grades
 WHERE attempt_id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid)
 IS DISTINCT FROM pg_catalog.current_setting('eternyx.final_a_time')
 OR (SELECT pg_catalog.count(*) FROM public.education_final_grades)<>2 THEN
 RAISE EXCEPTION 'Retry modified the finalization ledger'; END IF;
END
$gate$;

-- 10) An authorized instructor can no longer adjust completed review marks;
-- no browser role can modify the official final grade ledger.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_instructor_review_written_answer(
 pg_catalog.current_setting('eternyx.final_a_review')::uuid,0)$sql$);
SELECT public.education_ci_expect_denied(
 $sql$UPDATE public.education_final_grades SET score=999$sql$);
RESET ROLE;
DO $gate$
BEGIN
 IF (SELECT score FROM public.user_attempts
     WHERE id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid)<>7
 OR (SELECT max_score FROM public.user_attempts
     WHERE id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid)<>10
 OR (SELECT points_awarded FROM public.user_answers
     WHERE id=pg_catalog.current_setting('eternyx.final_a_review')::uuid)<>2
 OR (SELECT points_awarded FROM public.education_written_reviews
     WHERE answer_id=pg_catalog.current_setting('eternyx.final_a_review')::uuid)<>2
 OR (SELECT pg_catalog.count(*) FROM public.user_answers AS a
    JOIN public.questions AS q ON q.id=a.question_id
    WHERE a.attempt_id=pg_catalog.current_setting('eternyx.final_a_attempt')::uuid
      AND q.question_type='multiple_choice'
      AND a.is_correct IS TRUE AND a.points_awarded=5)<>1
 THEN RAISE EXCEPTION 'Official exam grades were not atomically preserved'; END IF;
END
$gate$;
SELECT '10 atomic Education final grading security and lifecycle checks passed' AS result;
