-- Read only. Run on independently identified Eternyx Staging, not production.
-- Reports presence and effective privileges without selecting private rows.
WITH expected(name, authenticated_read) AS (VALUES
 ('docker_identity_workspaces',true),('docker_agent_registrations',true),
 ('docker_agent_enrollment_events',true),('docker_agent_reports',true),
 ('docker_agent_report_events',true),('docker_control_policies',true),
 ('docker_control_requests',true),('docker_control_events',true),
 ('docker_command_nonces',false),('docker_command_claims',true),
 ('docker_lab_incidents',true),('docker_lab_incident_events',true),
 ('docker_release_reviews',true),('docker_release_review_events',true),
 ('docker_release_reviewer_assignments',true)
), relations AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relkind
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
)
SELECT e.name, r.oid IS NOT NULL AS present,
 COALESCE(r.relkind IN ('r','p'),false) AS is_table,
 COALESCE(r.relrowsecurity,false) AS rls_enabled,
 e.authenticated_read AS expected_authenticated_select,
 COALESCE(has_table_privilege('authenticated',r.oid,'SELECT'),false) AS authenticated_select,
 COALESCE(has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) AS anonymous_any_access,
 COALESCE(has_table_privilege('authenticated',r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),false) AS authenticated_any_write
FROM expected e LEFT JOIN relations r ON r.relname=e.name ORDER BY e.name;

-- Effective RPC privileges, including inherited PUBLIC permissions.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
 p.proconfig AS settings
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'docker\_%' ESCAPE '\'
ORDER BY p.proname,args;

-- Inspect owner predicates separately; a present policy does not prove isolation.
SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_catalog.pg_policies
WHERE schemaname='public' AND tablename LIKE 'docker\_%' ESCAPE '\'
ORDER BY tablename,policyname;
