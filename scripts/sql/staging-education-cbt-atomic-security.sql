-- ETERNYX Education CBT — STAGING / REVIEW ONLY.
-- DO NOT apply to production until the exam client and teacher authoring flows
-- have been migrated, and a live schema/grants audit has passed.
-- This is intentionally in scripts/sql, NOT automatically run migrations.
-- PostgreSQL functions run inside the caller's database transaction.
BEGIN;

-- Existing public options exposed correct answers via table-wide SELECT.
-- Row policies do not provide column secrecy: revoke broad rights and permit
-- only safe student columns. Explicitly audit views and other RPC exposures.
REVOKE ALL PRIVILEGES ON TABLE public.options FROM PUBLIC, anon, authenticated;
-- Table-level REVOKE does NOT necessarily remove previously granted
-- column-specific privileges. Remove sensitive column access explicitly.
REVOKE SELECT (is_correct) ON public.options FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, question_id, option_text) ON public.options TO authenticated;

-- Remove direct browser mutation of protected score and status columns.
-- Student browser writes transition to checked RPCs below.
REVOKE ALL PRIVILEGES ON TABLE public.user_attempts FROM PUBLIC, anon, authenticated;
REVOKE INSERT (user_id, test_id, start_time, end_time, status, score, max_score, is_mobile_locked)
ON public.user_attempts FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (user_id, test_id, start_time, end_time, status, score, max_score, is_mobile_locked)
ON public.user_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, test_id, start_time, end_time, status,
              score, max_score, is_mobile_locked)
ON public.user_attempts TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.user_answers FROM PUBLIC, anon, authenticated;
REVOKE INSERT (attempt_id, question_id, selected_option_id, short_answer_text,
               is_correct, points_awarded)
ON public.user_answers FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (attempt_id, question_id, selected_option_id, short_answer_text,
               is_correct, points_awarded)
ON public.user_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, attempt_id, question_id, selected_option_id,
              short_answer_text, is_correct, points_awarded)
ON public.user_answers TO authenticated;

ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;

-- Do not expose an answer key through policies for arbitrary active tests.
DROP POLICY IF EXISTS "Users can view options for their attempts" ON public.options;
CREATE POLICY "Users can view options for their attempts"
ON public.options FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.questions AS q
    JOIN public.user_attempts AS a ON a.test_id = q.test_id
    WHERE q.id = options.question_id
      AND a.user_id = (SELECT auth.uid())
      AND a.status = 'in_progress'
      AND clock_timestamp() < a.start_time + (
        SELECT t.duration_minutes * INTERVAL '1 minute'
        FROM public.tests AS t WHERE t.id = a.test_id
      )
  )
);

-- New student attempt, or return the same ongoing attempt. Existing unique
-- (user_id,test_id) intentionally prohibits silent retakes.
CREATE OR REPLACE FUNCTION public.start_cbt_attempt(p_test_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_attempt public.user_attempts%ROWTYPE;
  v_minutes integer;
  v_now timestamptz;
BEGIN
  IF v_user IS NULL OR p_test_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Share-lock enrollment before creating the attempt. Revocation takes an
  -- UPDATE lock on the same row, eliminating the revoke-vs-start race.
  PERFORM 1 FROM public.education_test_enrollments AS e
  JOIN public.education_publication_requests AS r ON r.test_id = e.test_id
  WHERE e.test_id = p_test_id AND e.user_id = v_user
    AND r.status = 'approved'
  FOR SHARE OF e;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student is not enrolled in an approved test'
      USING ERRCODE = '42501';
  END IF;
  SELECT t.duration_minutes INTO v_minutes
  FROM public.tests AS t
  WHERE t.id = p_test_id AND t.is_active IS TRUE
    AND t.is_published IS TRUE
    -- Do not bypass instructor access passwords. A separately verified
    -- enrollment/password service is needed before these exams can open.
    AND NULLIF(pg_catalog.btrim(t.access_password_hash), '') IS NULL
    -- Enforced only with coordinated reviewed publication/enrollment staging.
    AND EXISTS (
      SELECT 1 FROM public.education_test_enrollments AS e
      JOIN public.education_publication_requests AS r ON r.test_id = e.test_id
      WHERE e.test_id = t.id AND e.user_id = v_user AND r.status = 'approved'
    );
  IF v_minutes IS NULL OR v_minutes NOT BETWEEN 1 AND 1440 OR
     NOT EXISTS (SELECT 1 FROM public.questions AS q WHERE q.test_id = p_test_id) THEN
    RAISE EXCEPTION 'Assessment unavailable' USING ERRCODE = '22023';
  END IF;
  SELECT a.* INTO v_attempt
  FROM public.user_attempts AS a
  WHERE a.user_id = v_user AND a.test_id = p_test_id
  FOR UPDATE OF a;
  IF FOUND THEN
    -- Compute after acquiring the lock, never before waiting for it.
    v_now := clock_timestamp();
    IF v_attempt.status IS DISTINCT FROM 'in_progress' OR
       (v_attempt.start_time IS NULL OR v_now >= v_attempt.start_time + v_minutes * INTERVAL '1 minute') THEN
      RAISE EXCEPTION 'Attempt already completed or expired' USING ERRCODE = '22023';
    END IF;
  ELSE
    INSERT INTO public.user_attempts (user_id, test_id, status)
    VALUES (v_user, p_test_id, 'in_progress')
    RETURNING * INTO v_attempt;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'id', v_attempt.id, 'start_time', v_attempt.start_time, 'status', v_attempt.status
  );
END;
$$;

