// Workspace Phase 28: an OPERATOR-ONLY, metadata-only PostgreSQL audit.
// No network activity occurs when importing this module or checking config.
// Config validation reuses the strict, proven Automation isolated-target guard.
import {inspectStagingConnection,classifyStagingPgFailure} from "./automation-staging-db-readonly.mjs";
import {WORKSPACE_MIGRATION_PATHS} from "../src/lib/workspaceReleaseInventory.mjs";

export const WORKSPACE_AUDIT_VERSIONS=Object.freeze(WORKSPACE_MIGRATION_PATHS
  .map(p=>p.split("/").at(-1).slice(0,14)));
export const WORKSPACE_AUDIT_TABLES=Object.freeze(["workspace_projects","workspace_tasks","workspace_items","workspace_activity","workspace_task_steps","workspace_import_sessions","workspace_reconciliation_receipts","workspace_team_spaces","workspace_team_members","workspace_team_invites","workspace_team_tasks","workspace_team_events","workspace_team_task_comments","workspace_team_task_steps","workspace_team_read_cursors"]);
export const WORKSPACE_AUDIT_FUNCTIONS=Object.freeze(["workspace_team_role","workspace_team_create","workspace_team_invite","workspace_team_accept_invite","workspace_team_revoke_invite","workspace_team_member_change","workspace_team_leave","workspace_team_set_status","workspace_team_save_task","workspace_team_delete_task","workspace_team_post_comment","workspace_team_redact_comment","workspace_team_add_step","workspace_team_check_step","workspace_team_remove_step","workspace_team_mark_events_seen","workspace_team_notification_snapshot"]);
const required=Object.freeze(["connection_ok","transaction_read_only","migration_history_present"]);

function fail(code){throw Error("workspace_staging_audit_"+code);}
export function inspectWorkspaceAuditConfig(env={}){
  if(env.WORKSPACE_AUDIT_CONFIRM!=="I_APPROVE_READ_ONLY_WORKSPACE_STAGING")
    fail("explicit_staging_approval_required");
  const metadata=inspectStagingConnection({
    ETERNYX_AUTOMATION_STAGING_REF:env.WORKSPACE_AUDIT_REF,
    ETERNYX_AUTOMATION_PRODUCTION_REF:"wcncuarekaofmfurbtbh",
    ETERNYX_AUTOMATION_STAGING_PGHOST:env.WORKSPACE_AUDIT_PGHOST,
    ETERNYX_AUTOMATION_STAGING_PGUSER:env.WORKSPACE_AUDIT_PGUSER,
    ETERNYX_AUTOMATION_STAGING_PGPORT:env.WORKSPACE_AUDIT_PGPORT,
    ETERNYX_AUTOMATION_STAGING_PGDATABASE:env.WORKSPACE_AUDIT_PGDATABASE,
  });
  return {
    schema:"eternyx.workspace.staging-db-audit-config",version:1,
    staging_reference:metadata.stagingRef,
    connection_type:metadata.connectionType,
    tls_verify_full:true,pinned_ca_required:true,
    transaction_read_only:true,db_writes_allowed:false,
    production_allowed:false,executed:false,approved_for_execution:false,
  };
}
export function parseWorkspaceStagingAudit(stdout){
  if(typeof stdout!=="string"||stdout.length>16000)fail("malformed_output");
  const flags=new Map(),applied=new Set(),tables=new Map(),functions=new Map();
  for(const line of stdout.trim().split(/\r?\n/)){
    if(!line)continue;
    let m;
    if((m=/^(connection_ok|transaction_read_only|migration_history_present)=(true|false)$/.exec(line))){
      if(flags.has(m[1]))fail("duplicate_flag");
      flags.set(m[1],m[2]==="true");continue;
    }
    if((m=/^applied_version=(\d{14})$/.exec(line))){
      if(!WORKSPACE_AUDIT_VERSIONS.includes(m[1])||applied.has(m[1]))
        fail("invalid_applied_version");
      applied.add(m[1]);continue;
    }
    if((m=/^table_status=([a-z_]+):(true|false):(true|false)$/.exec(line))){
      if(!WORKSPACE_AUDIT_TABLES.includes(m[1])||tables.has(m[1]))
        fail("invalid_table_receipt");
      tables.set(m[1],{rls:m[2]==="true",anonSelect:m[3]==="true"});continue;
    }
    if((m=/^function_status=([a-z_]+):(true|false)$/.exec(line))){
      if(!WORKSPACE_AUDIT_FUNCTIONS.includes(m[1])||functions.has(m[1]))
        fail("invalid_function_receipt");
      functions.set(m[1],m[2]==="true");continue;
    }
    fail("unexpected_output");
  }
  if(required.some(k=>!flags.has(k))||
      !flags.get("connection_ok")||!flags.get("transaction_read_only")||
      !flags.get("migration_history_present"))fail("unsafe_or_incomplete_connection");
  if(tables.size!==WORKSPACE_AUDIT_TABLES.length||
     functions.size!==WORKSPACE_AUDIT_FUNCTIONS.length)fail("incomplete_catalog");
  const missingMigrations=WORKSPACE_AUDIT_VERSIONS.filter(x=>!applied.has(x));
  const invalidTables=WORKSPACE_AUDIT_TABLES.filter(x=>!tables.get(x).rls||tables.get(x).anonSelect);
  const missingFunctions=WORKSPACE_AUDIT_FUNCTIONS.filter(x=>!functions.get(x));
  const blocked=!!(missingMigrations.length||invalidTables.length||missingFunctions.length);
  return {
    schema:"eternyx.workspace.staging-db-audit",version:1,
    mode:"isolated_staging_sql_read_only",staging_checked:true,
    source_migration_count:WORKSPACE_AUDIT_VERSIONS.length,
    applied_migration_count:applied.size,
    missing_migration_versions:missingMigrations,
    table_rls_and_anon_grant_failures:invalidTables,
    missing_function_names:missingFunctions,
    inspected_table_count:tables.size,inspected_function_count:functions.size,
    release_gate:blocked?"blocked":"manual_review_required",
    database_writes_performed:false,production_certified:false,
    cross_account_rls_verified:false,private_storage_bytes_verified:false,
    realtime_delivery_verified:false,actual_migration_sql_verified:false,
    limitations:"Metadata-only staging audit. A matching migration version does not prove its SQL body, runtime policy semantics, identity isolation or deployment. Four-account RLS/Realtime/Storage testing and manual signoff still required.",
  };
}
export {classifyStagingPgFailure};
