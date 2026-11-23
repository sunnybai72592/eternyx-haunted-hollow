-- Synthetic Supabase role/schema bootstrap ONLY for a brand-new
-- disposable PG17 instance on Docker --network none.
-- NOT a migration, not a Supabase emulator, not real Auth/RLS acceptance.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id));
CREATE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE SET search_path = ''
  AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
CREATE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $$ SELECT EXISTS (
      SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
    ); $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Database and roles above are deliberately synthetic. No production
-- credentials, network endpoints, client records, billing or fixtures.