-- Save one student response transactionally. Locking the attempt serializes
-- saving with final submission, while deadline uses the database clock.
CREATE OR REPLACE FUNCTION public.save_cbt_answer(
  p_attempt_id uuid, p_question_id uuid,
  p_selected_option_id uuid DEFAULT NULL, p_short_answer_text text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_attempt public.user_attempts%ROWTYPE;
  v_minutes integer;
  v_type text;
  v_now timestamptz;
BEGIN
  IF v_user IS NULL OR p_attempt_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO v_attempt
  FROM public.user_attempts AS a
  WHERE a.id = p_attempt_id AND a.user_id = v_user
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.status IS DISTINCT FROM 'in_progress' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'already_submitted');
  END IF;
  SELECT t.duration_minutes INTO v_minutes
  FROM public.tests AS t WHERE t.id = v_attempt.test_id;
  IF v_minutes IS NULL OR v_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Invalid assessment duration' USING ERRCODE = '22023';
  END IF;
  IF (v_attempt.start_time IS NULL OR v_now >= v_attempt.start_time + v_minutes * INTERVAL '1 minute') THEN
    UPDATE public.user_attempts AS a
    SET status = 'auto_submitted', end_time = v_now
    WHERE a.id = p_attempt_id;
    RETURN pg_catalog.jsonb_build_object('status', 'expired');
  END IF;
  SELECT q.question_type INTO v_type
  FROM public.questions AS q
  WHERE q.id = p_question_id AND q.test_id = v_attempt.test_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Question does not belong to attempt' USING ERRCODE = '22023';
  END IF;
  IF v_type = 'short_answer' THEN
    IF p_selected_option_id IS NOT NULL OR
       pg_catalog.char_length(COALESCE(p_short_answer_text, '')) > 5000 THEN
      RAISE EXCEPTION 'Invalid written answer' USING ERRCODE = '22023';
    END IF;
  ELSIF v_type IN ('multiple_choice', 'true_false') THEN
    IF COALESCE(pg_catalog.btrim(p_short_answer_text), '') <> '' OR
       (p_selected_option_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.options AS o
         WHERE o.id = p_selected_option_id AND o.question_id = p_question_id
       )) THEN
      RAISE EXCEPTION 'Invalid selected answer' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported question type' USING ERRCODE = '22023';
  END IF;

  IF p_selected_option_id IS NULL AND
     COALESCE(pg_catalog.btrim(p_short_answer_text), '') = '' THEN
    DELETE FROM public.user_answers AS a
    WHERE a.attempt_id = p_attempt_id AND a.question_id = p_question_id;
    RETURN pg_catalog.jsonb_build_object('status', 'cleared');
  END IF;

  INSERT INTO public.user_answers (
    attempt_id, question_id, selected_option_id, short_answer_text,
    is_correct, points_awarded
  ) VALUES (
    p_attempt_id, p_question_id, p_selected_option_id,
    CASE WHEN v_type = 'short_answer' THEN p_short_answer_text ELSE NULL END,
    NULL, NULL
  )
  ON CONFLICT (attempt_id, question_id)
  DO UPDATE SET
    selected_option_id = EXCLUDED.selected_option_id,
    short_answer_text = EXCLUDED.short_answer_text,
    is_correct = NULL,
    points_awarded = NULL;
  RETURN pg_catalog.jsonb_build_object('status', 'saved');
END;
$$;

-- A server-atomic final status transition. Answers are saved via the RPC
-- above during the exam; after the deadline new answers are not accepted.
CREATE OR REPLACE FUNCTION public.submit_cbt_attempt(p_attempt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user uuid := (SELECT auth.uid());
  v_attempt public.user_attempts%ROWTYPE;
  v_minutes integer;
  v_now timestamptz;
  v_status text;
BEGIN
  IF v_user IS NULL OR p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO v_attempt
  FROM public.user_attempts AS a
  WHERE a.id = p_attempt_id AND a.user_id = v_user
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attempt unavailable' USING ERRCODE = '42501';
  END IF;
  v_now := clock_timestamp();
  IF v_attempt.status IS DISTINCT FROM 'in_progress' THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', v_attempt.id, 'status', v_attempt.status
    );
  END IF;
  SELECT t.duration_minutes INTO v_minutes
  FROM public.tests AS t WHERE t.id = v_attempt.test_id;
  IF v_minutes IS NULL OR v_minutes NOT BETWEEN 1 AND 1440 OR
     v_attempt.start_time IS NULL THEN
    RAISE EXCEPTION 'Invalid assessment timing' USING ERRCODE = '22023';
  END IF;
  v_status := CASE WHEN v_now >= v_attempt.start_time +
    v_minutes * INTERVAL '1 minute' THEN 'auto_submitted' ELSE 'submitted' END;
  UPDATE public.user_attempts AS a
  SET status = v_status, end_time = v_now
  WHERE a.id = p_attempt_id;
  RETURN pg_catalog.jsonb_build_object('id', p_attempt_id, 'status', v_status);
END;
$$;

-- SECURITY DEFINER functions are owned by a trusted DB role, NOT by users.
-- PUBLIC gets EXECUTE by default: explicitly remove it for all overloads.
REVOKE ALL ON FUNCTION public.start_cbt_attempt(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_cbt_answer(uuid, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_cbt_attempt(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.start_cbt_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cbt_answer(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_cbt_attempt(uuid) TO authenticated;

COMMIT;

-- BACKEND NOTE: this intentionally blocks existing direct teacher options
-- edits and direct student attempt/answer writes. Replace those flows with
-- authorized RPCs BEFORE deployment. Live schema was not inspectable.
