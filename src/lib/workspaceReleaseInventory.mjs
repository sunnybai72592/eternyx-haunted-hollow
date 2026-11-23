// Offline audit of repository source presence and CI wiring. This cannot
// establish live Supabase migration state or actual production RLS behavior.
export const WORKSPACE_MIGRATION_PATHS = Object.freeze([
  "supabase/migrations/20261123050000_workspace_owner_projects_tasks_items.sql",
  "supabase/migrations/20261123180000_workspace_revision_history_and_archive_guards.sql",
  "supabase/migrations/20261124010000_workspace_owner_quotas_and_pinned.sql",
  "supabase/migrations/20261124030000_workspace_task_priorities_and_safe_purge.sql",
  "supabase/migrations/20261124050000_workspace_task_details_checklists.sql",
  "supabase/migrations/20261124070000_workspace_checklist_restore_batches.sql",
  "supabase/migrations/20261124090000_workspace_import_sessions.sql",
  "supabase/migrations/20261124110000_workspace_import_recovery_review_and_discard.sql",
  "supabase/migrations/20261124130000_workspace_import_protection_and_integrity.sql",
  "supabase/migrations/20261124150000_workspace_reconciliation_receipts.sql",
  "supabase/migrations/20261124170000_workspace_team_spaces.sql",
  "supabase/migrations/20261124190000_workspace_team_discussions_checklists.sql",
  "supabase/migrations/20261124210000_workspace_team_realtime_notifications.sql",
]);
export const WORKSPACE_DRILL_PATHS = Object.freeze([
  "tests/sql/workspace-revisions-db-smoke.sql",
  "tests/sql/workspace-owner-quotas-db-smoke.sql",
  "tests/sql/workspace-priority-archive-purge-db-smoke.sql",
  "tests/sql/workspace-task-checklists-db-smoke.sql",
  "tests/sql/workspace-checklist-restore-db-smoke.sql",
  "tests/sql/workspace-import-recovery-db-smoke.sql",
  "tests/sql/workspace-import-review-discard-db-smoke.sql",
  "tests/sql/workspace-import-protection-db-smoke.sql",
  "tests/sql/workspace-reconciliation-receipts-db-smoke.sql",
  "tests/sql/workspace-release-drill-db-smoke.sql",
  "tests/sql/workspace-team-spaces-db-smoke.sql",
  "tests/sql/workspace-team-discussions-checklists-db-smoke.sql",
  "tests/sql/workspace-team-realtime-notifications-db-smoke.sql",
]);

// caller supplies a source map, e.g. filesystem reads of tracked files.
export function evaluateWorkspaceReleaseInventory(files) {
  if (!files || typeof files.get !== "function") {
    throw new Error("Source inventory requires a readable file map");
  }
  const workflow=files.get(".github/workflows/workspace-revisions-postgres.yml") ?? "";
  const ci=files.get(".github/workflows/ci.yml") ?? "";
  const checks=[];
  for (const path of WORKSPACE_MIGRATION_PATHS) {
    checks.push({
      key:"migration:"+path.split("/").at(-1),
      status:typeof files.get(path)==="string" && files.get(path).length>20 &&
        workflow.includes(path)?"pass":"fail",
      description:"Migration source exists and is referenced by disposable PostgreSQL CI",
    });
  }
  for (const path of WORKSPACE_DRILL_PATHS) {
    checks.push({
      key:"drill:"+path.split("/").at(-1),
      status:typeof files.get(path)==="string" && files.get(path).length>20 &&
        workflow.includes(path)?"pass":"fail",
      description:"Database acceptance source exists and is referenced by CI",
    });
  }
  checks.push({
    key:"ci:readiness",
    status:ci.includes("scripts/workspace-release-readiness.mjs --source-check")?
      "pass":"fail",
    description:"General CI invokes offline source inventory",
  });
  checks.push({
    key:"ui:readiness",
    status:(files.get("src/pages/DigitalWorkspace.tsx")??"")
      .includes("<WorkspaceReadinessPanel")?"pass":"fail",
    description:"Read-only authenticated readiness UI is wired into Workspace",
  });
  const failed=checks.filter(c=>c.status==="fail").length;
  return {
    format:"eternyx.workspace.release-inventory",version:1,
    scope:"Repository source and CI wiring only",
    release_gate:failed?"blocked":"manual_review_required",
    production_certified:false,live_migrations_checked:false,
    real_storage_bytes_tested:false,cross_tenant_staging_tested:false,
    checks,
    summary:{pass:checks.length-failed,fail:failed},
    limitations:"No live database, Auth, Storage or production deployment inspected. Source presence is not staging acceptance, RLS certification or production readiness.",
  };
}
