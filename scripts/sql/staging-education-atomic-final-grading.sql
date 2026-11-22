-- ETERNYX Education — STAGING ONLY trusted atomic final grade.
-- Apply AFTER staging-education-written-review.sql and all prior coordinated
-- Education SQL. Never run as an automatic production migration.
-- The browser MUST NOT execute this function or write official grade fields.
BEGIN;

CREATE TABLE IF NOT EXISTS public.education_final_grades (
  attempt_id uuid PRIMARY KEY REFERENCES public.user_attempts(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0),
  max_score integer NOT NULL CHECK (max_score >= 0 AND max_score >= score),
  finalized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (max_score <= 100000)
);
ALTER TABLE public.education_final_grades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.education_final_grades FROM PUBLIC, anon, authenticated, service_role;
-- No student-facing RLS policy: only a dedicated service-role RPC can insert.
-- These rows form an immutable finalization marker for retry/idempotency.

-- Instructor RPC and trusted finalizer take the attempt FOR UPDATE lock first.
-- The trigger prevents any later modification to reviewed marks after
-- finalization, including attempts by other privileged database paths.
CREATE OR REPLACE FUNCTION public.education_reject_finalized_review_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_attempt_id uuid;
BEGIN
  SELECT a.attempt_id INTO v_attempt_id FROM public.user_answers AS a
  WHERE a.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.answer_id ELSE NEW.answer_id END;
  IF v_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Review answer unavailable' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.user_attempts AS a WHERE a.id = v_attempt_id FOR UPDATE OF a;
  IF EXISTS (
    SELECT 1 FROM public.education_final_grades AS f
    WHERE f.attempt_id = v_attempt_id
  ) THEN
    RAISE EXCEPTION 'Official final grade is locked' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.education_reject_finalized_review_change()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS education_lock_final_review ON public.education_written_reviews;
CREATE TRIGGER education_lock_final_review
BEFORE INSERT OR UPDATE OR DELETE ON public.education_written_reviews
FOR EACH ROW EXECUTE FUNCTION public.education_reject_finalized_review_change();

