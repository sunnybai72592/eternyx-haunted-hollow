-- ETERNYX Education verified student results — disposable PostgreSQL only.
-- Run after completed final grading and real concurrent transaction checks.

-- 1. Student-only RPC grants, never raw ledger SELECT.
DO $vr$
BEGIN
 IF pg_catalog.has_function_privilege('anon',
       'public.education_student_verified_result(uuid)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('authenticated',
       'public.education_student_verified_result(uuid)','EXECUTE')
 OR pg_catalog.has_table_privilege('authenticated',
       'public.education_final_grades','SELECT')
 THEN RAISE EXCEPTION 'Verified result function or ledger has unsafe grants'; END IF;
END
$vr$;

SELECT pg_catalog.set_config('eternyx.result_a',
 (SELECT a.id::text FROM public.user_attempts AS a
  WHERE a.user_id='00000000-0000-4000-8000-000000000004'::uuid
    AND a.score=7 AND a.max_score=10),false);
SELECT pg_catalog.set_config('eternyx.result_b',
 (SELECT a.id::text FROM public.user_attempts AS a
  WHERE a.user_id='00000000-0000-4000-8000-000000000005'::uuid
    AND a.score=1 AND a.max_score=1),false);
SELECT pg_catalog.set_config('eternyx.result_running',
 (SELECT a.id::text FROM public.user_attempts AS a
  WHERE a.user_id='00000000-0000-4000-8000-000000000012'::uuid
    AND a.status='in_progress'),false);
DO $vr$
BEGIN
 IF NULLIF(pg_catalog.current_setting('eternyx.result_a',true),'') IS NULL
 OR NULLIF(pg_catalog.current_setting('eternyx.result_b',true),'') IS NULL
 OR NULLIF(pg_catalog.current_setting('eternyx.result_running',true),'') IS NULL
 THEN RAISE EXCEPTION 'Missing trusted final-grade fixture'; END IF;
END
$vr$;

-- 2. No user JWT means no grade, even with authenticated database role.
SET ROLE authenticated;
SET request.jwt.claim.sub='';
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_a')::uuid)$sql$);

-- 3. Genuine Student A sees only their ledger-confirmed 7/10 score.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
DO $vr$
DECLARE v_receipt jsonb;
BEGIN
 v_receipt:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_a')::uuid);
 IF v_receipt->>'grade_status' <> 'finalized'
 OR (v_receipt->>'score')::integer <> 7
 OR (v_receipt->>'max_score')::integer <> 10
 OR NULLIF(v_receipt->>'finalized_at','') IS NULL
 OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_receipt))<>5
 OR v_receipt ? 'is_correct' OR v_receipt ? 'response_text'
 THEN RAISE EXCEPTION 'Owned verified receipt leaked data or lacked official marks'; END IF;
END
$vr$;

-- 4. Student A cannot see Student B's score or even its existence.
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_b')::uuid)$sql$);
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
  '11111111-1111-4111-8111-111111111111'::uuid)$sql$);

-- 5. Student B sees their own auto-submitted verified 1/1 score, not A.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000005';
DO $vr$
DECLARE v_receipt jsonb;
BEGIN
 v_receipt:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_b')::uuid);
 IF v_receipt->>'grade_status'<>'finalized'
 OR v_receipt->>'score'<>'1' OR v_receipt->>'max_score'<>'1'
 THEN RAISE EXCEPTION 'Auto-submitted learner grade not verified'; END IF;
END
$vr$;
SELECT public.education_ci_expect_denied(
 $sql$SELECT public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_a')::uuid)$sql$);

-- 6. In-progress attempts cannot expose provisional scores.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000012';
DO $vr$
DECLARE v_result jsonb;
BEGIN
 v_result:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_running')::uuid);
 IF v_result->>'grade_status'<>'in_progress'
 OR v_result->'score'<>'null'::jsonb
 OR v_result->'max_score'<>'null'::jsonb
 OR v_result->'finalized_at'<>'null'::jsonb
 THEN RAISE EXCEPTION 'Running student was shown a grade'; END IF;
END
$vr$;

-- A separate enrolled synthetic student has a submitted, ungraded attempt.
RESET ROLE;
INSERT INTO auth.users(id)
 VALUES ('00000000-0000-4000-8000-000000000024'::uuid),
        ('00000000-0000-4000-8000-000000000025'::uuid);
INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by)
 SELECT t.id,s.id,'00000000-0000-4000-8000-000000000001'::uuid
 FROM public.tests AS t
 CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000000024'::uuid),
  ('00000000-0000-4000-8000-000000000025'::uuid)) AS s(id)
 WHERE t.title='CP Fundamentals Assessment';
