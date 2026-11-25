-- Execute only in an isolated restored PostgreSQL database.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE policyname IN ('wave20_live_session','wave20_pentest_live_session','wave22_mediated_evidence_only') AND permissive='RESTRICTIVE')<>9 THEN RAISE EXCEPTION 'restore lost policy'; END IF;
 IF (SELECT count(*) FROM public.security_evidence_gateway_receipts)<>1 THEN RAISE EXCEPTION 'restore lost receipt'; END IF;
 IF (SELECT count(*) FROM public.security_evidence_gateway_digests WHERE byte_count=3 AND sha256='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')<>1 THEN RAISE EXCEPTION 'restore lost digest'; END IF;
 IF (SELECT count(*) FROM public.security_evidence_gateway_global_budget WHERE daily_bytes=3 AND daily_requests=1)<>1 THEN RAISE EXCEPTION 'restore lost global budget'; END IF;
 IF (SELECT count(*) FROM public.security_evidence_gateway_budget WHERE daily_bytes=3 AND daily_requests=1)<>1 THEN RAISE EXCEPTION 'restore lost owner budget'; END IF;
 IF has_table_privilege('authenticated','public.security_evidence_gateway_digests','SELECT,INSERT,UPDATE,DELETE') OR has_function_privilege('authenticated','public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint)','EXECUTE') OR has_function_privilege('anon','public.security_evidence_gateway_reserve_v2(uuid,uuid,bigint)','EXECUTE') THEN RAISE EXCEPTION 'restore exposed private controls'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","session_id":"10000000-0000-4000-8000-000000000001"}',false);
DO $$ BEGIN
 IF cybersecurity_session_private.has_live_session() OR (SELECT count(*) FROM public.pentest_engagements)<>0 THEN RAISE EXCEPTION 'revoked session resurrected'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000002","session_id":"10000000-0000-4000-8000-000000000002"}',false);
DO $$ BEGIN
 IF NOT cybersecurity_session_private.has_live_session() OR (SELECT count(*) FROM public.pentest_engagements)<>1 THEN RAISE EXCEPTION 'active owner broken'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='pentest-evidence')<>0 OR (SELECT count(*) FROM storage.objects WHERE bucket_id='unrelated')<>1 THEN RAISE EXCEPTION 'restored cutover scope incorrect'; END IF;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 IF public.security_evidence_gateway_reserve_v2('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',3)<>'replay' THEN RAISE EXCEPTION 'restore allowed replay'; END IF;
 IF (SELECT daily_requests FROM public.security_evidence_gateway_global_budget)<>1 THEN RAISE EXCEPTION 'replay charged global budget'; END IF;
END $$;
RESET ROLE;
SELECT 'Synthetic restored database security verification passed' AS result;
