-- REVIEW CANDIDATE ONLY: staging-specific minimal trusted-admin foundation.
-- Outside supabase/migrations intentionally: never part of automatic db push.
-- Execute only after explicit staging-only approval and target/history checks.
-- Apply transactionally. Deliberately fail if either object already exists;
-- do not replace or repair another pillar's existing authorization foundation.
CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the reviewed shared is_admin() API contract. No caller-controlled
-- arguments, profile metadata, hardcoded identities, or default admin rows.
CREATE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
  );
$function$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
COMMENT ON TABLE public.admin_users IS
  'Trusted administrator assignments. No direct client access; independently approved staging assignments only.';
