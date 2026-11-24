-- Read-only catalog snapshot; no user rows, secrets or schema changes.
-- Run separately before and after an independently authorized staging rollout.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '2s';
WITH protected AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN (
 'pentest_audit_events','pentest_engagements','pentest_evidence','security_case_assets',
 'security_case_finding_evidence','security_case_finding_history','security_case_findings')
), fingerprints AS (
 SELECT p.relname AS name,p.relrowsecurity AS rls,
 pg_catalog.md5(jsonb_build_object(
 'rls',p.relrowsecurity,'force_rls',p.relforcerowsecurity,'acl',p.acl,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid=p.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_catalog.pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_catalog.pg_constraint WHERE conrelid=p.oid),
 'indexes',(SELECT jsonb_agg(pg_catalog.pg_get_indexdef(indexrelid) ORDER BY indexrelid::regclass::text) FROM pg_catalog.pg_index WHERE indrelid=p.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check) ORDER BY policyname) FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename=p.relname),
 'triggers',(SELECT jsonb_agg(pg_catalog.pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_catalog.pg_trigger WHERE tgrelid=p.oid AND NOT tgisinternal)
 )::text) AS catalog_fingerprint
 FROM protected p
)
SELECT jsonb_build_object(
 'schema','eternyx-occupied-stage-catalog-v1',
 'postgres_major',current_setting('server_version_num')::integer/10000,
 'tables',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.name) FROM fingerprints f),'[]'::jsonb),
 'automation_ctf_tables',(SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname ~ '^(automation_|ctf_)'),
 'automation_ctf_rpcs',(SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname ~ '^(automation_|ctf_)')
 ) AS catalog;
COMMIT;
