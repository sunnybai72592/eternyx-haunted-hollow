-- Phase 28: metadata only; NEVER run on production or without staging consent.
-- The shell wrapper separately enforces isolated ref, pinned CA and TLS verify-full.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
SELECT 'connection_ok=' || (current_database()='postgres')::text;
SELECT 'transaction_read_only=' || (current_setting('transaction_read_only')='on')::text;
SELECT 'migration_history_present=' ||
  (to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)::text;
-- An absent history table will fail rather than fabricate zero applied versions.
SELECT 'applied_version=' || version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261123050000','20261123180000','20261124010000','20261124030000','20261124050000','20261124070000','20261124090000','20261124110000','20261124130000','20261124150000','20261124170000','20261124190000','20261124210000','20261124230000')
ORDER BY version;
-- This reports only catalog metadata. No table rows or secrets are selected.
-- Every Workspace table must have RLS, at least one policy, and no direct
-- anonymous SELECT, INSERT, UPDATE or DELETE privilege.
SELECT 'table_status=' || x.name || ':' ||
 COALESCE(c.relrowsecurity::text,'false') || ':' ||
 COALESCE(has_table_privilege('anon',c.oid,
   'SELECT,INSERT,UPDATE,DELETE')::text,'false') || ':' ||
 COALESCE(EXISTS(SELECT 1 FROM pg_catalog.pg_policy pol
   WHERE pol.polrelid=c.oid)::text,'false')
FROM (VALUES ('workspace_projects'),('workspace_tasks'),('workspace_items'),('workspace_activity'),('workspace_task_steps'),('workspace_import_sessions'),('workspace_import_batches'),('workspace_import_files'),('workspace_item_revisions'),('workspace_reconciliation_receipts'),('workspace_team_spaces'),('workspace_team_members'),('workspace_team_invites'),('workspace_team_tasks'),('workspace_team_events'),('workspace_team_task_comments'),('workspace_team_task_steps'),('workspace_team_read_cursors')) AS x(name)
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
 AND c.relname=x.name AND c.relkind IN ('r','p')
ORDER BY x.name;
-- This audit validates exact reviewed RPC signatures, SECURITY DEFINER,
-- pinned empty search_path, authenticated execute, no anon execute, and
-- no unintended overloads. No function bodies or user rows are read.
WITH expected(name,signature) AS (VALUES ('workspace_team_role','public.workspace_team_role(uuid)'),('workspace_team_create','public.workspace_team_create(text,text)'),('workspace_team_invite','public.workspace_team_invite(uuid,text)'),('workspace_team_accept_invite','public.workspace_team_accept_invite(text)'),('workspace_team_revoke_invite','public.workspace_team_revoke_invite(uuid)'),('workspace_team_member_change','public.workspace_team_member_change(uuid,uuid,text)'),('workspace_team_leave','public.workspace_team_leave(uuid)'),('workspace_team_set_status','public.workspace_team_set_status(uuid,text)'),('workspace_team_save_task','public.workspace_team_save_task(uuid,uuid,text,text,text,text,date,uuid,timestamptz)'),('workspace_team_delete_task','public.workspace_team_delete_task(uuid,uuid)'),('workspace_team_post_comment','public.workspace_team_post_comment(uuid,uuid,text)'),('workspace_team_redact_comment','public.workspace_team_redact_comment(uuid,uuid)'),('workspace_team_add_step','public.workspace_team_add_step(uuid,uuid,text)'),('workspace_team_check_step','public.workspace_team_check_step(uuid,uuid,boolean,timestamptz)'),('workspace_team_remove_step','public.workspace_team_remove_step(uuid,uuid)'),('workspace_team_mark_events_seen','public.workspace_team_mark_events_seen(uuid,bigint)'),('workspace_team_notification_snapshot','public.workspace_team_notification_snapshot(uuid)'))
SELECT 'function_status=' || e.name || ':' ||
 (p.oid IS NOT NULL)::text || ':' ||
 COALESCE(p.prosecdef::text,'false') || ':' ||
 COALESCE(('search_path='=ANY(p.proconfig))::text,'false') || ':' ||
 COALESCE(has_function_privilege('authenticated',p.oid,'EXECUTE')::text,'false') || ':' ||
 COALESCE(has_function_privilege('anon',p.oid,'EXECUTE')::text,'false') || ':' ||
 (SELECT COUNT(*) FROM pg_catalog.pg_proc pf
   JOIN pg_catalog.pg_namespace ns ON ns.oid=pf.pronamespace
   WHERE ns.nspname='public' AND pf.proname=e.name)::text
FROM expected e
LEFT JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(e.signature)
ORDER BY e.name;
COMMIT;
