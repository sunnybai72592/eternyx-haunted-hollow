-- Education integration fixture ONLY. This is an isolated disposable DB.
-- All user IDs and records below are deliberately synthetic.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = ''
AS $fn$
  SELECT pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$fn$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

INSERT INTO auth.users (id) VALUES
('00000000-0000-4000-8000-000000000001'), -- admin
('00000000-0000-4000-8000-000000000002'), -- instructor A
('00000000-0000-4000-8000-000000000003'), -- instructor B
('00000000-0000-4000-8000-000000000004'), -- student A
('00000000-0000-4000-8000-000000000005'), -- student B
('00000000-0000-4000-8000-000000000006'); -- unapproved instructor

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
INSERT INTO public.admin_users VALUES ('00000000-0000-4000-8000-000000000001');
CREATE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users AS a WHERE a.user_id=(SELECT auth.uid())
  );
$fn$;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- Unapproved user has an ordinary teacher record, but NO trusted grant.
INSERT INTO public.teachers (user_id,name)
VALUES ('00000000-0000-4000-8000-000000000006','Self-selected unapproved teacher');

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

-- Emulate historical broad browser grants; staged scripts must remove them.
GRANT SELECT,INSERT,UPDATE,DELETE ON
  public.tests,public.questions,public.options,
  public.user_attempts,public.user_answers
TO authenticated;
GRANT SELECT ON public.teachers TO authenticated;

-- Seed historical column-level grants to prove a table-wide REVOKE alone
-- cannot hide private answer keys or protect grading fields.
GRANT SELECT(is_correct) ON public.options TO authenticated;
GRANT UPDATE(score,max_score,status) ON public.user_attempts TO authenticated;
GRANT UPDATE(is_correct,points_awarded) ON public.user_answers TO authenticated;

-- The following original CBT RLS migration is applied verbatim by CI,
-- after this fixture. It establishes the real historical policies to tighten.
