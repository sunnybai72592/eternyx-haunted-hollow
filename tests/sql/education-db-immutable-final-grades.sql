-- ETERNYX Education: append-only finalized grade tamper resistance.
-- Disposable PostgreSQL 17 only. Run AFTER the full 17-stage journey under
-- scripts/sql/staging-education-immutable-final-grade-records.sql.
-- NO hosted DB, customer account, staging mutation or production deployment.

CREATE OR REPLACE FUNCTION public.education_ci_expect_locked(p_sql text)
RETURNS void LANGUAGE plpgsql SET search_path=''
AS $assert$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'Expected immutable grade mutation to be blocked'
    USING ERRCODE = 'P0001';
EXCEPTION WHEN SQLSTATE '22023' THEN
  -- Correct, explicit integrity rejection from our hardened trigger.
  RETURN;
END;
$assert$;

-- Verify the hardening is really installed AND firing, never a false pass
-- due to absent triggers, disabled triggers or incorrect table associations.
DO $locked$
DECLARE v_name text; v_table text;
BEGIN
  FOR v_name,v_table IN
    SELECT x.trigger_name,x.table_name FROM (VALUES
      ('education_immutable_final_grade_row','education_final_grades'),
      ('education_immutable_finalized_attempt','user_attempts'),
      ('education_immutable_finalized_answer','user_answers'),
      ('education_block_grade_truncate','education_final_grades'),
      ('education_block_attempt_truncate','user_attempts'),
      ('education_block_answer_truncate','user_answers')
    ) AS x(trigger_name,table_name)
  LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=v_table
      AND t.tgname=v_name AND t.tgenabled='O'
    ) THEN
      RAISE EXCEPTION 'Missing or disabled Education integrity trigger: %',v_name;
    END IF;
  END LOOP;
  IF pg_catalog.has_function_privilege('anon',
     'public.education_block_final_grade_ledger_rewrite()','EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',
     'public.education_block_final_grade_ledger_rewrite()','EXECUTE')
    OR pg_catalog.has_function_privilege('service_role',
     'public.education_block_final_grade_ledger_rewrite()','EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated',
     'public.education_block_finalized_answer_change()','EXECUTE')
  THEN RAISE EXCEPTION 'Grade immutability trigger helper is executable by API caller'; END IF;
END
$locked$;

-- Use two existing, independently finalized synthetic attempts and one
-- earlier unfinalized attempt. Capture initial hash-of-state as comparisons.
SELECT pg_catalog.set_config('eternyx.locked_a',
 (SELECT a.id::text FROM public.user_attempts AS a
 WHERE a.user_id='00000000-0000-4000-8000-000000000004'::uuid
 AND a.score=7 AND a.max_score=10),false);
SELECT pg_catalog.set_config('eternyx.locked_b',
 (SELECT a.id::text FROM public.user_attempts AS a
 WHERE a.user_id='00000000-0000-4000-8000-000000000030'::uuid
 AND a.score=6 AND a.max_score=10),false);
SELECT pg_catalog.set_config('eternyx.locked_answer',
 (SELECT a.id::text FROM public.user_answers AS a
 WHERE a.attempt_id=pg_catalog.current_setting('eternyx.locked_a')::uuid
 AND a.points_awarded IS NOT NULL LIMIT 1),false);
SELECT pg_catalog.set_config('eternyx.locked_review',
 (SELECT r.answer_id::text FROM public.education_written_reviews AS r
 JOIN public.user_answers AS a ON a.id=r.answer_id
 WHERE a.attempt_id=pg_catalog.current_setting('eternyx.locked_a')::uuid),false);
SELECT pg_catalog.set_config('eternyx.locked_running',
 (SELECT id::text FROM public.user_attempts
 WHERE user_id='00000000-0000-4000-8000-000000000012'::uuid
 AND status='in_progress'),false);

DO $locked$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.education_final_grades)<>6
  OR NULLIF(pg_catalog.current_setting('eternyx.locked_a',true),'') IS NULL
  OR NULLIF(pg_catalog.current_setting('eternyx.locked_b',true),'') IS NULL
  OR NULLIF(pg_catalog.current_setting('eternyx.locked_answer',true),'') IS NULL
  OR NULLIF(pg_catalog.current_setting('eternyx.locked_review',true),'') IS NULL
  OR NULLIF(pg_catalog.current_setting('eternyx.locked_running',true),'') IS NULL
  THEN RAISE EXCEPTION 'Six finalized and one running synthetic fixtures required'; END IF;
END
$locked$;

-- 1–4: Even DB owner cannot UPDATE, no-op UPDATE, DELETE or TRUNCATE ledger.
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.education_final_grades SET score=999
 WHERE attempt_id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.education_final_grades SET score=score
 WHERE attempt_id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$DELETE FROM public.education_final_grades
 WHERE attempt_id=pg_catalog.current_setting('eternyx.locked_b')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$TRUNCATE TABLE public.education_final_grades$sql$);

