\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
\ir staged-security-evidence-controls.sql
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.security_evidence_gateway_reserve(uuid,uuid,bigint)','EXECUTE') OR
 has_function_privilege('anon','public.security_evidence_gateway_reserve(uuid,uuid,bigint)','EXECUTE') OR
 has_table_privilege('authenticated','public.security_evidence_gateway_digests','INSERT') OR
 has_table_privilege('authenticated','public.security_evidence_gateway_digests','SELECT') THEN
 RAISE EXCEPTION 'unexpected app privilege'; END IF;
END $$;
SET ROLE service_role;
DO $$
DECLARE o uuid := gen_random_uuid(); k uuid := gen_random_uuid(); i int;
BEGIN
 IF public.security_evidence_gateway_reserve(o,k,20971520)<>'reserved' THEN RAISE EXCEPTION 'first reserve'; END IF;
 IF public.security_evidence_gateway_reserve(o,k,20971520)<>'replay' THEN RAISE EXCEPTION 'replay'; END IF;
 FOR i IN 2..12 LOOP
 IF public.security_evidence_gateway_reserve(o,gen_random_uuid(),20971520)<>'reserved' THEN RAISE EXCEPTION 'expected daily budget'; END IF;
 END LOOP;
 IF public.security_evidence_gateway_reserve(o,gen_random_uuid(),20971520)<>'quota' THEN RAISE EXCEPTION 'daily byte cap'; END IF;
 IF (SELECT daily_requests FROM public.security_evidence_gateway_budget WHERE owner_id=o)<>12 THEN RAISE EXCEPTION 'replay charged'; END IF;
 IF (SELECT count(*) FROM public.security_evidence_gateway_receipts WHERE owner_id=o)<>12 THEN RAISE EXCEPTION 'denial persisted'; END IF;
 o:=gen_random_uuid();
 FOR i IN 1..20 LOOP
 IF public.security_evidence_gateway_reserve(o,gen_random_uuid(),1)<>'reserved' THEN RAISE EXCEPTION 'minute cap early'; END IF;
 END LOOP;
 IF public.security_evidence_gateway_reserve(o,gen_random_uuid(),1)<>'quota' THEN RAISE EXCEPTION 'minute cap bypass'; END IF;
 IF public.security_evidence_gateway_reserve(gen_random_uuid(),gen_random_uuid(),1)<>'reserved' THEN RAISE EXCEPTION 'owner isolation'; END IF;
END $$;
RESET ROLE;
SELECT 'Wave 23 quota and privilege rehearsal passed' AS result;
