-- Read-only, staging-only preflight for one fresh Education CBT exam.
-- Returns fixed booleans only: no UUID, identity, answer-key or score values.
-- Values are validated before psql, which quotes them via :'variable'.
BEGIN TRANSACTION READ ONLY;
WITH
  exam AS (
    SELECT t.id,t.teacher_id,t.is_active,t.is_published,
      t.duration_minutes,t.access_password_hash
    FROM public.tests t WHERE t.id=:'test_id'::uuid
  ),
  questions AS (
    SELECT q.id,q.question_type,q.points FROM public.questions q
    WHERE q.test_id=:'test_id'::uuid
  ),
  mcq_options AS (
    SELECT o.id,o.is_correct,o.option_text
    FROM public.options o
    WHERE o.question_id=:'mcq_id'::uuid
  ),
  chosen AS (
    SELECT q.points,o.is_correct FROM public.options o
    JOIN public.questions q ON q.id=o.question_id
    WHERE o.id=:'mcq_option_id'::uuid AND q.id=:'mcq_id'::uuid
  ),
  student_a AS (
    SELECT u.id FROM auth.users u
    WHERE pg_catalog.lower(u.email)=pg_catalog.lower(:'student_a_email')
  ),
  student_b AS (
    SELECT u.id FROM auth.users u
    WHERE pg_catalog.lower(u.email)=pg_catalog.lower(:'student_b_email')
  ),
  reviewer AS (
    SELECT u.id FROM auth.users u
    WHERE pg_catalog.lower(u.email)=pg_catalog.lower(:'instructor_email')
  )
SELECT pg_catalog.jsonb_build_object(
  'schema',1,'checks',pg_catalog.jsonb_build_object(
    'published_approved_exam', EXISTS(
      SELECT 1 FROM exam t
      JOIN public.education_publication_requests r ON r.test_id=t.id
      WHERE r.status='approved' AND t.is_active IS TRUE
        AND t.is_published IS TRUE
    ),
    'exam_not_password_locked', EXISTS(
      SELECT 1 FROM exam t
      WHERE pg_catalog.nullif(pg_catalog.btrim(
        COALESCE(t.access_password_hash,'')), '') IS NULL
    ),
    'exam_has_safe_test_window', EXISTS(
      SELECT 1 FROM exam t
      WHERE t.duration_minutes BETWEEN 30 AND 1440
    ),
    'reviewer_is_owned_verified_teacher', EXISTS(
      SELECT 1 FROM exam e JOIN public.teachers t ON t.id=e.teacher_id
      JOIN reviewer r ON r.id=t.user_id
      JOIN public.education_instructor_grants g
        ON g.teacher_id=t.id AND g.user_id=r.id
    ),
    'reviewer_has_one_unambiguous_grant', (
      SELECT count(*)=1
      FROM public.education_instructor_grants g
      JOIN public.teachers t ON t.id=g.teacher_id AND t.user_id=g.user_id
      JOIN reviewer r ON r.id=g.user_id
    ),
    'instructor_queue_has_spare_capacity', (
      SELECT count(*)<90 FROM public.user_answers a
      JOIN public.user_attempts ua ON ua.id=a.attempt_id
      JOIN public.questions q ON q.id=a.question_id
        AND q.test_id=ua.test_id
      JOIN public.tests t ON t.id=ua.test_id
      JOIN public.education_publication_requests p ON p.test_id=t.id
        AND p.status='approved'
      LEFT JOIN public.education_written_reviews mr ON mr.answer_id=a.id
      JOIN exam e ON e.teacher_id=t.teacher_id
      WHERE mr.answer_id IS NULL
        AND t.is_published IS TRUE
        AND ua.status IN ('submitted','auto_submitted')
        AND q.question_type='short_answer'
        AND pg_catalog.char_length(pg_catalog.btrim(
          COALESCE(a.short_answer_text,'')))>0
    ),
    'exactly_two_exam_questions', (SELECT count(*)=2 FROM questions),
    'exactly_one_mcq_question', (
      SELECT count(*)=1 FROM questions
      WHERE id=:'mcq_id'::uuid AND question_type='multiple_choice'
    ),
    'exactly_one_written_question', (
      SELECT count(*)=1 FROM questions
      WHERE id=:'essay_id'::uuid AND question_type='short_answer'
    ),
    'all_question_points_valid', (
      SELECT count(*)=2 AND
        pg_catalog.bool_and(points IS NOT NULL AND points BETWEEN 1 AND 1000)
      FROM questions
    ),
    'mcq_has_one_correct_option', (
      SELECT count(*) FILTER (WHERE is_correct IS TRUE)=1
        AND count(*)>=2 AND count(*)<=10
      FROM mcq_options
    ),
    'mcq_choices_have_valid_labels', (
      SELECT count(*) BETWEEN 2 AND 10
        AND pg_catalog.bool_and(is_correct IS NOT NULL)
        AND pg_catalog.bool_and(pg_catalog.char_length(
          pg_catalog.btrim(COALESCE(option_text,'')))>0)
      FROM mcq_options
    ),
    'selected_mcq_option_belongs_to_question', (
      SELECT count(*)=1 AND pg_catalog.bool_and(is_correct IS NOT NULL)
      FROM chosen
    ),
    'expected_max_matches_questions', (
      SELECT count(*)=2 AND sum(points)=:'expected_max'::integer
      FROM questions
    ),
    'awarded_written_points_valid', EXISTS(
      SELECT 1 FROM questions q WHERE q.id=:'essay_id'::uuid
        AND :'awarded'::integer BETWEEN 0 AND q.points
    ),
    'expected_grade_matches_fixed_choice_and_review', EXISTS(
      SELECT 1 FROM chosen c JOIN questions q ON q.id=:'essay_id'::uuid
      WHERE q.question_type='short_answer'
        AND :'awarded'::integer BETWEEN 0 AND q.points
        AND :'awarded'::integer+
          CASE WHEN c.is_correct THEN c.points ELSE 0 END
          =:'expected_score'::integer
    ),
    'student_a_is_enrolled', EXISTS(
      SELECT 1 FROM public.education_test_enrollments e
      JOIN student_a a ON a.id=e.user_id WHERE e.test_id=:'test_id'::uuid
    ),
    'student_b_is_not_enrolled', NOT EXISTS(
      SELECT 1 FROM public.education_test_enrollments e
      JOIN student_b b ON b.id=e.user_id WHERE e.test_id=:'test_id'::uuid
    ),
    'student_a_has_no_attempt', NOT EXISTS(
      SELECT 1 FROM public.user_attempts a JOIN student_a u ON u.id=a.user_id
      WHERE a.test_id=:'test_id'::uuid
    ),
    'student_b_has_no_attempt', NOT EXISTS(
      SELECT 1 FROM public.user_attempts a JOIN student_b u ON u.id=a.user_id
      WHERE a.test_id=:'test_id'::uuid
    ),
    'three_dedicated_auth_identities_exist', (
      (SELECT count(*)=1 FROM student_a) AND
      (SELECT count(*)=1 FROM student_b) AND
      (SELECT count(*)=1 FROM reviewer)
    )
  )
)::text;
ROLLBACK;
