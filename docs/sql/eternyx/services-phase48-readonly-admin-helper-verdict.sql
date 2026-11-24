-- Metadata only, safe on either pre-hardening or post-hardening staging.
-- No helper execution, row data, account IDs, or mutation.
WITH
t AS (SELECT c.* FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.admin_users')),
w AS (SELECT p.* FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.is_admin()')),
h AS (SELECT p.* FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('eternyx_admin_private.is_current_user_admin()')),
n AS (SELECT * FROM pg_catalog.pg_namespace WHERE nspname='eternyx_admin_private'),
r AS (SELECT unnest(ARRAY['anon','authenticated','service_role']) AS role_name),
facts AS (
SELECT
 COALESCE((SELECT relrowsecurity AND NOT relforcerowsecurity FROM t),false) AS administrator_table_rls,
 COALESCE((SELECT NOT EXISTS(SELECT 1 FROM r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) a(priv) WHERE has_table_privilege(r.role_name,t.oid,a.priv))
 AND NOT EXISTS(SELECT 1 FROM r WHERE has_any_column_privilege(r.role_name,t.oid,'SELECT,INSERT,UPDATE,REFERENCES')) FROM t),false) AS direct_table_access_denied,
 COALESCE((SELECT NOT prosecdef AND provolatile='s' AND prorettype='boolean'::regtype AND proconfig IN (ARRAY['search_path='],ARRAY['search_path=""']) AND prosqlbody IS NOT NULL FROM w),false) AS public_wrapper_invoker,
 COALESCE((SELECT prosecdef AND provolatile='s' AND prorettype='boolean'::regtype AND proconfig IN (ARRAY['search_path='],ARRAY['search_path=""']) AND regexp_replace(prosrc,'[[:space:]]+','','g')='SELECTEXISTS(SELECT1FROMpublic.admin_usersASauWHEREau.user_id=(SELECTauth.uid()));' FROM h),false) AS private_definer_exact_body,
 COALESCE((SELECT w.proowner=t.relowner AND h.proowner=t.relowner FROM t,w,h),false) AS owner_consistent,
 COALESCE((SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.objid=w.oid AND d.refclassid='pg_catalog.pg_proc'::regclass AND d.refobjid=h.oid) AND pg_catalog.regexp_replace(pg_catalog.pg_get_functiondef(w.oid),'[[:space:]]+','','g') ~ 'RETURNeternyx_admin_private[.]is_current_user_admin[(][)];?$' FROM w,h),false) AS wrapper_bound_to_helper,
 COALESCE((SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(w.proacl,acldefault('f',w.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(h.proacl,acldefault('f',h.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') FROM w,h),false) AS implicit_public_execute_denied,
 COALESCE((SELECT NOT EXISTS(SELECT 1 FROM r WHERE NOT has_function_privilege(r.role_name,w.oid,'EXECUTE') OR NOT has_function_privilege(r.role_name,h.oid,'EXECUTE') OR NOT has_schema_privilege(r.role_name,n.oid,'USAGE') OR has_schema_privilege(r.role_name,n.oid,'CREATE')) FROM w,h,n),false) AS compatibility_grants_without_create,
 COALESCE((SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a WHERE a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')) FROM n),false) AS private_schema_public_denied,
 COALESCE((SELECT NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.pronamespace=n.oid AND p.oid<>h.oid) FROM n,h),false) AS private_schema_only_reviewed_helper
)
SELECT row_to_json(facts)::text FROM facts;