INSERT INTO public.user_attempts(user_id,test_id,status,end_time)
 SELECT s.id,t.id,'submitted',clock_timestamp()
 FROM public.tests AS t
 CROSS JOIN (VALUES
  ('00000000-0000-4000-8000-000000000024'::uuid),
  ('00000000-0000-4000-8000-000000000025'::uuid)) AS s(id)
 WHERE t.title='CP Fundamentals Assessment';
SELECT pg_catalog.set_config('eternyx.result_pending',
 (SELECT id::text FROM public.user_attempts
  WHERE user_id='00000000-0000-4000-8000-000000000024'::uuid),false);
SELECT pg_catalog.set_config('eternyx.result_legacy',
 (SELECT id::text FROM public.user_attempts
  WHERE user_id='00000000-0000-4000-8000-000000000025'::uuid),false);
UPDATE public.user_attempts SET score=9,max_score=10
 WHERE id=pg_catalog.current_setting('eternyx.result_legacy')::uuid;

-- 7. Unreviewed submitted attempt must remain pending with no scores.
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000024';
DO $vr$
DECLARE r jsonb;
BEGIN
 r:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_pending')::uuid);
 IF r->>'grade_status'<>'pending_review' OR r->'score'<>'null'::jsonb
 OR r->'max_score'<>'null'::jsonb OR r->'finalized_at'<>'null'::jsonb
 THEN RAISE EXCEPTION 'Unreviewed attempt showed an invented grade'; END IF;
END
$vr$;

-- 8. Legacy partial attempt.score is explicitly NOT a verified result.
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000025';
DO $vr$
DECLARE r jsonb;
BEGIN
 r:=public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_legacy')::uuid);
 IF r->>'grade_status'<>'pending_review'
 OR r->'score'<>'null'::jsonb OR r->'max_score'<>'null'::jsonb
 THEN RAISE EXCEPTION 'Legacy partial score was treated as verified'; END IF;
END
$vr$;

-- 9. Inconsistent trusted ledger/attempt pairs must fail closed.
RESET ROLE;
UPDATE public.user_attempts SET score=8
 WHERE id=pg_catalog.current_setting('eternyx.result_a')::uuid;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_a')::uuid)$sql$);
RESET ROLE;
UPDATE public.user_attempts SET score=7
 WHERE id=pg_catalog.current_setting('eternyx.result_a')::uuid;
UPDATE public.education_final_grades SET max_score=9
 WHERE attempt_id=pg_catalog.current_setting('eternyx.result_a')::uuid;
SET ROLE authenticated;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
SELECT public.education_ci_expect_invalid(
 $sql$SELECT public.education_student_verified_result(
  pg_catalog.current_setting('eternyx.result_a')::uuid)$sql$);
RESET ROLE;
UPDATE public.education_final_grades SET max_score=10
 WHERE attempt_id=pg_catalog.current_setting('eternyx.result_a')::uuid;

-- 10. No read endpoint alters final grades, written reviews or results.
DO $vr$
BEGIN
 IF (SELECT score FROM public.user_attempts
     WHERE id=pg_catalog.current_setting('eternyx.result_a')::uuid)<>7
 OR (SELECT max_score FROM public.education_final_grades
     WHERE attempt_id=pg_catalog.current_setting('eternyx.result_a')::uuid)<>10
 OR (SELECT pg_catalog.count(*) FROM public.education_final_grades)<>5
 THEN RAISE EXCEPTION 'Verified result read mutated official grading evidence'; END IF;
END
$vr$;
SELECT 'Education owned verified-result authorization and unverified-grade rejection passed' AS result;
