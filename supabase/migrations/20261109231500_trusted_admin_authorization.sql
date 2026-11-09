-- Establish a trusted administrator authority separate from teacher/student roles.
-- Only the two explicitly authorized Auth user IDs are seeded as administrators.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- No client role may read or mutate administrator assignments directly.
REVOKE ALL ON TABLE public.admin_users FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.admin_users (user_id)
VALUES
  ('704936db-cc9c-427b-b760-1c7c9b97618a'::uuid),
  ('dea20c03-ac93-46f0-9a17-f484f0f966f5'::uuid)
ON CONFLICT (user_id) DO NOTHING;

-- Administrator checks must use the protected assignment table, never profiles.role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users AS au
    WHERE au.user_id = (SELECT auth.uid())
  );
$function$;

-- Preserve the legacy role API used by existing RLS policies, but source admin
-- status from admin_users. Teacher/student roles remain in public.user_roles.
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN public.is_admin() THEN 'admin'
    ELSE COALESCE(
      (
        SELECT p.role
        FROM public.profiles AS p
        WHERE p.user_id = (SELECT auth.uid())
        LIMIT 1
      ),
      'user'
    )
  END;
$function$;

-- These functions are intentionally callable by client roles because existing
-- RLS policies invoke them. Their SECURITY DEFINER implementations expose only
-- the current caller's boolean/role, not the administrator list.
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO anon, authenticated, service_role;

-- profiles.role is a legacy display field, not an authorization source.
-- Force new profiles to the ordinary role and prevent client updates from
-- changing an existing role. Trusted administrator status lives in admin_users.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.role := 'user';
  ELSE
    NEW.role := OLD.role;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_prevent_role_escalation ON public.profiles;

CREATE TRIGGER profiles_prevent_role_escalation
BEFORE INSERT OR UPDATE OF role
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_escalation();

COMMENT ON TABLE public.admin_users IS
  'Trusted administrator assignments. Direct client access is revoked; manage through reviewed migrations.';
COMMENT ON COLUMN public.profiles.role IS
  'Legacy profile role only. Administrator authorization is determined by public.admin_users.';
