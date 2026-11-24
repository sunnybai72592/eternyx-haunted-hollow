-- Disposable PostgreSQL after test-security-evidence-controls.sql has initialized roles and tables.
\set ON_ERROR_STOP on
\ir staged-security-evidence-global-budget.sql
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint)','EXECUTE') OR
 has_function_privilege('anon','public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint)','EXECUTE') OR
 has_table_privilege('authenticated','public.security_evidence_gateway_global_budget','SELECT') THEN
 RAISE EXCEPTION 'unexpected app privilege'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE o uuid; k uuid; i integer; n bigint;
BEGIN
 -- Each unique owner reserves one byte; global minute cap is shared.
 FOR i IN 1..60 LOOP
 IF public.security_evidence_gateway_reserve_v2(gen_random_uuid(),gen_random_uuid(),1)<>'reserved' THEN RAISE EXCEPTION 'global cap early'; END IF;
 END LOOP;
 o:=gen_random_uuid(); k:=gen_random_uuid();
 IF public.security_evidence_gateway_reserve_v2(o,k,1)<>'quota' THEN RAISE EXCEPTION 'global cap bypass'; END IF;
 IF EXISTS(SELECT 1 FROM public.security_evidence_gateway_budget WHERE owner_id=o) OR EXISTS(SELECT 1 FROM public.security_evidence_gateway_receipts WHERE owner_id=o) THEN RAISE EXCEPTION 'global denial left owner charge or receipt'; END IF;
 -- Reset synthetic global row only; test daily byte cap in same statement.
 UPDATE public.security_evidence_gateway_global_budget SET minute_requests=0,daily_bytes=1073741823;
 IF public.security_evidence_gateway_reserve_v2(o,k,1)<>'reserved' THEN RAISE EXCEPTION 'daily boundary'; END IF;
 IF public.security_evidence_gateway_reserve_v2(o,k,1)<>'replay' THEN RAISE EXCEPTION 'replay boundary'; END IF;
 IF public.security_evidence_gateway_reserve_v2(o,gen_random_uuid(),1)<>'quota' THEN RAISE EXCEPTION 'daily cap bypass'; END IF;
 SELECT daily_bytes INTO n FROM public.security_evidence_gateway_budget WHERE owner_id=o;
 IF n<>1 THEN RAISE EXCEPTION 'denial incorrectly charged'; END IF;
END $$;
RESET ROLE;
SELECT 'Wave 24 shared quota rehearsal passed' AS result;
