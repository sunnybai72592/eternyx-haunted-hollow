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
SELECT 'table_status=' || names.name || ':' ||
  COALESCE(c.relrowsecurity::text,'false') || ':' ||
  COALESCE(has_table_privilege('anon',c.oid,'SELECT')::text,'false')
FROM (VALUES ('workspace_projects'),('workspace_tasks'),('workspace_items'),('workspace_activity'),('workspace_task_steps'),('workspace_import_sessions'),('workspace_reconciliation_receipts'),('workspace_team_spaces'),('workspace_team_members'),('workspace_team_invites'),('workspace_team_tasks'),('workspace_team_events'),('workspace_team_task_comments'),('workspace_team_task_steps'),('workspace_team_read_cursors')) AS names(name)
LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
  AND c.relname=names.name AND c.relkind IN ('r','p')
ORDER BY names.name;
SELECT 'function_status=' || names.name || ':' ||
  EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=names.name)::text
FROM (VALUES ('workspace_team_role'),('workspace_team_create'),('workspace_team_invite'),('workspace_team_accept_invite'),('workspace_team_revoke_invite'),('workspace_team_member_change'),('workspace_team_leave'),('workspace_team_set_status'),('workspace_team_save_task'),('workspace_team_delete_task'),('workspace_team_post_comment'),('workspace_team_redact_comment'),('workspace_team_add_step'),('workspace_team_check_step'),('workspace_team_remove_step'),('workspace_team_mark_events_seen'),('workspace_team_notification_snapshot')) AS names(name)
ORDER BY names.name;
COMMIT;
