-- ETERNYX Education instructor authoring — STAGING / REVIEW ONLY.
-- Do NOT deploy to production or automatic migration history.
-- Preconditions: public.admin_users, public.is_admin(), public.teachers,
-- public.tests, public.questions, public.options and their expected columns
-- exist; production schema, RLS and column grants remain unverified.
BEGIN;

-- Trusted grants are separate from user-editable profile and self-selected roles.
CREATE TABLE IF NOT EXISTS public.education_instructor_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL UNIQUE REFERENCES public.teachers(id) ON DELETE CASCADE,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.education_instructor_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_instructor_grants FROM PUBLIC, anon, authenticated, service_role;
-- No authenticated/anon RLS policies: only narrowly scoped SECURITY DEFINER
-- RPCs owned by a trusted database role may access the grant table.

-- Administrator approval requires the protected admin_users authority,
-- NOT public.user_roles or profile metadata.
CREATE OR REPLACE FUNCTION public.admin_approve_education_instructor(
  p_user_id uuid, p_display_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_name text := pg_catalog.btrim(p_display_name);
  v_teacher_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR v_name IS NULL OR pg_catalog.char_length(v_name) NOT BETWEEN 2 AND 120
     OR NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Invalid instructor record' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.teachers (user_id, name)
  VALUES (p_user_id, v_name)
  ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_teacher_id;
  INSERT INTO public.education_instructor_grants (user_id, teacher_id)
  VALUES (p_user_id, v_teacher_id)
  ON CONFLICT (user_id) DO UPDATE SET teacher_id = EXCLUDED.teacher_id;
  RETURN pg_catalog.jsonb_build_object('approved', true, 'teacher_id', v_teacher_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_revoke_education_instructor(
  p_user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.education_instructor_grants AS g WHERE g.user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$fn$;

-- An approved educator can only inspect the current caller's status.
CREATE OR REPLACE FUNCTION public.education_instructor_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT g.teacher_id INTO v_teacher_id
  FROM public.education_instructor_grants AS g
  JOIN public.teachers AS t ON t.id = g.teacher_id AND t.user_id = g.user_id
  WHERE g.user_id = (SELECT auth.uid());
  RETURN pg_catalog.jsonb_build_object('approved', v_teacher_id IS NOT NULL);
END;
$fn$;

-- Submit a validated version-1 question bank as an INACTIVE, UNPUBLISHED
-- private draft. This runs atomically in one Postgres function invocation.
CREATE OR REPLACE FUNCTION public.education_instructor_create_draft(p_bank jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_test_id uuid;
  v_question_id uuid;
  v_questions jsonb;
  v_question jsonb;
  v_options jsonb;
  v_option jsonb;
  v_title text;
  v_description text;
  v_text text;
  v_type text;
  v_duration integer;
  v_points integer;
  v_index integer := 0;
  v_choice_index integer;
  v_correct_count integer;
  v_choice_text text;
  v_ids text[] := ARRAY[]::text[];
  v_choice_ids text[];
  v_q_id text;
  v_option_id text;
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

  IF p_bank IS NULL OR pg_catalog.jsonb_typeof(p_bank) <> 'object'
     OR pg_catalog.octet_length(p_bank::text) > 256000
     OR p_bank->>'version' IS DISTINCT FROM '1'
     OR COALESCE(pg_catalog.jsonb_typeof(p_bank->'questions'), '') <> 'array' THEN
    RAISE EXCEPTION 'Unsupported question-bank format' USING ERRCODE = '22023';
  END IF;
  v_title := pg_catalog.btrim(p_bank->>'title');
  v_description := COALESCE(p_bank->>'description', '');
  IF v_title IS NULL OR pg_catalog.char_length(v_title) NOT BETWEEN 3 AND 160
     OR pg_catalog.char_length(v_description) > 1500
     OR COALESCE(p_bank->>'duration_minutes', '') !~ '^[0-9]{1,4}
    RAISE EXCEPTION 'Invalid question-bank metadata' USING ERRCODE = '22023';
  END IF;
  v_duration := (p_bank->>'duration_minutes')::integer;
  IF v_duration NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Invalid question-bank duration' USING ERRCODE = '22023';
  END IF;
  v_questions := p_bank->'questions';
  IF pg_catalog.jsonb_array_length(v_questions) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Question count must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tests
    (title, description, duration_minutes, teacher_id, is_active, is_published)
  VALUES (v_title, v_description, v_duration, v_teacher_id, false, false)
  RETURNING id INTO v_test_id;

  FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(v_questions) LOOP
    v_index := v_index + 1;
    v_q_id := v_question->>'id';
    v_type := v_question->>'type';
    v_text := pg_catalog.btrim(v_question->>'text');
    IF pg_catalog.jsonb_typeof(v_question) <> 'object'
       OR v_q_id IS NULL OR v_q_id !~ '^[A-Za-z0-9_-]{1,64}$'
       OR v_q_id = ANY(v_ids)
       OR COALESCE(v_type, '') NOT IN ('multiple_choice','true_false','short_answer')
       OR v_text IS NULL OR pg_catalog.char_length(v_text) NOT BETWEEN 3 AND 2000
       OR COALESCE(v_question->>'points', '') !~ '^[0-9]{1,4}
       OR COALESCE(pg_catalog.jsonb_typeof(v_question->'options'), '') <> 'array' THEN
      RAISE EXCEPTION 'Invalid question %', v_index USING ERRCODE = '22023';
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_q_id);
    v_points := (v_question->>'points')::integer;
    IF v_points NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid question points' USING ERRCODE = '22023';
    END IF;
    v_options := v_question->'options';
    IF (v_type = 'short_answer' AND pg_catalog.jsonb_array_length(v_options) <> 0)
      OR (v_type = 'true_false' AND pg_catalog.jsonb_array_length(v_options) <> 2)
      OR (v_type = 'multiple_choice' AND pg_catalog.jsonb_array_length(v_options) NOT BETWEEN 2 AND 8) THEN
      RAISE EXCEPTION 'Invalid choices for question %', v_index USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.questions (test_id, question_text, question_type, points, order_index)
    VALUES (v_test_id, v_text, v_type, v_points, v_index)
    RETURNING id INTO v_question_id;

    v_choice_ids := ARRAY[]::text[];
    v_correct_count := 0;
    v_choice_index := 0;
    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options) LOOP
      v_choice_index := v_choice_index + 1;
      v_option_id := v_option->>'id';
      v_choice_text := pg_catalog.btrim(v_option->>'text');
      IF pg_catalog.jsonb_typeof(v_option) <> 'object'
         OR v_option_id IS NULL OR v_option_id !~ '^[A-Za-z0-9_-]{1,64}$'
         OR v_option_id = ANY(v_choice_ids)
         OR v_choice_text IS NULL
         OR pg_catalog.char_length(v_choice_text) NOT BETWEEN 1 AND 500
         OR pg_catalog.jsonb_typeof(v_option->'correct') <> 'boolean' THEN
        RAISE EXCEPTION 'Invalid choice for question %', v_index USING ERRCODE = '22023';
      END IF;
      IF v_type = 'true_false' AND (
         (v_choice_index = 1 AND pg_catalog.lower(v_choice_text) <> 'true') OR
         (v_choice_index = 2 AND pg_catalog.lower(v_choice_text) <> 'false')
      ) THEN
        RAISE EXCEPTION 'True/False choice order is invalid' USING ERRCODE = '22023';
      END IF;
      v_choice_ids := pg_catalog.array_append(v_choice_ids, v_option_id);
      IF v_option->>'correct' = 'true' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
      INSERT INTO public.options (question_id, option_text, is_correct)
      VALUES (v_question_id, v_choice_text, (v_option->>'correct')::boolean);
    END LOOP;
    IF v_type <> 'short_answer' AND v_correct_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one correct choice is required for question %', v_index
      USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_test_id, 'status', 'private_draft', 'question_count', v_index
  );
END;
$fn$;

-- Metadata only: ownership is independently revalidated in the function.
CREATE OR REPLACE FUNCTION public.education_instructor_list_drafts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_result jsonb;
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'title', d.title, 'duration_minutes', d.duration_minutes,
      'created_at', d.created_at, 'status', 'private_draft'
    )), '[]'::jsonb)
  INTO v_result FROM (
    SELECT id, title, duration_minutes, created_at FROM public.tests
    WHERE teacher_id = v_teacher_id AND is_published IS FALSE AND is_active IS FALSE
    ORDER BY created_at DESC LIMIT 50
  ) AS d;
  RETURN v_result;
