-- Read-only catalog audit AFTER applying the reviewed staged ledger migration.
-- Use staging with a non-privileged account to separately verify RLS behavior.
WITH required(name) AS (
  VALUES ('security_case_assets'::text), ('security_case_findings'),
         ('security_case_finding_evidence'), ('security_case_finding_history')
)
SELECT r.name,
       c.oid IS NOT NULL AS table_exists,
       COALESCE(c.relrowsecurity, false) AS rls_enabled,
       COALESCE(c.relforcerowsecurity, false) AS force_rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_can_delete
FROM required r
LEFT JOIN pg_namespace ns ON ns.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = ns.oid AND c.relname = r.name AND c.relkind IN ('r','p')
ORDER BY r.name;

SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname='public'
  AND tablename IN (
    'security_case_assets','security_case_findings',
    'security_case_finding_evidence','security_case_finding_history')
ORDER BY tablename, cmd;
