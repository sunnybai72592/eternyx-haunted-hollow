-- ETERNYX Education empty staging foundation. NOT an automatic migration.
-- Apply only to an explicitly authorized isolated staging project.
-- The surrounding Supabase auth and trusted admin foundation must already exist.
-- All six tables must be absent; any existing table aborts the transaction.
BEGIN;
DO $guard$
BEGIN
 IF pg_catalog.to_regclass('auth.users') IS NULL
    OR pg_catalog.to_regclass('public.admin_users') IS NULL
    OR pg_catalog.to_regprocedure('public.is_admin()') IS NULL THEN
   RAISE EXCEPTION 'Education staging requires existing trusted auth/admin foundation';
 END IF;
END
$guard$;
CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.tests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  title text NOT NULL,
  description text,
  duration_minutes integer NOT NULL,
  teacher_id uuid REFERENCES public.teachers(id),
  is_active boolean DEFAULT false,
  is_published boolean DEFAULT false,
  access_password_hash text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL,
  points integer,
  order_index integer NOT NULL
);
CREATE TABLE public.options (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  is_correct boolean
);
CREATE TABLE public.user_attempts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id uuid REFERENCES public.tests(id),
  status text DEFAULT 'in_progress',
  start_time timestamptz DEFAULT clock_timestamp(),
  end_time timestamptz,
  score integer,
  max_score integer,
  is_mobile_locked boolean DEFAULT false,
  UNIQUE(user_id,test_id)
);
CREATE TABLE public.user_answers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.user_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.options(id),
  short_answer_text text,
  is_correct boolean,
  points_awarded integer,
  UNIQUE(attempt_id,question_id)
);


ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teachers,public.tests,public.questions,public.options,
 public.user_attempts,public.user_answers FROM PUBLIC,anon,authenticated;
-- No broad client privileges. These safe reads remain subject to RLS.
GRANT SELECT (id,title,description,duration_minutes,teacher_id,is_active,is_published,created_at)
 ON public.tests TO authenticated;
GRANT SELECT (id,test_id,question_text,question_type,points,order_index)
 ON public.questions TO authenticated;
COMMIT;
