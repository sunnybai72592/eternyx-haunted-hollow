-- ETERNYX Education written-answer review: STAGED SOURCE ONLY.
-- Depends on verified instructor grants, drafted exams, controlled publication,
-- and atomic exam attempt/answer restrictions. NOT an automatic migration.
-- Does not write public learner scores or change the existing grading worker.
BEGIN;

CREATE TABLE IF NOT EXISTS public.education_written_reviews (
  answer_id uuid PRIMARY KEY REFERENCES public.user_answers(id) ON DELETE CASCADE,
  points_awarded integer NOT NULL CHECK (points_awarded BETWEEN 0 AND 1000),
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.education_written_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.education_written_reviews FROM PUBLIC, anon, authenticated;
-- No browser table policy. Only dedicated authenticated RPCs with fresh,
-- server-verified instructor ownership may return or mutate any review.

CREATE OR REPLACE FUNCTION public.education_instructor_written_review_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_rows jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT g.teacher_id INTO v_teacher_id
  FROM public.education_instructor_grants AS g
  JOIN public.teachers AS t
    ON t.id = g.teacher_id AND t.user_id = g.user_id
  WHERE g.user_id = (SELECT auth.uid());
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Verified instructor access required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'answer_id', r.answer_id,
    'attempt_id', r.attempt_id,
    'test_id', r.test_id,
    'test_title', r.test_title,
    'question_text', r.question_text,
    'response_text', r.response_text,
    'points_possible', r.points_possible,
    'reviewed_points', r.reviewed_points,
    'reviewed_at', r.reviewed_at
  )), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id AS answer_id, ua.id AS attempt_id, t.id AS test_id,
      t.title AS test_title, q.question_text, a.short_answer_text AS response_text,
      q.points AS points_possible, mr.points_awarded AS reviewed_points,
      mr.reviewed_at
    FROM public.user_answers AS a
    JOIN public.user_attempts AS ua ON ua.id = a.attempt_id
    JOIN public.questions AS q ON q.id = a.question_id AND q.test_id = ua.test_id
    JOIN public.tests AS t ON t.id = ua.test_id
    JOIN public.education_publication_requests AS p
      ON p.test_id = t.id AND p.status = 'approved'
    LEFT JOIN public.education_written_reviews AS mr ON mr.answer_id = a.id
    WHERE t.teacher_id = v_teacher_id AND t.is_published IS TRUE
      AND ua.status IN ('submitted','auto_submitted')
      AND q.question_type = 'short_answer'
      AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(a.short_answer_text,''))) > 0
    ORDER BY (mr.answer_id IS NOT NULL) ASC, ua.end_time ASC, a.id ASC
    LIMIT 100
  ) AS r;
  RETURN v_rows;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.education_instructor_review_written_answer(
  p_answer_id uuid, p_points integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_attempt public.user_attempts%ROWTYPE;
  v_answer public.user_answers%ROWTYPE;
  v_possible integer;
  v_test uuid;
  v_record public.education_written_reviews%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT g.teacher_id INTO v_teacher_id
  FROM public.education_instructor_grants AS g
  JOIN public.teachers AS t ON t.id = g.teacher_id AND t.user_id = g.user_id
  WHERE g.user_id = (SELECT auth.uid());
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Verified instructor access required' USING ERRCODE = '42501';
  END IF;
  IF p_answer_id IS NULL OR p_points IS NULL OR p_points < 0 OR p_points > 1000 THEN
    RAISE EXCEPTION 'A valid answer and points are required' USING ERRCODE = '22023';
  END IF;
  -- Obtain and lock the parent attempt before considering its answers.
  -- Do not grade an in-progress or foreign exam even with a guessed UUID.
  SELECT ua.* INTO v_attempt FROM public.user_attempts AS ua
  JOIN public.user_answers AS a ON a.attempt_id = ua.id
  WHERE a.id = p_answer_id FOR UPDATE OF ua;
  IF NOT FOUND OR v_attempt.status NOT IN ('submitted','auto_submitted') THEN
    RAISE EXCEPTION 'Completed answer unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT a.* INTO v_answer
  FROM public.user_answers AS a
  WHERE a.id = p_answer_id AND a.attempt_id = v_attempt.id
  FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Answer unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT q.points, t.id INTO v_possible, v_test
  FROM public.questions AS q
  JOIN public.tests AS t ON t.id = q.test_id AND t.id = v_attempt.test_id
  JOIN public.education_publication_requests AS p
    ON p.test_id = t.id AND p.status = 'approved'
  WHERE q.id = v_answer.question_id AND q.question_type = 'short_answer'
    AND t.teacher_id = v_teacher_id AND t.is_published IS TRUE;
  IF v_possible IS NULL
     OR v_possible NOT BETWEEN 1 AND 1000
     OR p_points > v_possible
     OR pg_catalog.char_length(pg_catalog.btrim(COALESCE(v_answer.short_answer_text,''))) = 0 THEN
    RAISE EXCEPTION 'Owned completed written answer and valid points required'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.education_written_reviews AS mr
    (answer_id, points_awarded, reviewer_user_id, reviewed_at)
  VALUES (p_answer_id, p_points, (SELECT auth.uid()), clock_timestamp())
  ON CONFLICT (answer_id) DO UPDATE SET
    points_awarded = EXCLUDED.points_awarded,
    reviewer_user_id = EXCLUDED.reviewer_user_id,
    reviewed_at = EXCLUDED.reviewed_at
    WHERE mr.points_awarded IS DISTINCT FROM EXCLUDED.points_awarded
       OR mr.reviewer_user_id IS DISTINCT FROM EXCLUDED.reviewer_user_id
  RETURNING * INTO v_record;
  IF NOT FOUND THEN
    SELECT mr.* INTO v_record FROM public.education_written_reviews AS mr
    WHERE mr.answer_id = p_answer_id;
  END IF;
  -- Review evidence is stored separately. A staged trusted aggregation/worker
  -- integration MUST precede showing an official score; never set user grade
  -- fields via browser or use a provisional manual mark as final result.
  RETURN pg_catalog.jsonb_build_object(
    'answer_id', p_answer_id, 'test_id', v_test,
    'points_awarded', v_record.points_awarded,
    'status', 'review_recorded', 'official_score_updated', false
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.education_instructor_written_review_queue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_review_written_answer(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_written_review_queue()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_review_written_answer(uuid, integer)
  TO authenticated;
COMMIT;