-- 5–10: Owner cannot change, reparent or delete a finalized exam attempt.
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_attempts SET score=999
 WHERE id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_attempts SET max_score=999
 WHERE id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_attempts SET status='in_progress'
 WHERE id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_attempts SET score=score
 WHERE id=pg_catalog.current_setting('eternyx.locked_a')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$DELETE FROM public.user_attempts
 WHERE id=pg_catalog.current_setting('eternyx.locked_b')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$TRUNCATE TABLE public.user_attempts CASCADE$sql$);

-- 11–16: Post-finalization answer point/correctness edits, no-ops, deletion,
-- inserted answers and mass erasure all fail with one explicit error code.
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_answers SET points_awarded=999
 WHERE id=pg_catalog.current_setting('eternyx.locked_answer')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_answers SET is_correct=NOT is_correct
 WHERE id=pg_catalog.current_setting('eternyx.locked_answer')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.user_answers SET points_awarded=points_awarded
 WHERE id=pg_catalog.current_setting('eternyx.locked_answer')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$DELETE FROM public.user_answers
 WHERE id=pg_catalog.current_setting('eternyx.locked_answer')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$INSERT INTO public.user_answers (attempt_id,question_id,short_answer_text)
 VALUES (pg_catalog.current_setting('eternyx.locked_a')::uuid,
   (SELECT id FROM public.questions WHERE question_type='short_answer' LIMIT 1),
   'Attempted illegal late insertion')$sql$);
SELECT public.education_ci_expect_locked(
 $sql$TRUNCATE TABLE public.user_answers CASCADE$sql$);

-- 17–19: The earlier finalized-review trigger must still prevent teacher
-- review changes, deleted marks and newly inserted review evidence.
SELECT public.education_ci_expect_locked(
 $sql$UPDATE public.education_written_reviews SET points_awarded=0
 WHERE answer_id=pg_catalog.current_setting('eternyx.locked_review')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$DELETE FROM public.education_written_reviews
 WHERE answer_id=pg_catalog.current_setting('eternyx.locked_review')::uuid$sql$);
SELECT public.education_ci_expect_locked(
 $sql$INSERT INTO public.education_written_reviews(answer_id,points_awarded,reviewer_user_id)
 VALUES (pg_catalog.current_setting('eternyx.locked_answer')::uuid,0,
   '00000000-0000-4000-8000-000000000002'::uuid)$sql$);

-- 20: An unfinalized running attempt remains usable. This is not a global
-- read-only lock that breaks the active CBT save/submit workflow.
UPDATE public.user_attempts
 SET is_mobile_locked = NOT is_mobile_locked
 WHERE id=pg_catalog.current_setting('eternyx.locked_running')::uuid;
UPDATE public.user_attempts
 SET is_mobile_locked = NOT is_mobile_locked
 WHERE id=pg_catalog.current_setting('eternyx.locked_running')::uuid;

-- 21: Existing trusted service-role grading replays remain idempotent.
SET ROLE service_role;
DO $locked$
DECLARE r jsonb;
BEGIN
 r:=public.education_finalize_cbt_grade(
  pg_catalog.current_setting('eternyx.locked_a')::uuid);
 IF r->>'status'<>'already_finalized' OR r->>'score'<>'7'
 OR r->>'max_score'<>'10' THEN
   RAISE EXCEPTION 'Immutable finalizer retry did not return the official score'; END IF;
END
$locked$;
RESET ROLE;

-- 22: Learner A still receives the same 5-key final official receipt.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
DO $locked$
DECLARE r jsonb;
BEGIN
 r:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.locked_a')::uuid);
 IF r->>'grade_status'<>'finalized'
 OR r->>'score'<>'7' OR r->>'max_score'<>'10'
 OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(r))<>5
 THEN RAISE EXCEPTION 'New lock obscured authentic owned final grade'; END IF;
END
$locked$;
RESET ROLE;

-- 23: No failed tamper or harmless retry changed any canonical receipt.
DO $locked$
BEGIN
 IF (SELECT pg_catalog.count(*) FROM public.education_final_grades)<>6
 OR (SELECT score FROM public.education_final_grades
     WHERE attempt_id=pg_catalog.current_setting('eternyx.locked_a')::uuid)<>7
 OR (SELECT score FROM public.education_final_grades
     WHERE attempt_id=pg_catalog.current_setting('eternyx.locked_b')::uuid)<>6
 OR (SELECT score FROM public.user_attempts
     WHERE id=pg_catalog.current_setting('eternyx.locked_a')::uuid)<>7
 OR (SELECT points_awarded FROM public.education_written_reviews
     WHERE answer_id=pg_catalog.current_setting('eternyx.locked_review')::uuid)<>2
 THEN RAISE EXCEPTION 'Finalized grade changed after rejected mutation'; END IF;
END
$locked$;
DROP FUNCTION public.education_ci_expect_locked(text);
SELECT '23 immutable-final-grade SQL checks passed in disposable PostgreSQL 17' AS result;