END;
$fn$;


-- Existing self-registered teacher identities must NOT retain direct
-- authoring rights. Retain minimum SELECT for student test-taking, while
-- requiring approved educator RPCs for writes. Coordinate with the legacy
-- CreateTest/TeacherDashboard clients and CBT atomic SQL before execution.
REVOKE INSERT, UPDATE, DELETE ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.options FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;

-- Privileged functions exposed in public require explicit EXECUTE grants and
-- caller authorization within each SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.admin_approve_education_instructor(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_education_instructor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_create_draft(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_list_drafts()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_approve_education_instructor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_education_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_create_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_list_drafts() TO authenticated;

COMMIT;

-- Staging only: direct table authoring has been revoked for browser roles.
-- Execute only after the atomic CBT answer-key isolation migration and
-- legacy teacher client replacement pass PostgreSQL/RLS acceptance tests.
 THEN
    RAISE EXCEPTION 'Invalid question-bank metadata' USING ERRCODE = '22023';
  END IF;
  v_duration := (p_bank->>'duration_minutes')::integer;
  IF v_duration NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Invalid question-bank duration' USING ERRCODE = '22023';
  END IF;
  v_questions := p_bank->'questions';
  IF pg_catalog.jsonb_array_length(v_questions) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Question count must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tests
    (title, description, duration_minutes, teacher_id, is_active, is_published)
  VALUES (v_title, v_description, v_duration, v_teacher_id, false, false)
  RETURNING id INTO v_test_id;

  FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(v_questions) LOOP
    v_index := v_index + 1;
    v_q_id := v_question->>'id';
    v_type := v_question->>'type';
    v_text := pg_catalog.btrim(v_question->>'text');
    IF pg_catalog.jsonb_typeof(v_question) <> 'object'
       OR v_q_id IS NULL OR v_q_id !~ '^[A-Za-z0-9_-]{1,64}$'
       OR v_q_id = ANY(v_ids)
       OR COALESCE(v_type, '') NOT IN ('multiple_choice','true_false','short_answer')
       OR v_text IS NULL OR pg_catalog.char_length(v_text) NOT BETWEEN 3 AND 2000
       OR COALESCE(v_question->>'points', '') !~ '^[0-9]{1,4}
       OR COALESCE(pg_catalog.jsonb_typeof(v_question->'options'), '') <> 'array' THEN
      RAISE EXCEPTION 'Invalid question %', v_index USING ERRCODE = '22023';
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_q_id);
    v_points := (v_question->>'points')::integer;
    IF v_points NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid question points' USING ERRCODE = '22023';
    END IF;
    v_options := v_question->'options';
    IF (v_type = 'short_answer' AND pg_catalog.jsonb_array_length(v_options) <> 0)
      OR (v_type = 'true_false' AND pg_catalog.jsonb_array_length(v_options) <> 2)
      OR (v_type = 'multiple_choice' AND pg_catalog.jsonb_array_length(v_options) NOT BETWEEN 2 AND 8) THEN
      RAISE EXCEPTION 'Invalid choices for question %', v_index USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.questions (test_id, question_text, question_type, points, order_index)
    VALUES (v_test_id, v_text, v_type, v_points, v_index)
    RETURNING id INTO v_question_id;

    v_choice_ids := ARRAY[]::text[];
    v_correct_count := 0;
    v_choice_index := 0;
    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options) LOOP
      v_choice_index := v_choice_index + 1;
      v_option_id := v_option->>'id';
      v_choice_text := pg_catalog.btrim(v_option->>'text');
      IF pg_catalog.jsonb_typeof(v_option) <> 'object'
         OR v_option_id IS NULL OR v_option_id !~ '^[A-Za-z0-9_-]{1,64}$'
         OR v_option_id = ANY(v_choice_ids)
         OR v_choice_text IS NULL
         OR pg_catalog.char_length(v_choice_text) NOT BETWEEN 1 AND 500
         OR pg_catalog.jsonb_typeof(v_option->'correct') <> 'boolean' THEN
        RAISE EXCEPTION 'Invalid choice for question %', v_index USING ERRCODE = '22023';
      END IF;
      IF v_type = 'true_false' AND (
         (v_choice_index = 1 AND pg_catalog.lower(v_choice_text) <> 'true') OR
         (v_choice_index = 2 AND pg_catalog.lower(v_choice_text) <> 'false')
      ) THEN
        RAISE EXCEPTION 'True/False choice order is invalid' USING ERRCODE = '22023';
      END IF;
      v_choice_ids := pg_catalog.array_append(v_choice_ids, v_option_id);
      IF v_option->>'correct' = 'true' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
      INSERT INTO public.options (question_id, option_text, is_correct)
      VALUES (v_question_id, v_choice_text, (v_option->>'correct')::boolean);
    END LOOP;
    IF v_type <> 'short_answer' AND v_correct_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one correct choice is required for question %', v_index
      USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_test_id, 'status', 'private_draft', 'question_count', v_index
  );
