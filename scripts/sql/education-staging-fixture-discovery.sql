-- Read-only reconstruction of the exact one-time synthetic package.
-- Inputs are dedicated staging identities; never search arbitrary exams.
\getenv a_email ETERNYX_RLS_TEST_A_EMAIL
\getenv b_email ETERNYX_RLS_TEST_B_EMAIL
\getenv i_email ETERNYX_RLS_INSTRUCTOR_EMAIL
BEGIN TRANSACTION READ ONLY;
WITH ids AS (
 SELECT (SELECT id FROM auth.users WHERE lower(email)=lower(:'a_email')) a,
 (SELECT id FROM auth.users WHERE lower(email)=lower(:'b_email')) b,
 (SELECT id FROM auth.users WHERE lower(email)=lower(:'i_email')) i
), cases AS (
 SELECT kind,CASE WHEN kind='final-b' THEN ids.b ELSE ids.a END learner,ids.i
 FROM ids CROSS JOIN unnest(ARRAY['read','fresh','final-a','final-b','pending','running','legacy']) kind
), package AS (
 SELECT c.kind,t.id exam,m.id mcq,e.id essay,o.id choice,ua.id attempt,
 ma.id mcq_answer,wa.id written_answer,ua.status,ua.start_time,ua.end_time,ua.score,ua.max_score,
 g.score ledger_score,g.max_score ledger_max,wr.points_awarded reviewed_points,
 c.learner
 FROM cases c
 JOIN public.teachers teacher ON teacher.user_id=c.i
 JOIN public.education_instructor_grants ig ON ig.teacher_id=teacher.id AND ig.user_id=c.i
 JOIN public.tests t ON t.teacher_id=teacher.id AND t.title='ETERNYX synthetic acceptance v1 / '||c.kind
  AND t.description='Synthetic test fixture only; not a real credential'
  AND t.is_active IS TRUE AND t.is_published IS TRUE AND t.duration_minutes=1440
  AND NULLIF(btrim(t.access_password_hash),'') IS NULL
 JOIN public.education_publication_requests p ON p.test_id=t.id AND p.teacher_id=teacher.id AND p.status='approved'
 JOIN public.admin_users op ON op.user_id=p.reviewed_by
 JOIN public.education_test_enrollments enrollment ON enrollment.test_id=t.id AND enrollment.user_id=c.learner AND enrollment.enrolled_by=op.user_id
 JOIN public.questions m ON m.test_id=t.id AND m.question_type='multiple_choice' AND m.points=5 AND m.order_index=1
 JOIN public.questions e ON e.test_id=t.id AND e.question_type='short_answer' AND e.points=2 AND e.order_index=2
 JOIN public.options o ON o.question_id=m.id AND o.is_correct IS TRUE
 LEFT JOIN public.user_attempts ua ON ua.test_id=t.id AND ua.user_id=c.learner
 LEFT JOIN public.user_answers ma ON ma.attempt_id=ua.id AND ma.question_id=m.id AND ma.selected_option_id=o.id
 LEFT JOIN public.user_answers wa ON wa.attempt_id=ua.id AND wa.question_id=e.id
 LEFT JOIN public.education_final_grades g ON g.attempt_id=ua.id
 LEFT JOIN public.education_written_reviews wr ON wr.answer_id=wa.id AND wr.reviewer_user_id=c.i
 WHERE (SELECT count(*) FROM public.questions WHERE test_id=t.id)=2
 AND (SELECT count(*) FROM public.options WHERE question_id=m.id)=2
 AND (SELECT count(*) FROM public.options WHERE question_id=e.id)=0
 AND (SELECT count(*) FROM public.education_test_enrollments WHERE test_id=t.id)=1
 AND (SELECT count(*) FROM public.user_attempts WHERE test_id=t.id)=CASE WHEN c.kind='fresh' THEN 0 ELSE 1 END
), valid AS (
 SELECT * FROM package WHERE
 (kind='fresh' AND attempt IS NULL)
 OR (kind IN ('read','running') AND status='in_progress' AND end_time IS NULL AND score IS NULL AND max_score IS NULL
  AND start_time+interval '1 day'>clock_timestamp() AND mcq_answer IS NOT NULL AND ledger_score IS NULL)
 OR (kind='pending' AND status='submitted' AND end_time IS NOT NULL AND score IS NULL AND max_score IS NULL AND ledger_score IS NULL AND mcq_answer IS NOT NULL)
 OR (kind='legacy' AND status='submitted' AND end_time IS NOT NULL AND score=5 AND max_score=7 AND ledger_score IS NULL AND mcq_answer IS NOT NULL)
 OR (kind IN ('final-a','final-b') AND status='submitted' AND end_time IS NOT NULL AND score=7 AND max_score=7
  AND ledger_score=7 AND ledger_max=7 AND reviewed_points=2 AND mcq_answer IS NOT NULL AND written_answer IS NOT NULL)
), parts AS (
 SELECT CASE kind
 WHEN 'read' THEN jsonb_build_object('ETERNYX_EDU_STAGING_TEST_ID',exam,'ETERNYX_EDU_STAGING_QUESTION_ID',mcq,'ETERNYX_EDU_STAGING_OPTION_ID',choice,'ETERNYX_EDU_STAGING_ATTEMPT_ID',attempt,'ETERNYX_EDU_STAGING_ANSWER_ID',mcq_answer)
 WHEN 'fresh' THEN jsonb_build_object('ETERNYX_EDU_WRITE_TEST_ID',exam,'ETERNYX_EDU_WRITE_MCQ_ID',mcq,'ETERNYX_EDU_WRITE_MCQ_OPTION_ID',choice,'ETERNYX_EDU_WRITE_ESSAY_ID',essay)
 WHEN 'final-a' THEN jsonb_build_object('ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT',attempt,'ETERNYX_EDU_REVIEW_TEST_ID',exam,'ETERNYX_EDU_REVIEW_ATTEMPT_ID',attempt,'ETERNYX_EDU_REVIEW_ANSWER_ID',written_answer)
 WHEN 'final-b' THEN jsonb_build_object('ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT',attempt)
 ELSE jsonb_build_object('ETERNYX_EDU_RESULT_'||upper(kind)||'_A_ATTEMPT',attempt) END data
 FROM valid
)
SELECT CASE WHEN (SELECT count(*)=7 AND count(DISTINCT kind)=7 FROM package)
 AND (SELECT count(*)=7 AND count(DISTINCT kind)=7 FROM valid)
 AND (SELECT count(DISTINCT u)=3 FROM ids CROSS JOIN LATERAL unnest(ARRAY[a,b,i]) u)
 AND NOT EXISTS (SELECT 1 FROM public.admin_users,ids WHERE user_id IN (a,b,i))
 AND NOT EXISTS (SELECT 1 FROM public.education_instructor_grants,ids WHERE user_id IN (a,b))
 THEN (SELECT jsonb_object_agg(key,value) FROM parts CROSS JOIN LATERAL jsonb_each(data))
 ||jsonb_build_object('ETERNYX_EDU_RESULT_A_SCORE','7','ETERNYX_EDU_RESULT_A_MAX','7',
 'ETERNYX_EDU_RESULT_B_SCORE','7','ETERNYX_EDU_RESULT_B_MAX','7','ETERNYX_EDU_REVIEW_AWARDED_POINTS','2',
 'ETERNYX_EDU_FINALIZE_EXPECTED_SCORE','7','ETERNYX_EDU_FINALIZE_EXPECTED_MAX','7')
 ELSE NULL END::text;
ROLLBACK;
