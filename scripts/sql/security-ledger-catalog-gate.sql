-- Cybersecurity Wave 11: READ-ONLY PostgreSQL catalog / private bucket acceptance.
-- Intended for isolated staging AFTER an authorized migration, or offline disposable PG.
-- Emits 55+ deterministic "check-id|pass/fail" rows. Never changes data.
-- Use psql -X -v ON_ERROR_STOP=1 -At -F '|' -f scripts/sql/security-ledger-catalog-gate.sql
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
WITH
required(name) AS (
 VALUES ('pentest_engagements'), ('pentest_evidence'), ('pentest_audit_events'),
 ('security_case_assets'), ('security_case_findings'),
 ('security_case_finding_evidence'), ('security_case_finding_history')
),
relations AS (
 SELECT r.name, c.oid, coalesce(c.relrowsecurity,false) AS rls,
   coalesce(has_table_privilege('anon', c.oid, 'SELECT'),false) AS anon_select,
   coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) AS user_select,
   coalesce(has_table_privilege('authenticated',c.oid,'DELETE'),false) AS user_delete
 FROM required r
 LEFT JOIN pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.name AND c.relkind IN ('r','p')
),
case_tables(name) AS (
 VALUES ('security_case_assets'),('security_case_findings'),
 ('security_case_finding_evidence'),('security_case_finding_history')
),
policy_tables(name) AS (SELECT name FROM required),
triggers(name, rel) AS (
 VALUES
 ('security_case_guard_asset_scope_trg','security_case_assets'),
 ('security_case_guard_finding_scope_trg','security_case_findings'),
 ('security_case_record_finding_history_trg','security_case_findings'),
 ('security_case_record_evidence_link_trg','security_case_finding_evidence')
),
fkeys(name, rel) AS (
 VALUES
 ('security_case_assets_parent_fk','security_case_assets'),
 ('security_case_findings_asset_fk','security_case_findings'),
 ('security_case_finding_evidence_finding_fk','security_case_finding_evidence'),
 ('security_case_finding_evidence_private_object_fk','security_case_finding_evidence'),
 ('security_case_finding_history_finding_fk','security_case_finding_history')
),
functions(name) AS (
 VALUES ('security_case_guard_asset_scope'),('security_case_guard_finding_scope'),
 ('security_case_record_finding_history'),('security_case_record_evidence_link')
),
checks(id,ok) AS (
 SELECT 'table:'||name, oid IS NOT NULL FROM relations
 UNION ALL SELECT 'rls:'||name, rls FROM relations
 UNION ALL SELECT 'anon-deny-select:'||name, NOT anon_select FROM relations
 UNION ALL SELECT 'authenticated-can-read:'||name, user_select FROM relations
 UNION ALL SELECT 'ledger-deny-delete:'||r.name, NOT r.user_delete FROM relations r
   JOIN case_tables t ON t.name=r.name
 UNION ALL
 SELECT 'owner-read-policy:'||t.name,
   EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
     AND p.cmd='SELECT' AND 'authenticated'=ANY(p.roles)
     AND p.qual LIKE '%auth.uid()%')
 FROM policy_tables t
 UNION ALL
 SELECT 'ledger-write-owner-policy:'||t.name,
   EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
     AND p.cmd='INSERT' AND 'authenticated'=ANY(p.roles)
     AND p.with_check LIKE '%auth.uid()%')
 FROM case_tables t WHERE t.name<>'security_case_finding_history'
 UNION ALL
 SELECT 'ledger-update-owner-policy:'||t.name,
   EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t.name
     AND p.cmd='UPDATE' AND 'authenticated'=ANY(p.roles)
     AND p.qual LIKE '%auth.uid()%' AND p.with_check LIKE '%auth.uid()%')
 FROM case_tables t WHERE t.name IN ('security_case_assets','security_case_findings')
 UNION ALL
 SELECT 'trigger:'||t.name, EXISTS(
   SELECT 1 FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=t.rel AND tr.tgname=t.name
     AND tr.tgenabled IN ('O','A') AND NOT tr.tgisinternal)
 FROM triggers t
 UNION ALL
 SELECT 'composite-fk:'||f.name, EXISTS(
   SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=f.rel AND co.conname=f.name
     AND co.contype='f' AND co.convalidated
     AND array_length(co.conkey,1)>=2)
 FROM fkeys f
 UNION ALL
 SELECT 'function-execute-denied:'||f.name,
   p.oid IS NOT NULL AND
   NOT coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false)
   AND NOT coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false)
 FROM functions f
 LEFT JOIN pg_namespace ns ON ns.nspname='public'
 LEFT JOIN pg_proc p ON p.pronamespace=ns.oid AND p.proname=f.name
 UNION ALL
 SELECT 'private-evidence-bucket', EXISTS(
  SELECT 1 FROM storage.buckets WHERE id='pentest-evidence' AND public=false
    AND file_size_limit=20971520)
 UNION ALL
 SELECT 'private-storage-rls', EXISTS(
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity)
 UNION ALL
 SELECT 'history-append-only', EXISTS(
  SELECT 1 FROM relations WHERE name='security_case_finding_history' AND user_select AND NOT user_delete)
  AND NOT coalesce(has_table_privilege('authenticated','public.security_case_finding_history','INSERT'),false)
  AND NOT coalesce(has_table_privilege('authenticated','public.security_case_finding_history','UPDATE'),false)
)
SELECT id, CASE WHEN ok THEN 'pass' ELSE 'fail' END
FROM checks ORDER BY id;
COMMIT;