END;
$fn$;

-- Metadata only: ownership is independently revalidated in the function.
CREATE OR REPLACE FUNCTION public.education_instructor_list_drafts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_result jsonb;
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'title', d.title, 'duration_minutes', d.duration_minutes,
      'created_at', d.created_at, 'status', 'private_draft'
    )), '[]'::jsonb)
  INTO v_result FROM (
    SELECT id, title, duration_minutes, created_at FROM public.tests
    WHERE teacher_id = v_teacher_id AND is_published IS FALSE AND is_active IS FALSE
    ORDER BY created_at DESC LIMIT 50
  ) AS d;
  RETURN v_result;
END;
$fn$;


-- Existing self-registered teacher identities must NOT retain direct
-- authoring rights. Retain minimum SELECT for student test-taking, while
-- requiring approved educator RPCs for writes. Coordinate with the legacy
-- CreateTest/TeacherDashboard clients and CBT atomic SQL before execution.
REVOKE INSERT, UPDATE, DELETE ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.options FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;

-- Privileged functions exposed in public require explicit EXECUTE grants and
-- caller authorization within each SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.admin_approve_education_instructor(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_education_instructor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_create_draft(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_list_drafts()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_approve_education_instructor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_education_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_create_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_list_drafts() TO authenticated;

COMMIT;

-- Staging only: direct table authoring has been revoked for browser roles.
-- Execute only after the atomic CBT answer-key isolation migration and
-- legacy teacher client replacement pass PostgreSQL/RLS acceptance tests.

       OR COALESCE(pg_catalog.jsonb_typeof(v_question->'options'), '') <> 'array' THEN
      RAISE EXCEPTION 'Invalid question %', v_index USING ERRCODE = '22023';
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_q_id);
    v_points := (v_question->>'points')::integer;
    IF v_points NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid question points' USING ERRCODE = '22023';
    END IF;
    v_options := v_question->'options';
    IF (v_type = 'short_answer' AND pg_catalog.jsonb_array_length(v_options) <> 0)
      OR (v_type = 'true_false' AND pg_catalog.jsonb_array_length(v_options) <> 2)
      OR (v_type = 'multiple_choice' AND pg_catalog.jsonb_array_length(v_options) NOT BETWEEN 2 AND 8) THEN
      RAISE EXCEPTION 'Invalid choices for question %', v_index USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.questions (test_id, question_text, question_type, points, order_index)
    VALUES (v_test_id, v_text, v_type, v_points, v_index)
    RETURNING id INTO v_question_id;

    v_choice_ids := ARRAY[]::text[];
    v_correct_count := 0;
    v_choice_index := 0;
    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options) LOOP
      v_choice_index := v_choice_index + 1;
      v_option_id := v_option->>'id';
      v_choice_text := pg_catalog.btrim(v_option->>'text');
      IF pg_catalog.jsonb_typeof(v_option) <> 'object'
         OR v_option_id IS NULL OR v_option_id !~ '^[A-Za-z0-9_-]{1,64}$'
         OR v_option_id = ANY(v_choice_ids)
         OR v_choice_text IS NULL
         OR pg_catalog.char_length(v_choice_text) NOT BETWEEN 1 AND 500
         OR pg_catalog.jsonb_typeof(v_option->'correct') <> 'boolean' THEN
        RAISE EXCEPTION 'Invalid choice for question %', v_index USING ERRCODE = '22023';
      END IF;
      IF v_type = 'true_false' AND (
         (v_choice_index = 1 AND pg_catalog.lower(v_choice_text) <> 'true') OR
         (v_choice_index = 2 AND pg_catalog.lower(v_choice_text) <> 'false')
      ) THEN
        RAISE EXCEPTION 'True/False choice order is invalid' USING ERRCODE = '22023';
      END IF;
      v_choice_ids := pg_catalog.array_append(v_choice_ids, v_option_id);
      IF v_option->>'correct' = 'true' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
      INSERT INTO public.options (question_id, option_text, is_correct)
      VALUES (v_question_id, v_choice_text, (v_option->>'correct')::boolean);
    END LOOP;
    IF v_type <> 'short_answer' AND v_correct_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one correct choice is required for question %', v_index
      USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_test_id, 'status', 'private_draft', 'question_count', v_index
  );
