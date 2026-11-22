-- ETERNYX EDUCATION: controlled publication and enrollment (STAGING ONLY).
-- Apply only AFTER staging instructor-grant, draft-recovery and atomic CBT
-- scripts have been audited and tested together. NOT an automatic migration.
-- This is not a production security certificate.
BEGIN;

CREATE TABLE IF NOT EXISTS public.education_publication_requests (
  test_id uuid PRIMARY KEY REFERENCES public.tests(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.education_test_enrollments (
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_by uuid NOT NULL REFERENCES auth.users(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (test_id, user_id)
);
ALTER TABLE public.education_publication_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_test_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_publication_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.education_test_enrollments FROM PUBLIC, anon, authenticated;
-- No public table policies: access is exclusively through verified RPCs.

-- Internal readiness helper. Deliberately unavailable to browser roles.
CREATE OR REPLACE FUNCTION public.education_publication_ready(p_test_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_count integer;
BEGIN
  IF p_test_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tests AS t
    WHERE t.id = p_test_id AND t.teacher_id IS NOT NULL
      AND t.is_active IS FALSE AND t.is_published IS FALSE
      AND t.duration_minutes BETWEEN 1 AND 1440
      AND pg_catalog.char_length(pg_catalog.btrim(t.title)) BETWEEN 3 AND 160
      AND NULLIF(pg_catalog.btrim(t.access_password_hash), '') IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.user_attempts AS a WHERE a.test_id = t.id)
  ) THEN RETURN false; END IF;

  SELECT pg_catalog.count(*) INTO v_count
  FROM public.questions AS q WHERE q.test_id = p_test_id;
  IF v_count NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.questions AS q
    WHERE q.test_id = p_test_id
      AND (q.question_type NOT IN ('multiple_choice','true_false','short_answer')
        OR q.question_type IS NULL OR q.points IS NULL OR q.points NOT BETWEEN 1 AND 1000
        OR pg_catalog.char_length(pg_catalog.btrim(q.question_text)) NOT BETWEEN 3 AND 2000
        OR (q.question_type = 'short_answer' AND EXISTS (
          SELECT 1 FROM public.options AS o WHERE o.question_id = q.id
        ))
        OR (q.question_type IN ('multiple_choice','true_false') AND (
          (SELECT pg_catalog.count(*) FROM public.options AS o
           WHERE o.question_id = q.id) NOT BETWEEN 2 AND 8
          OR (SELECT pg_catalog.count(*) FROM public.options AS o
              WHERE o.question_id = q.id AND o.is_correct IS TRUE) <> 1
          OR EXISTS (
            SELECT 1 FROM public.options AS o WHERE o.question_id = q.id
              AND (o.is_correct IS NULL OR
                   pg_catalog.char_length(pg_catalog.btrim(o.option_text)) NOT BETWEEN 1 AND 500)
          )
        ))
      )
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.questions AS q
    WHERE q.test_id = p_test_id AND q.question_type = 'true_false'
      AND (
        (SELECT pg_catalog.count(*) FROM public.options AS o
         WHERE o.question_id = q.id) <> 2
        OR NOT EXISTS (SELECT 1 FROM public.options AS o WHERE o.question_id = q.id
          AND pg_catalog.lower(pg_catalog.btrim(o.option_text)) = 'true')
        OR NOT EXISTS (SELECT 1 FROM public.options AS o WHERE o.question_id = q.id
          AND pg_catalog.lower(pg_catalog.btrim(o.option_text)) = 'false')
      )
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$fn$;

-- Verified instructor requests review; cannot publish their own exam.
CREATE OR REPLACE FUNCTION public.education_request_publication(p_test_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_teacher_id uuid;
  v_test public.tests%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_test_id IS NULL THEN
    RAISE EXCEPTION 'Sign-in and test ID required' USING ERRCODE = '42501';
  END IF;
  SELECT g.teacher_id INTO v_teacher_id
  FROM public.education_instructor_grants AS g
  JOIN public.teachers AS t ON t.id = g.teacher_id AND t.user_id = g.user_id
  WHERE g.user_id = (SELECT auth.uid());
  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Approved instructor required' USING ERRCODE = '42501';
  END IF;
  SELECT t.* INTO v_test FROM public.tests AS t
  WHERE t.id = p_test_id AND t.teacher_id = v_teacher_id
  FOR UPDATE OF t;
  IF NOT FOUND OR NOT public.education_publication_ready(p_test_id) THEN
    RAISE EXCEPTION 'Only your complete private unstarted draft may be requested'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.education_publication_requests
    (test_id, teacher_id, status, requested_at, reviewed_at, reviewed_by)
  VALUES (p_test_id, v_teacher_id, 'pending', clock_timestamp(), NULL, NULL)
  ON CONFLICT (test_id) DO UPDATE
    SET status = 'pending', requested_at = clock_timestamp(),
        reviewed_at = NULL, reviewed_by = NULL
    WHERE education_publication_requests.status IN ('rejected','pending');
  RETURN pg_catalog.jsonb_build_object('test_id', p_test_id, 'status', 'pending');
END;
$fn$;

-- An administrator can see metadata only; answer keys never leave this RPC.
CREATE OR REPLACE FUNCTION public.education_admin_publication_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_records jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'test_id', q.test_id, 'title', q.title, 'status', q.status,
    'requested_at', q.requested_at, 'teacher_id', q.teacher_id
  )), '[]'::jsonb) INTO v_records
  FROM (
    SELECT r.test_id, t.title, r.status, r.requested_at, r.teacher_id
    FROM public.education_publication_requests AS r
    JOIN public.tests AS t ON t.id = r.test_id
    WHERE r.status = 'pending'
    ORDER BY r.requested_at ASC LIMIT 100
  ) AS q;
  RETURN v_records;
