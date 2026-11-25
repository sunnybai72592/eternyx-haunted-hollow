-- Disposable restored PostgreSQL only. Uses synthetic sessions, not Auth tokens.
\set ON_ERROR_STOP on
\ir staged-security-scanner-admission.sql
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.security_scanner_admit(uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.security_scanner_admit(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','cybersecurity_session_private.scanner_session_exists(uuid,uuid)','EXECUTE')
 OR has_table_privilege('authenticated','public.security_scanner_budget','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'scanner admission privilege escape'; END IF;
END $$;
-- Seed synthetic additional sessions for the global cap.
INSERT INTO auth.sessions(id,user_id) SELECT gen_random_uuid(),gen_random_uuid() FROM generate_series(1,5);
-- Test harness operates as postgres for the fixture discovery only.
DO $$
DECLARE a uuid:='20000000-0000-4000-8000-000000000001';
 b uuid:='20000000-0000-4000-8000-000000000002';
 sa uuid:='10000000-0000-4000-8000-000000000001';
 sb uuid:='10000000-0000-4000-8000-000000000002';
 se uuid:='10000000-0000-4000-8000-000000000003';
 owners uuid[]; sessions uuid[]; i int; j int;
BEGIN
 SELECT array_agg(user_id ORDER BY id),array_agg(id ORDER BY id) INTO owners,sessions FROM auth.sessions WHERE user_id NOT IN (a,b);
 SET LOCAL ROLE service_role;
 IF public.security_scanner_admit(a,sa)<>'revoked' OR public.security_scanner_admit(a,se)<>'revoked' OR public.security_scanner_admit(a,sb)<>'revoked' THEN RAISE EXCEPTION 'revocation or foreign session failure'; END IF;
 IF EXISTS(SELECT 1 FROM public.security_scanner_budget) THEN RAISE EXCEPTION 'revoked request charged'; END IF;
 FOR j IN 1..3 LOOP
  IF public.security_scanner_admit(b,sb)<>'admitted' THEN RAISE EXCEPTION 'owner cap early'; END IF;
 END LOOP;
 IF public.security_scanner_admit(b,sb)<>'quota' THEN RAISE EXCEPTION 'owner cap bypass'; END IF;
 FOR i IN 1..4 LOOP
  FOR j IN 1..3 LOOP
   IF public.security_scanner_admit(owners[i],sessions[i])<>'admitted' THEN RAISE EXCEPTION 'global cap early'; END IF;
  END LOOP;
 END LOOP;
 IF public.security_scanner_admit(owners[5],sessions[5])<>'quota' THEN RAISE EXCEPTION 'global cap bypass'; END IF;
 IF EXISTS(SELECT 1 FROM public.security_scanner_budget WHERE budget_key='owner:'||owners[5]::text) THEN RAISE EXCEPTION 'global rejection leaked owner charge'; END IF;
 IF (SELECT daily_requests FROM public.security_scanner_budget WHERE budget_key='global')<>15 THEN RAISE EXCEPTION 'global count mismatch'; END IF;
 -- Test owner/day and global/day independently using synthetic counters.
 UPDATE public.security_scanner_budget SET minute_requests=0,daily_requests=30 WHERE budget_key='owner:'||b::text;
 IF public.security_scanner_admit(b,sb)<>'quota' THEN RAISE EXCEPTION 'owner day cap bypass'; END IF;
 UPDATE public.security_scanner_budget SET minute_requests=0,daily_requests=300 WHERE budget_key='global';
 IF public.security_scanner_admit(owners[5],sessions[5])<>'quota' THEN RAISE EXCEPTION 'global day cap bypass'; END IF;
 RESET ROLE;
END $$;
SELECT 'Synthetic scanner admission checks passed' AS result;