END;
$fn$;

-- Metadata only: ownership is independently revalidated in the function.
CREATE OR REPLACE FUNCTION public.education_instructor_list_drafts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_result jsonb;
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'title', d.title, 'duration_minutes', d.duration_minutes,
      'created_at', d.created_at, 'status', 'private_draft'
    )), '[]'::jsonb)
  INTO v_result FROM (
    SELECT id, title, duration_minutes, created_at FROM public.tests
    WHERE teacher_id = v_teacher_id AND is_published IS FALSE AND is_active IS FALSE
    ORDER BY created_at DESC LIMIT 50
  ) AS d;
  RETURN v_result;
END;
$fn$;


-- Existing self-registered teacher identities must NOT retain direct
-- authoring rights. Retain minimum SELECT for student test-taking, while
-- requiring approved educator RPCs for writes. Coordinate with the legacy
-- CreateTest/TeacherDashboard clients and CBT atomic SQL before execution.
REVOKE INSERT, UPDATE, DELETE ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.options FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;

-- Privileged functions exposed in public require explicit EXECUTE grants and
-- caller authorization within each SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.admin_approve_education_instructor(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_education_instructor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_create_draft(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_list_drafts()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_approve_education_instructor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_education_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_create_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_list_drafts() TO authenticated;

COMMIT;

-- Staging only: direct table authoring has been revoked for browser roles.
-- Execute only after the atomic CBT answer-key isolation migration and
-- legacy teacher client replacement pass PostgreSQL/RLS acceptance tests.
 THEN
    RAISE EXCEPTION 'Invalid question-bank metadata' USING ERRCODE = '22023';
  END IF;
  v_duration := (p_bank->>'duration_minutes')::integer;
  IF v_duration NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Invalid question-bank duration' USING ERRCODE = '22023';
  END IF;
  v_questions := p_bank->'questions';
  IF pg_catalog.jsonb_array_length(v_questions) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Question count must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tests
    (title, description, duration_minutes, teacher_id, is_active, is_published)
  VALUES (v_title, v_description, v_duration, v_teacher_id, false, false)
  RETURNING id INTO v_test_id;

  FOR v_question IN SELECT value FROM pg_catalog.jsonb_array_elements(v_questions) LOOP
    v_index := v_index + 1;
    v_q_id := v_question->>'id';
    v_type := v_question->>'type';
    v_text := pg_catalog.btrim(v_question->>'text');
    IF pg_catalog.jsonb_typeof(v_question) <> 'object'
       OR v_q_id IS NULL OR v_q_id !~ '^[A-Za-z0-9_-]{1,64}$'
       OR v_q_id = ANY(v_ids)
       OR COALESCE(v_type, '') NOT IN ('multiple_choice','true_false','short_answer')
       OR v_text IS NULL OR pg_catalog.char_length(v_text) NOT BETWEEN 3 AND 2000
       OR COALESCE(v_question->>'points', '') !~ '^[0-9]{1,4}
       OR COALESCE(pg_catalog.jsonb_typeof(v_question->'options'), '') <> 'array' THEN
      RAISE EXCEPTION 'Invalid question %', v_index USING ERRCODE = '22023';
    END IF;
    v_ids := pg_catalog.array_append(v_ids, v_q_id);
    v_points := (v_question->>'points')::integer;
    IF v_points NOT BETWEEN 1 AND 1000 THEN
      RAISE EXCEPTION 'Invalid question points' USING ERRCODE = '22023';
    END IF;
    v_options := v_question->'options';
    IF (v_type = 'short_answer' AND pg_catalog.jsonb_array_length(v_options) <> 0)
      OR (v_type = 'true_false' AND pg_catalog.jsonb_array_length(v_options) <> 2)
      OR (v_type = 'multiple_choice' AND pg_catalog.jsonb_array_length(v_options) NOT BETWEEN 2 AND 8) THEN
      RAISE EXCEPTION 'Invalid choices for question %', v_index USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.questions (test_id, question_text, question_type, points, order_index)
    VALUES (v_test_id, v_text, v_type, v_points, v_index)
    RETURNING id INTO v_question_id;

    v_choice_ids := ARRAY[]::text[];
    v_correct_count := 0;
    v_choice_index := 0;
    FOR v_option IN SELECT value FROM pg_catalog.jsonb_array_elements(v_options) LOOP
      v_choice_index := v_choice_index + 1;
      v_option_id := v_option->>'id';
      v_choice_text := pg_catalog.btrim(v_option->>'text');
      IF pg_catalog.jsonb_typeof(v_option) <> 'object'
         OR v_option_id IS NULL OR v_option_id !~ '^[A-Za-z0-9_-]{1,64}$'
         OR v_option_id = ANY(v_choice_ids)
         OR v_choice_text IS NULL
         OR pg_catalog.char_length(v_choice_text) NOT BETWEEN 1 AND 500
         OR pg_catalog.jsonb_typeof(v_option->'correct') <> 'boolean' THEN
        RAISE EXCEPTION 'Invalid choice for question %', v_index USING ERRCODE = '22023';
      END IF;
      IF v_type = 'true_false' AND (
         (v_choice_index = 1 AND pg_catalog.lower(v_choice_text) <> 'true') OR
         (v_choice_index = 2 AND pg_catalog.lower(v_choice_text) <> 'false')
      ) THEN
        RAISE EXCEPTION 'True/False choice order is invalid' USING ERRCODE = '22023';
      END IF;
      v_choice_ids := pg_catalog.array_append(v_choice_ids, v_option_id);
      IF v_option->>'correct' = 'true' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
      INSERT INTO public.options (question_id, option_text, is_correct)
      VALUES (v_question_id, v_choice_text, (v_option->>'correct')::boolean);
    END LOOP;
    IF v_type <> 'short_answer' AND v_correct_count <> 1 THEN
      RAISE EXCEPTION 'Exactly one correct choice is required for question %', v_index
      USING ERRCODE = '22023';
    END IF;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'id', v_test_id, 'status', 'private_draft', 'question_count', v_index
  );
END;
$fn$;

-- Metadata only: ownership is independently revalidated in the function.
CREATE OR REPLACE FUNCTION public.education_instructor_list_drafts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_result jsonb;
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
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'title', d.title, 'duration_minutes', d.duration_minutes,
      'created_at', d.created_at, 'status', 'private_draft'
    )), '[]'::jsonb)
  INTO v_result FROM (
    SELECT id, title, duration_minutes, created_at FROM public.tests
    WHERE teacher_id = v_teacher_id AND is_published IS FALSE AND is_active IS FALSE
    ORDER BY created_at DESC LIMIT 50
  ) AS d;
  RETURN v_result;
END;
$fn$;


-- Existing self-registered teacher identities must NOT retain direct
-- authoring rights. Retain minimum SELECT for student test-taking, while
-- requiring approved educator RPCs for writes. Coordinate with the legacy
-- CreateTest/TeacherDashboard clients and CBT atomic SQL before execution.
REVOKE INSERT, UPDATE, DELETE ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.options FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, title, description, duration_minutes, is_active, is_published, teacher_id)
  ON public.tests FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, test_id, question_text, question_type, points, order_index)
  ON public.questions FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, question_id, option_text, is_correct)
  ON public.options FROM PUBLIC, anon, authenticated;

-- Privileged functions exposed in public require explicit EXECUTE grants and
-- caller authorization within each SECURITY DEFINER function.
REVOKE ALL ON FUNCTION public.admin_approve_education_instructor(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_revoke_education_instructor(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_access()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_create_draft(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_instructor_list_drafts()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_approve_education_instructor(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_education_instructor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_create_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_instructor_list_drafts() TO authenticated;

COMMIT;

-- Staging only: direct table authoring has been revoked for browser roles.
-- Execute only after the atomic CBT answer-key isolation migration and
-- legacy teacher client replacement pass PostgreSQL/RLS acceptance tests.
