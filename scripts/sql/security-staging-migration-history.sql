-- Wave 15: strictly read-only migration history and indexed-case table observation.
-- PostgreSQL schema migration history is source metadata, not proof of matched SQL bytes.
-- Use only on a pinned, verified isolated staging connection or networkless PostgreSQL CI.
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10000ms';
SET LOCAL lock_timeout = '3000ms';
SELECT 'history-engagement|' || CASE WHEN EXISTS (
 SELECT 1 FROM supabase_migrations.schema_migrations
 WHERE version = '20261111210000'
) THEN 'present' ELSE 'missing' END;
SELECT 'history-evidence|' || CASE WHEN EXISTS (
 SELECT 1 FROM supabase_migrations.schema_migrations
 WHERE version = '20261111220000'
) THEN 'present' ELSE 'missing' END;
SELECT 'table-engagement|' || CASE WHEN to_regclass('public.pentest_engagements') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
SELECT 'table-evidence|' || CASE WHEN to_regclass('public.pentest_evidence') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
SELECT 'table-ledger-assets|' || CASE WHEN to_regclass('public.security_case_assets') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
SELECT 'table-ledger-findings|' || CASE WHEN to_regclass('public.security_case_findings') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
SELECT 'table-ledger-evidence|' || CASE WHEN to_regclass('public.security_case_finding_evidence') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
SELECT 'table-ledger-history|' || CASE WHEN to_regclass('public.security_case_finding_history') IS NOT NULL
 THEN 'present' ELSE 'missing' END;
COMMIT;