-- Only the trusted server may call this. It holds the attempt lock across
-- pending-check, all grade writes, final score and immutable ledger creation.
-- Crucially, NO score, answer grade, or ledger row is written if any nonblank
-- written response lacks a valid review from a currently verified instructor.
CREATE OR REPLACE FUNCTION public.education_finalize_cbt_grade(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_attempt public.user_attempts%ROWTYPE;
  v_test public.tests%ROWTYPE;
  v_existing public.education_final_grades%ROWTYPE;
  v_question record;
  v_answer public.user_answers%ROWTYPE;
  v_option_correct boolean;
  v_has_option boolean;
  v_review_points integer;
  v_has_review boolean;
  v_points integer;
  v_correct boolean;
  v_question_count integer := 0;
  v_max_score integer := 0;
  v_score integer := 0;
  v_missing_review integer := 0;
  v_updates jsonb := '[]'::jsonb;
  v_update jsonb;
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Attempt ID required' USING ERRCODE = '22023';
  END IF;
  SELECT a.* INTO v_attempt FROM public.user_attempts AS a
  WHERE a.id = p_attempt_id FOR UPDATE OF a;
  IF NOT FOUND OR v_attempt.status NOT IN ('submitted','auto_submitted')
     OR v_attempt.end_time IS NULL THEN
    RAISE EXCEPTION 'Only completed submitted attempts can be graded'
      USING ERRCODE = '22023';
  END IF;

  SELECT f.* INTO v_existing FROM public.education_final_grades AS f
  WHERE f.attempt_id = p_attempt_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status','already_finalized','attempt_id',p_attempt_id,
      'score',v_existing.score,'max_score',v_existing.max_score,
      'pending_manual_review',0
    );
  END IF;

  -- Fail closed if an older non-atomic grading service wrote partial grades.
  -- The trusted staging rollout must reconcile these attempts first; do not
  -- silently overwrite them or claim this script migrated historical grades.
  IF v_attempt.score IS NOT NULL OR v_attempt.max_score IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy grading record must be reconciled'
      USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_test FROM public.tests AS t
  JOIN public.education_publication_requests AS r
    ON r.test_id = t.id AND r.status = 'approved'
  WHERE t.id = v_attempt.test_id AND t.is_published IS TRUE
    AND t.is_active IS TRUE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.education_test_enrollments AS e
    WHERE e.test_id = v_attempt.test_id AND e.user_id = v_attempt.user_id
  ) THEN
    RAISE EXCEPTION 'Reviewed enrolled published test required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_answers AS a
    LEFT JOIN public.questions AS q ON q.id = a.question_id
    WHERE a.attempt_id = p_attempt_id
      AND (q.id IS NULL OR q.test_id IS DISTINCT FROM v_attempt.test_id)
  ) THEN
    RAISE EXCEPTION 'Cross-test answer detected' USING ERRCODE = '22023';
  END IF;

  FOR v_question IN
    SELECT q.id, q.question_type, q.points
    FROM public.questions AS q WHERE q.test_id = v_attempt.test_id
    ORDER BY q.order_index, q.id
  LOOP
    v_question_count := v_question_count + 1;
    IF v_question_count > 100
       OR v_question.points IS NULL
       OR v_question.points NOT BETWEEN 1 AND 1000
       OR v_question.question_type NOT IN ('multiple_choice','true_false','short_answer') THEN
      RAISE EXCEPTION 'Invalid assessment question' USING ERRCODE = '22023';
    END IF;
    v_max_score := v_max_score + v_question.points;
    v_correct := NULL;
    v_points := 0;
    SELECT a.* INTO v_answer FROM public.user_answers AS a
    WHERE a.attempt_id = p_attempt_id AND a.question_id = v_question.id;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_question.question_type = 'short_answer' THEN
      IF v_answer.selected_option_id IS NOT NULL THEN
        RAISE EXCEPTION 'Written response has an objective option'
          USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.char_length(pg_catalog.btrim(
        COALESCE(v_answer.short_answer_text,''))) > 0 THEN
        SELECT r.points_awarded INTO v_review_points
        FROM public.education_written_reviews AS r
        JOIN public.education_instructor_grants AS g
          ON g.user_id = r.reviewer_user_id
         AND g.teacher_id = v_test.teacher_id
        JOIN public.teachers AS t
          ON t.id = g.teacher_id AND t.user_id = g.user_id
        WHERE r.answer_id = v_answer.id;
        v_has_review := FOUND;
        IF NOT v_has_review THEN
          v_missing_review := v_missing_review + 1;
          CONTINUE;
        END IF;
        IF v_review_points IS NULL
           OR v_review_points NOT BETWEEN 0 AND v_question.points THEN
          RAISE EXCEPTION 'Invalid reviewed written-answer points'
            USING ERRCODE = '22023';
        END IF;
        v_points := v_review_points;
      END IF;
    ELSE
      IF COALESCE(pg_catalog.btrim(v_answer.short_answer_text),'') <> '' THEN
        RAISE EXCEPTION 'Objective answer contains written response'
          USING ERRCODE = '22023';
      END IF;
      IF v_answer.selected_option_id IS NOT NULL THEN
        SELECT o.is_correct INTO v_option_correct FROM public.options AS o
        WHERE o.id = v_answer.selected_option_id AND o.question_id = v_question.id;
        v_has_option := FOUND;
        IF NOT v_has_option OR v_option_correct IS NULL THEN
          RAISE EXCEPTION 'Objective answer option invalid'
            USING ERRCODE = '22023';
        END IF;
        v_correct := v_option_correct;
        IF v_correct THEN v_points := v_question.points; END IF;
      END IF;
    END IF;
    v_score := v_score + v_points;
    v_updates := v_updates || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('answer_id',v_answer.id,
        'is_correct',v_correct,'points_awarded',v_points)
    );
  END LOOP;
  IF v_question_count < 1 THEN
    RAISE EXCEPTION 'Assessment has no questions' USING ERRCODE = '22023';
  END IF;
  IF v_missing_review > 0 THEN
    -- No table/score mutations, even to objective answers.
    RETURN pg_catalog.jsonb_build_object(
      'status','pending_review','attempt_id',p_attempt_id,
      'score',NULL,'max_score',NULL,
      'pending_manual_review',v_missing_review
    );
  END IF;
  IF v_score > v_max_score THEN
    RAISE EXCEPTION 'Score exceeds maximum' USING ERRCODE = '22023';
  END IF;
  FOR v_update IN SELECT value FROM pg_catalog.jsonb_array_elements(v_updates) LOOP
    UPDATE public.user_answers AS a
    SET is_correct = (v_update->>'is_correct')::boolean,
        points_awarded = (v_update->>'points_awarded')::integer
    WHERE a.id = (v_update->>'answer_id')::uuid AND a.attempt_id = p_attempt_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Answer changed during grading' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.user_attempts AS a
  SET score = v_score, max_score = v_max_score
  WHERE a.id = p_attempt_id;
  INSERT INTO public.education_final_grades (attempt_id,score,max_score)
  VALUES (p_attempt_id,v_score,v_max_score);
  RETURN pg_catalog.jsonb_build_object(
    'status','finalized','attempt_id',p_attempt_id,
    'score',v_score,'max_score',v_max_score,
    'pending_manual_review',0
  );
END;
$fn$;

-- PUBLIC gets function EXECUTE by default in Postgres. Remove inherited
-- browser access explicitly before granting only the server service role.
REVOKE ALL ON FUNCTION public.education_finalize_cbt_grade(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.education_finalize_cbt_grade(uuid)
  TO service_role;
COMMIT;
