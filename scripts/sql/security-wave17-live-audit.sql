-- Wave 17: project-pinned READ-ONLY verification of recorded migration SQL bytes.
-- This test intentionally allows auth test account fixtures to be missing.
-- No rows are written. Do not mistake migration record presence for HTTP JWT acceptance.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='10000ms';
WITH expected(name,version,hash) AS (
 VALUES
 ('pentest_engagement_management_staging_baseline','20261123215132','131411face266582e889f37e8e4a6821d78f3f46a33e6697d5f7427fbb65b77d'),
 ('pentest_evidence_and_audit_staging_baseline','20261123215141','369f2d92db82b39ac1b0732b742ce57dfe4528ec36413a4141a8e14bdc071a22'),
 ('security_case_indexed_ledger_staging_v1','20261123215211','5690769dd6f00819d304f6b18f25445d1179556760e88a96d898f1ce206424e2')
), expected_tables(name) AS (
 VALUES ('pentest_engagements'),('pentest_evidence'),('pentest_audit_events'),
        ('security_case_assets'),('security_case_findings'),
        ('security_case_finding_evidence'),('security_case_finding_history')
), checks(id,ok) AS (
 SELECT 'migration:'||e.name,
   EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations m
    WHERE m.name=e.name AND m.version=e.version
      AND cardinality(m.statements)=1
      AND encode(sha256(convert_to(m.statements[1],'UTF8')),'hex')=e.hash
   ) FROM expected e
 UNION ALL
 SELECT 'rls:'||e.name,
   EXISTS(
     SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=e.name
       AND c.relkind IN ('r','p') AND c.relrowsecurity
   ) FROM expected_tables e
 UNION ALL
 SELECT 'private-evidence-bucket',
  EXISTS (SELECT 1 FROM storage.buckets WHERE id='pentest-evidence'
    AND public=false AND file_size_limit=20971520)
 UNION ALL
 SELECT 'auth-two-user-fixtures',
  (SELECT count(*)>=2 FROM auth.users)
)
SELECT id, CASE WHEN ok THEN 'pass' ELSE 'blocked' END FROM checks ORDER BY id;
COMMIT;
