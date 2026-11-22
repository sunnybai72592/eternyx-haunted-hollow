-- ETERNYX Education private-draft recovery — STAGING ONLY.
-- Apply only AFTER validating staging-education-verified-instructors.sql,
-- protected answer-key grants and the atomic CBT security rollout in staging.
-- Do NOT deploy this script to production. It is not an automatic migration.
BEGIN;

-- Instructor-only recovery of one of their own INACTIVE, UNPUBLISHED drafts.
-- This method deliberately returns private answer keys to the authorized
-- instructor, not a student; do not call it from learner-facing pages.
CREATE OR REPLACE FUNCTION public.education_instructor_load_draft(p_test_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_test public.tests%ROWTYPE;
  v_question record;
  v_option record;
  v_options jsonb;
  v_questions jsonb := '[]'::jsonb;
  v_bank jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_test_id IS NULL THEN
    RAISE EXCEPTION 'Sign-in and draft ID required' USING ERRCODE = '42501';
  END IF;

  SELECT g.teacher_id INTO v_teacher_id
  FROM public.education_instructor_grants AS g
  JOIN public.teachers AS t ON t.id = g.teacher_id AND t.user_id = g.user_id
  WHERE g.user_id = (SELECT auth.uid());
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Verified instructor access required' USING ERRCODE = '42501';
  END IF;

  SELECT test.* INTO v_test
  FROM public.tests AS test
  WHERE test.id = p_test_id AND test.teacher_id = v_teacher_id
    AND test.is_active IS FALSE AND test.is_published IS FALSE
    AND NOT EXISTS (
      SELECT 1 FROM public.user_attempts AS a WHERE a.test_id = test.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Private draft not accessible' USING ERRCODE = '42501';
  END IF;

  FOR v_question IN
    SELECT q.id, q.question_text, q.question_type, q.points
    FROM public.questions AS q
    WHERE q.test_id = p_test_id
    ORDER BY q.order_index ASC, q.id ASC
  LOOP
    v_options := '[]'::jsonb;
    FOR v_option IN
      SELECT o.id, o.option_text, o.is_correct
      FROM public.options AS o
      WHERE o.question_id = v_question.id
      -- True/False must preserve fixed option order for the local editor.
      -- Legacy MCQ options have no order_index, so stable UUID ordering is used.
      ORDER BY
        CASE
          WHEN v_question.question_type = 'true_false'
            AND pg_catalog.lower(o.option_text) = 'true' THEN 0
          WHEN v_question.question_type = 'true_false'
            AND pg_catalog.lower(o.option_text) = 'false' THEN 1
          ELSE 2
        END, o.id ASC
    LOOP
      v_options := v_options || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'id', v_option.id::text,
          'text', v_option.option_text,
          'correct', v_option.is_correct
        )
      );
    END LOOP;

    v_questions := v_questions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_question.id::text,
        'text', v_question.question_text,
        'type', v_question.question_type,
        'points', v_question.points,
        'options', v_options
      )
    );
  END LOOP;

  IF pg_catalog.jsonb_array_length(v_questions) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Private draft contains an invalid question count' USING ERRCODE = '22023';
  END IF;
  v_bank := pg_catalog.jsonb_build_object(
    'version', 1,
    'title', v_test.title,
    'description', COALESCE(v_test.description, ''),
    'duration_minutes', v_test.duration_minutes,
    'questions', v_questions
  );
  IF pg_catalog.octet_length(v_bank::text) > 256000 THEN
    RAISE EXCEPTION 'Private draft is too large for the authoring editor' USING ERRCODE = '22023';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_test.id,
    'status', 'private_draft',
    'bank', v_bank
  );
END;
$fn$;

-- Explicitly revoke default PUBLIC / anonymous EXECUTE on this definer.
REVOKE ALL ON FUNCTION public.education_instructor_load_draft(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_load_draft(uuid)
  TO authenticated;

COMMIT;
