-- Operator-only read-only inspection. Run against Eternyx Staging only.
-- No identity, SQL source text, payloads, signing keys, or ciphertext returned.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
WITH tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND left(c.relname,11)='automation_'
), funcs AS (
 SELECT p.oid,p.proname,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND left(p.proname,11)='automation_'
) SELECT jsonb_build_object(
 'schema','eternyx-automation-operator-snapshot-v1',
 'observedAt',statement_timestamp(),
 'tables',(SELECT count(*) FROM tables),
 'rlsTables',(SELECT count(*) FROM tables WHERE relrowsecurity),
 'unsafeTableGrants',(SELECT count(*) FROM tables WHERE has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE')),
 'rpcs',(SELECT count(*) FROM funcs),
 'unsafeRpcs',(SELECT count(*) FROM funcs WHERE prosecdef OR has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE') OR NOT has_function_privilege('service_role',oid,'EXECUTE')),
 'schedulerEnabled',(SELECT enabled FROM public.automation_scheduler_config WHERE singleton_id=1),
 'workflows',(SELECT count(*) FROM public.automation_workflows),
 'runs',(SELECT count(*) FROM public.automation_runs),
 'enabledSchedules',(SELECT count(*) FROM public.automation_schedules WHERE enabled),
 'expiredLeases',(SELECT count(*) FROM public.automation_schedules WHERE lease_token IS NOT NULL AND lease_expires_at<=statement_timestamp()),
 'activeLeases',(SELECT count(*) FROM public.automation_schedules WHERE lease_token IS NOT NULL AND lease_expires_at>statement_timestamp()),
 'failedSchedules',(SELECT count(*) FROM public.automation_schedules WHERE last_status='failed'),
 'enabledWebhooks',(SELECT count(*) FROM public.automation_webhook_triggers WHERE enabled),
 'staleApprovals',(SELECT count(*) FROM public.automation_approval_requests WHERE status='pending' AND expires_at<=statement_timestamp()),
 'stuckProviderCalls',(SELECT count(*) FROM public.automation_provider_calls WHERE state='reserved' AND created_at<statement_timestamp()-interval '5 minutes'),
 'failedProviderCalls24h',(SELECT count(*) FROM public.automation_provider_calls WHERE state='failed' AND created_at>statement_timestamp()-interval '24 hours'),
 'providerCalls',(SELECT count(*) FROM public.automation_provider_calls),
 'confirmedAccounts',(SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL AND NOT is_anonymous),
 'journal',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'version',version,'statementCount',cardinality(statements),
 'gitBlobSha',encode(extensions.digest(convert_to('blob '||octet_length(statements[1])::text,'UTF8')||decode('00','hex')||convert_to(statements[1],'UTF8'),'sha1'),'hex')) ORDER BY version),'[]'::jsonb)
 FROM supabase_migrations.schema_migrations WHERE name ~ '^[0-9]{14}_automation_')
 ) AS snapshot;
COMMIT;
