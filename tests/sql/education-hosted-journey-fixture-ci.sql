-- Synthetic Education staging preflight test data. DISPOSABLE PostgreSQL ONLY.
-- No production, hosted Supabase, real account or real email is used.
BEGIN;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
UPDATE auth.users SET email='rls-edu-owner@example.invalid'
 WHERE id='00000000-0000-4000-8000-000000000002';
UPDATE auth.users SET email='rls-edu-student-a@example.invalid'
 WHERE id='00000000-0000-4000-8000-000000000004';
UPDATE auth.users SET email='rls-edu-student-b@example.invalid'
 WHERE id='00000000-0000-4000-8000-000000000005';
INSERT INTO public.tests(id,title,duration_minutes,teacher_id,is_active,is_published)
SELECT '10000000-0000-4000-8000-000000000001','Offline fixture security audit',
 60,t.id,true,true FROM public.teachers t
WHERE t.user_id='00000000-0000-4000-8000-000000000002';
INSERT INTO public.questions(id,test_id,question_text,question_type,points,order_index)
VALUES
 ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  'Disposable multiple choice','multiple_choice',5,1),
 ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  'Disposable written answer','short_answer',2,2);
INSERT INTO public.options(id,question_id,option_text,is_correct)
VALUES
 ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002',
  'Synthetic correct answer',true),
 ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002',
  'Synthetic incorrect answer',false);
INSERT INTO public.education_publication_requests(test_id,teacher_id,status)
SELECT t.id,t.teacher_id,'approved' FROM public.tests t
WHERE t.id='10000000-0000-4000-8000-000000000001';
INSERT INTO public.education_test_enrollments(test_id,user_id,enrolled_by)
VALUES ('10000000-0000-4000-8000-000000000001',
 '00000000-0000-4000-8000-000000000004',
 '00000000-0000-4000-8000-000000000001');
COMMIT;
