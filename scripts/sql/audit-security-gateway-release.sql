-- Operator-only staging catalog snapshot; returns no private evidence or credentials.
BEGIN TRANSACTION READ ONLY;
WITH controls AS (
 SELECT c.oid,c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('security_evidence_gateway_budget','security_evidence_gateway_receipts','security_evidence_gateway_digests','security_evidence_gateway_global_budget')
), routines AS (
 SELECT p.oid,p.proname,p.prosecdef,p.proconfig
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('security_evidence_gateway_reserve','security_evidence_gateway_reserve_v2')
)
SELECT
 (SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL) confirmed_email_accounts,
 (SELECT count(*) FROM controls WHERE relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') AND has_table_privilege('service_role',oid,'SELECT')) protected_control_tables,
 (SELECT count(*) FROM routines WHERE NOT prosecdef AND NOT has_function_privilege('anon',oid,'EXECUTE') AND NOT has_function_privilege('authenticated',oid,'EXECUTE') AND has_function_privilege('service_role',oid,'EXECUTE')) service_only_reservation_rpcs,
 (SELECT count(*) FROM pg_policies WHERE policyname IN ('wave20_live_session','wave20_pentest_live_session') AND permissive='RESTRICTIVE' AND cmd='ALL') session_fences,
 (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wave22_mediated_evidence_only' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles @> ARRAY['anon','authenticated']::name[]) mediated_storage_fences,
 (SELECT count(*) FROM storage.buckets WHERE id='pentest-evidence' AND NOT public AND file_size_limit=20971520) private_evidence_buckets,
 (SELECT count(*) FROM public.pentest_evidence) evidence_records,
 (SELECT count(*) FROM public.pentest_evidence e WHERE NOT EXISTS(SELECT 1 FROM public.security_evidence_gateway_digests d WHERE d.storage_path=e.storage_path AND d.owner_id=e.owner_id AND d.byte_count=e.file_size)) unsealed_records;
COMMIT;
