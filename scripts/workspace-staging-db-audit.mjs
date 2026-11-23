// Workspace Phase 28: an OPERATOR-ONLY, metadata-only PostgreSQL audit.
// No network activity occurs when importing this module or checking config.
// Config validation reuses the strict, proven Automation isolated-target guard.
import {fileURLToPath} from "node:url";
import path from "node:path";
import {inspectStagingConnection,classifyStagingPgFailure} from "./automation-staging-db-readonly.mjs";
import {WORKSPACE_MIGRATION_PATHS} from "../src/lib/workspaceReleaseInventory.mjs";

export const WORKSPACE_AUDIT_VERSIONS=Object.freeze(WORKSPACE_MIGRATION_PATHS
  .map(p=>p.split("/").at(-1).slice(0,14)));
export const WORKSPACE_AUDIT_TABLES=Object.freeze(["workspace_projects","workspace_tasks","workspace_items","workspace_activity","workspace_task_steps","workspace_import_sessions","workspace_import_batches","workspace_import_files","workspace_item_revisions","workspace_reconciliation_receipts","workspace_team_spaces","workspace_team_members","workspace_team_invites","workspace_team_tasks","workspace_team_events","workspace_team_task_comments","workspace_team_task_steps","workspace_team_read_cursors"]);
// Exact arity and PostgreSQL type signatures; a same-name overload cannot
// substitute for the reviewed RPC. Catalog-only checks never read SQL bodies.
export const WORKSPACE_AUDIT_FUNCTION_SIGNATURES=Object.freeze({
  "workspace_team_role":"public.workspace_team_role(uuid)",
  "workspace_team_create":"public.workspace_team_create(text,text)",
  "workspace_team_invite":"public.workspace_team_invite(uuid,text)",
  "workspace_team_accept_invite":"public.workspace_team_accept_invite(text)",
  "workspace_team_revoke_invite":"public.workspace_team_revoke_invite(uuid)",
  "workspace_team_member_change":"public.workspace_team_member_change(uuid,uuid,text)",
  "workspace_team_leave":"public.workspace_team_leave(uuid)",
  "workspace_team_set_status":"public.workspace_team_set_status(uuid,text)",
  "workspace_team_save_task":"public.workspace_team_save_task(uuid,uuid,text,text,text,text,date,uuid,timestamptz)",
  "workspace_team_delete_task":"public.workspace_team_delete_task(uuid,uuid)",
  "workspace_team_post_comment":"public.workspace_team_post_comment(uuid,uuid,text)",
  "workspace_team_redact_comment":"public.workspace_team_redact_comment(uuid,uuid)",
  "workspace_team_add_step":"public.workspace_team_add_step(uuid,uuid,text)",
  "workspace_team_check_step":"public.workspace_team_check_step(uuid,uuid,boolean,timestamptz)",
  "workspace_team_remove_step":"public.workspace_team_remove_step(uuid,uuid)",
  "workspace_team_mark_events_seen":"public.workspace_team_mark_events_seen(uuid,bigint)",
  "workspace_team_notification_snapshot":"public.workspace_team_notification_snapshot(uuid)",
});
export const WORKSPACE_AUDIT_FUNCTIONS=Object.freeze(
  Object.keys(WORKSPACE_AUDIT_FUNCTION_SIGNATURES));
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
    if((m=/^table_status=([a-z_]+):(true|false):(true|false):(true|false)$/.exec(line))){
      if(!WORKSPACE_AUDIT_TABLES.includes(m[1])||tables.has(m[1]))
        fail("invalid_table_receipt");
      tables.set(m[1],{
        rls:m[2]==="true",anonCrud:m[3]==="true",hasPolicy:m[4]==="true",
      });continue;
    }
    if((m=/^function_status=([a-z_]+):(true|false):(true|false):(true|false):(true|false):(true|false):([0-9]{1,2})$/.exec(line))){
      if(!WORKSPACE_AUDIT_FUNCTIONS.includes(m[1])||functions.has(m[1]))
        fail("invalid_function_receipt");
      functions.set(m[1],{
        present:m[2]==="true",definer:m[3]==="true",
        pinnedSearchPath:m[4]==="true",authenticatedExecute:m[5]==="true",
        anonExecute:m[6]==="true",overloadCount:Number(m[7]),
      });continue;
    }
    fail("unexpected_output");
  }
  if(required.some(k=>!flags.has(k))||
      !flags.get("connection_ok")||!flags.get("transaction_read_only")||
      !flags.get("migration_history_present"))fail("unsafe_or_incomplete_connection");
  if(tables.size!==WORKSPACE_AUDIT_TABLES.length||
     functions.size!==WORKSPACE_AUDIT_FUNCTIONS.length)fail("incomplete_catalog");
  const missingMigrations=WORKSPACE_AUDIT_VERSIONS.filter(x=>!applied.has(x));
  const invalidTables=WORKSPACE_AUDIT_TABLES.filter(x=>
    !tables.get(x).rls||tables.get(x).anonCrud||!tables.get(x).hasPolicy);
  const missingFunctions=WORKSPACE_AUDIT_FUNCTIONS.filter(x=>
    !functions.get(x).present);
  const unsafeFunctions=WORKSPACE_AUDIT_FUNCTIONS.filter(x=>{
    const f=functions.get(x);
    return f.present&&(!f.definer||!f.pinnedSearchPath||
      !f.authenticatedExecute||f.anonExecute||f.overloadCount!==1);
  });
  const blocked=!!(missingMigrations.length||invalidTables.length||
    missingFunctions.length||unsafeFunctions.length);
  return {
    schema:"eternyx.workspace.staging-db-audit",version:2,
    mode:"isolated_staging_sql_read_only",staging_checked:true,
    source_migration_count:WORKSPACE_AUDIT_VERSIONS.length,
    applied_migration_count:applied.size,
    missing_migration_versions:missingMigrations,
    table_rls_policy_and_anon_crud_failures:invalidTables,
    missing_function_names:missingFunctions,
    unsafe_function_signature_or_privilege_names:unsafeFunctions,
    inspected_table_count:tables.size,inspected_function_count:functions.size,
    release_gate:blocked?"blocked":"manual_review_required",
    database_writes_performed:false,production_certified:false,
    cross_account_rls_verified:false,private_storage_bytes_verified:false,
    realtime_delivery_verified:false,actual_migration_sql_verified:false,
    limitations:"Phase 29 catalog metadata only: matching migration versions and RPC signatures/ACLs do not prove SQL bodies, runtime policy predicates, identity isolation or deployment. Authenticated four-account RLS/Realtime/Storage tests and manual signoff remain mandatory.",
  };
}
export {classifyStagingPgFailure};

export function main(argv=process.argv.slice(2),env=process.env){
  if(argv.length!==1||argv[0]!=="--check-config")
    fail("invalid_arguments");
  process.stdout.write(JSON.stringify(inspectWorkspaceAuditConfig(env),null,2)+"\n");
}
const invoked=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{main();}
  catch{
    process.stderr.write("workspace_staging_audit_config_rejected\n");
    process.exitCode=2;
  }
}
