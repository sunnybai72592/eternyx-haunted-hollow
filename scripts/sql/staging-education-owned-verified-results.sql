-- ETERNYX Education: enrolled student verified results — STAGING SOURCE ONLY.
-- Apply AFTER staging-education-atomic-final-grading.sql in an isolated
-- approved staging project. Not an automatic migration or production grant.
-- This endpoint is read-only: it publishes no correctness keys, essays,
-- reviewer identities, raw grade ledgers or other students' result records.
BEGIN;

CREATE OR REPLACE FUNCTION public.education_student_verified_result(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_attempt public.user_attempts%ROWTYPE;
  v_grade public.education_final_grades%ROWTYPE;
BEGIN
  IF v_user IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated attempt ID required'
      USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO v_attempt
  FROM public.user_attempts AS a
  WHERE a.id = p_attempt_id AND a.user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt unavailable to this account'
      USING ERRCODE = '42501';
  END IF;
  -- Never report a score for an in-progress, cheated or unknown state.
  IF v_attempt.status NOT IN ('submitted','auto_submitted')
     OR v_attempt.end_time IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'attempt_id',p_attempt_id,'grade_status','in_progress',
      'score',NULL,'max_score',NULL,'finalized_at',NULL
    );
  END IF;

  SELECT f.* INTO v_grade
  FROM public.education_final_grades AS f
  WHERE f.attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    -- A non-null legacy or partial attempt score is deliberately ignored.
    -- Only an authentic, consistent atomic finalization ledger can certify it.
    RETURN pg_catalog.jsonb_build_object(
      'attempt_id',p_attempt_id,'grade_status','pending_review',
      'score',NULL,'max_score',NULL,'finalized_at',NULL
    );
  END IF;
  IF v_grade.score IS NULL OR v_grade.max_score IS NULL
     OR v_grade.finalized_at IS NULL
     OR v_grade.score < 0 OR v_grade.max_score < 1
     OR v_grade.score > v_grade.max_score
     OR v_attempt.score IS DISTINCT FROM v_grade.score
     OR v_attempt.max_score IS DISTINCT FROM v_grade.max_score THEN
    RAISE EXCEPTION 'Verified result does not match official grading ledger'
      USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'attempt_id',p_attempt_id,'grade_status','finalized',
    'score',v_grade.score,'max_score',v_grade.max_score,
    'finalized_at',v_grade.finalized_at
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.education_student_verified_result(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.education_student_verified_result(uuid)
  TO authenticated;
COMMIT;
