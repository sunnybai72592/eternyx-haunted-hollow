-- Staging-only verification of the verified CTF backend foundation.
-- Fixed, read-only pg_catalog queries; no user rows, flags, or secrets read.
-- Must run via the existing production-ref-denying verify-full TLS shell.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';

SELECT 'ctf_verified_solves_present=' ||
  (to_regclass('public.ctf_verified_solves') IS NOT NULL)::text;

SELECT 'ctf_verify_rate_present=' ||
  (to_regclass('public.ctf_verify_rate') IS NOT NULL)::text;

SELECT 'ctf_verified_solves_rls=' || EXISTS(
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
  WHERE n.nspname='public' AND c.relname='ctf_verified_solves'
    AND c.relkind='r' AND c.relrowsecurity
)::text;

SELECT 'ctf_verify_rate_rls=' || EXISTS(
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
  WHERE n.nspname='public' AND c.relname='ctf_verify_rate'
    AND c.relkind='r' AND c.relrowsecurity
)::text;

SELECT 'ctf_verification_rpc_present=' ||
  (to_regprocedure('public.ctf_claim_verification_attempt(uuid,text)')
    IS NOT NULL)::text;

-- SQL function is service_role-only: anonymous/authenticated users
-- cannot consume verification attempts or inject another owner identity.
SELECT 'ctf_rpc_service_only=' || (
  SELECT count(*)=1 AND
    coalesce(bool_and(
      pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('public',p.oid,'EXECUTE')
    ),false)
  FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('public.ctf_claim_verification_attempt(uuid,text)')
)::text;

-- Users may select only their own solves under RLS. No browser role may
-- award a solve, modify the rate-limit table, or call the privileged RPC.
SELECT 'ctf_solve_table_owner_select_only=' || (
  SELECT count(*)=1 AND
    coalesce(bool_and(
      pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
      AND NOT pg_catalog.has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies pol
        WHERE pol.schemaname='public'
          AND pol.tablename='ctf_verified_solves'
          AND pol.cmd='SELECT'
          AND pol.roles @> ARRAY['authenticated']::name[]
          AND pol.qual LIKE '%auth.uid()%'
      )
    ),false)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='ctf_verified_solves'
    AND c.relkind='r'
)::text;
COMMIT;
