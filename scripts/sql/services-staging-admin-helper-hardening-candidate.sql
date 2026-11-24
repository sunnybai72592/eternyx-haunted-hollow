-- REVIEW CANDIDATE ONLY: separate explicit staging approval required.
-- Execute transactionally, only after confirming private schema not exposed
-- by the live Data API, and reviewing all dependent cross-pillar objects.
-- Preserve public.is_admin() OID and signature; no DROP, seeds or table grants.
DO $guard$
DECLARE f record; t record;
BEGIN
 SELECT p.oid,p.proowner,p.prosecdef,p.provolatile,p.prorettype,p.proconfig,p.prosrc,l.lanname
 INTO f FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid=pg_catalog.to_regprocedure('public.is_admin()');
 SELECT c.relowner,c.relrowsecurity,c.relforcerowsecurity INTO t
 FROM pg_catalog.pg_class c WHERE c.oid=pg_catalog.to_regclass('public.admin_users');
 IF f.oid IS NULL OR t.relowner IS NULL OR f.proowner<>t.relowner
 OR f.proowner<>(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user)
 OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s'
 OR f.prorettype<>'boolean'::regtype OR f.lanname<>'sql'
 OR NOT COALESCE(f.proconfig IN (ARRAY['search_path='],ARRAY['search_path=""']),false)
 OR pg_catalog.regexp_replace(f.prosrc,'[[:space:]]+','','g') <>
    'SELECTEXISTS(SELECT1FROMpublic.admin_usersASauWHEREau.user_id=(SELECTauth.uid()));'
 OR t.relrowsecurity IS DISTINCT FROM true OR t.relforcerowsecurity IS DISTINCT FROM false
 OR pg_catalog.to_regnamespace('eternyx_admin_private') IS NOT NULL THEN
   RAISE EXCEPTION 'Phase48 expected seedless administrator foundation changed; review required';
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(role_name)
 CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) a(priv)
 WHERE pg_catalog.has_table_privilege(r.role_name,'public.admin_users',a.priv))
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(role_name)
 WHERE pg_catalog.has_any_column_privilege(r.role_name,'public.admin_users','SELECT,INSERT,UPDATE,REFERENCES')) THEN
   RAISE EXCEPTION 'Phase48 unsafe direct administrator table access';
 END IF;
END
$guard$;
CREATE SCHEMA eternyx_admin_private;
REVOKE ALL ON SCHEMA eternyx_admin_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA eternyx_admin_private TO anon, authenticated, service_role;
CREATE FUNCTION eternyx_admin_private.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
 SELECT EXISTS (
   SELECT 1 FROM public.admin_users AS au
   WHERE au.user_id = (SELECT auth.uid())
 );
$function$;
REVOKE ALL ON FUNCTION eternyx_admin_private.is_current_user_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION eternyx_admin_private.is_current_user_admin() TO anon, authenticated, service_role;
-- SQL standard body binds private helper by OID and records a dependency.
-- The wrapper is NOT elevated. Callers still receive only their own boolean.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
RETURN eternyx_admin_private.is_current_user_admin();
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
