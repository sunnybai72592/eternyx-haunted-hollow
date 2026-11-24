-- Final composed-schema checks; no data mutations, no remote deployment claims.
DO $$
DECLARE
  tbl text;
  sig text;
  target oid;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ctf_verified_solves','ctf_verify_rate','ctf_range_provider','ctf_range_sessions',
    'ctf_range_access_grants','ctf_range_worker_lease','ctf_hosted_spend_policy',
    'ctf_hosted_spend_reservations'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=tbl AND c.relrowsecurity)
      THEN RAISE EXCEPTION 'Missing RLS relation %',tbl; END IF;
    IF has_table_privilege('anon','public.'||tbl,'SELECT,INSERT,UPDATE,DELETE')
      THEN RAISE EXCEPTION 'Anonymous table access %',tbl; END IF;
    IF has_table_privilege('authenticated','public.'||tbl,'INSERT,UPDATE,DELETE')
      THEN RAISE EXCEPTION 'Browser mutation grant %',tbl; END IF;
    IF tbl NOT IN ('ctf_verified_solves','ctf_range_sessions')
      AND has_table_privilege('authenticated','public.'||tbl,'SELECT')
      THEN RAISE EXCEPTION 'Private control table exposed %',tbl; END IF;
  END LOOP;
  FOREACH sig IN ARRAY ARRAY[
    'ctf_claim_verification_attempt(uuid,text)',
    'ctf_range_request_session(uuid,text)','ctf_range_stop_session(uuid,uuid)',
    'ctf_range_issue_access_grant(uuid,uuid,text)','ctf_range_check_access_grant(uuid,uuid,text)',
    'ctf_range_worker_acquire(text,uuid)','ctf_range_worker_inventory(text,uuid)',
    'ctf_range_worker_claim(text,uuid)','ctf_range_worker_report(text,uuid,uuid,text,text)',
    'ctf_range_worker_release(text,uuid)',
    'ctf_hosted_reserve_quote(text,uuid,uuid,text,text,bigint,timestamptz)'
  ] LOOP
    target:=to_regprocedure('public.'||sig);
    IF target IS NULL OR
       has_function_privilege('anon',target,'EXECUTE') OR
       has_function_privilege('authenticated',target,'EXECUTE') OR
       NOT has_function_privilege('service_role',target,'EXECUTE') OR
       EXISTS (SELECT 1 FROM pg_proc WHERE oid=target AND prosecdef)
       THEN RAISE EXCEPTION 'Unsafe or missing composed RPC %',sig; END IF;
  END LOOP;
  FOREACH sig IN ARRAY ARRAY['ctf_range_claim_queued_session()','ctf_range_report_session(uuid,text,text)']
  LOOP
    target:=to_regprocedure('public.'||sig);
    IF target IS NULL OR has_function_privilege('anon',target,'EXECUTE') OR
      has_function_privilege('authenticated',target,'EXECUTE') OR
      has_function_privilege('service_role',target,'EXECUTE')
      THEN RAISE EXCEPTION 'Legacy unfenced RPC callable %',sig; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.ctf_range_provider WHERE singleton_id=1
      AND enabled=false AND ingress_approved=false AND max_active_sessions=0
      AND max_starts_per_24h=0 AND max_reserved_minutes_per_24h=0)
    THEN RAISE EXCEPTION 'Provider no longer default-off'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ctf_hosted_spend_policy WHERE singleton_id=1
      AND enabled=false AND max_single_session_micro_usd=0
      AND max_24h_micro_usd=0 AND max_reservations_per_24h=0)
    THEN RAISE EXCEPTION 'Spend no longer default-off'; END IF;
  IF EXISTS (SELECT 1 FROM public.ctf_range_sessions)
    OR EXISTS (SELECT 1 FROM public.ctf_range_access_grants)
    OR EXISTS (SELECT 1 FROM public.ctf_hosted_spend_reservations)
    OR EXISTS (SELECT 1 FROM public.ctf_verified_solves)
    OR EXISTS (SELECT 1 FROM public.ctf_verify_rate)
    THEN RAISE EXCEPTION 'Synthetic fixture rollback failed'; END IF;
END;
$$;
-- Observe, do not conceal: baseline grants currently expose internal columns to
-- the row owner via Data API. This is a deployment blocker, not an offline test failure.
SELECT CASE WHEN has_column_privilege('authenticated','public.ctf_range_sessions',
 'provider_instance_ref','SELECT') OR
 has_column_privilege('authenticated','public.ctf_range_sessions','worker_fence_id','SELECT')
 THEN 'BLOCKED: internal session column visibility requires remediation before live rollout'
 ELSE 'Internal session column read grants absent' END AS deployment_gate;
SELECT 'composed LABS schemas, RPC privileges, default-off budgets and fixture rollback verified' AS result;