END;
$fn$;

-- Publication requires a trusted admin, existing pending request, unchanged
-- private draft, no attempts and valid objective answer keys.
CREATE OR REPLACE FUNCTION public.education_admin_review_publication(
  p_test_id uuid, p_approve boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_request public.education_publication_requests%ROWTYPE;
  v_test public.tests%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_test_id IS NULL OR p_approve IS NULL THEN
    RAISE EXCEPTION 'Invalid review request' USING ERRCODE = '22023';
  END IF;
  SELECT t.* INTO v_test FROM public.tests AS t
  WHERE t.id = p_test_id FOR UPDATE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Test unavailable' USING ERRCODE = '22023'; END IF;
  SELECT r.* INTO v_request FROM public.education_publication_requests AS r
  WHERE r.test_id = p_test_id AND r.status = 'pending' FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending publication request' USING ERRCODE = '22023';
  END IF;
  IF p_approve THEN
    IF NOT public.education_publication_ready(p_test_id)
       OR NOT EXISTS (
         SELECT 1 FROM public.education_instructor_grants AS g
         WHERE g.teacher_id = v_request.teacher_id
       )
       OR v_test.teacher_id IS DISTINCT FROM v_request.teacher_id THEN
      RAISE EXCEPTION 'Draft is not eligible for approval' USING ERRCODE = '22023';
    END IF;
    UPDATE public.tests AS t
    SET is_active = true, is_published = true
    WHERE t.id = p_test_id;
  END IF;
  UPDATE public.education_publication_requests AS r
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = clock_timestamp(), reviewed_by = (SELECT auth.uid())
  WHERE r.test_id = p_test_id;
  RETURN pg_catalog.jsonb_build_object(
    'test_id', p_test_id,
    'status', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
  );
END;
$fn$;

-- Only a trusted admin may add a student to a reviewed, published exam.
CREATE OR REPLACE FUNCTION public.education_admin_enroll_student(
  p_test_id uuid, p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_test_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM auth.users AS u WHERE u.id = p_user_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.tests AS t
      JOIN public.education_publication_requests AS r ON r.test_id = t.id
      WHERE t.id = p_test_id AND t.is_published IS TRUE AND t.is_active IS TRUE
        AND r.status = 'approved'
        AND NULLIF(pg_catalog.btrim(t.access_password_hash), '') IS NULL
    ) THEN
    RAISE EXCEPTION 'Published approved test and existing student required'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.education_test_enrollments
    (test_id, user_id, enrolled_by)
  VALUES (p_test_id, p_user_id, (SELECT auth.uid()))
  ON CONFLICT (test_id, user_id) DO NOTHING;
  RETURN pg_catalog.jsonb_build_object(
    'test_id', p_test_id, 'user_id', p_user_id, 'status', 'enrolled'
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.education_admin_revoke_enrollment(
  p_test_id uuid, p_user_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_rows integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_test_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Enrollment IDs required' USING ERRCODE = '22023';
  END IF;
  -- Serialize with the student's start_cbt_attempt SHARE lock.
  PERFORM 1 FROM public.education_test_enrollments AS e
  WHERE e.test_id = p_test_id AND e.user_id = p_user_id
  FOR UPDATE OF e;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_attempts AS a
    WHERE a.test_id = p_test_id AND a.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Enrollment cannot be changed after starting an attempt'
      USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.education_test_enrollments AS e
  WHERE e.test_id = p_test_id AND e.user_id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$fn$;

-- Only enrolled learners see metadata for their actual accessible exams.
CREATE OR REPLACE FUNCTION public.education_student_enrolled_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', s.id, 'title', s.title, 'description', s.description,
    'duration_minutes', s.duration_minutes, 'created_at', s.created_at,
    'is_active', true
  )), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT t.id, t.title, t.description, t.duration_minutes, t.created_at
    FROM public.tests AS t
    JOIN public.education_test_enrollments AS e ON e.test_id = t.id
    WHERE e.user_id = (SELECT auth.uid())
      AND t.is_published IS TRUE AND t.is_active IS TRUE
      AND NULLIF(pg_catalog.btrim(t.access_password_hash), '') IS NULL
    ORDER BY t.created_at DESC LIMIT 100
  ) AS s;
  RETURN v_rows;
END;
$fn$;

-- Narrow legacy question browsing policy when enrolled-only admission is
-- activated. The existing admin-specific policy remains in place.
DROP POLICY IF EXISTS "Users can view questions for their attempts" ON public.questions;
CREATE POLICY "Students can view enrolled published questions"
ON public.questions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.education_test_enrollments AS e
    JOIN public.tests AS t ON t.id = e.test_id
    WHERE e.test_id = questions.test_id AND e.user_id = (SELECT auth.uid())
      AND t.is_active IS TRUE AND t.is_published IS TRUE
  )
);

-- Explicit EXECUTE grants; internal readiness helper stays unavailable.
REVOKE ALL ON FUNCTION public.education_publication_ready(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_request_publication(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_admin_publication_queue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_admin_review_publication(uuid,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_admin_enroll_student(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_admin_revoke_enrollment(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.education_student_enrolled_catalog()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.education_request_publication(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_publication_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_review_publication(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_enroll_student(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_revoke_enrollment(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_student_enrolled_catalog() TO authenticated;

COMMIT;
