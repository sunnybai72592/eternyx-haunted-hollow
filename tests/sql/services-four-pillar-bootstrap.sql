-- Fixture ONLY for disposable, offline PostgreSQL 17.
-- Requires tests/sql/ctf-range-db-bootstrap.sql first.
-- This is deliberately NOT ETERNYX's production trusted-admin migration:
-- it creates one synthetic admin without any real administrator identities.
INSERT INTO auth.users(id)
VALUES ('33333333-3333-4333-8333-333333333333')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.admin_users(user_id)
VALUES ('33333333-3333-4333-8333-333333333333');

CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fixture$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.user_id = (SELECT auth.uid())
  );
$fixture$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon, service_role;
