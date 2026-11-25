import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateWorkspaceFreshInstallPreflight} from "../src/lib/workspaceStagingPreflight.mjs";
import {WORKSPACE_MIGRATION_PATHS} from "../src/lib/workspaceReleaseInventory.mjs";
const empty={read_only:true,database:"postgres",migration_history_present:true,
 applied_workspace_versions:[],workspace_public_relations:[],workspace_public_function_count:0,
 workspace_bucket_exists:false,workspace_storage_policy_names:[],auth_users_exists:true,
 storage_objects_exists:true,realtime_publication_exists:true};
test("empty isolated catalog can be eligible but never authorizes deployment",()=>{
 assert.deepEqual(evaluateWorkspaceFreshInstallPreflight(empty),{eligible:true,reasons:[],deployment_authorized:false});
});
test("partial install, existing storage, missing dependencies or unverified receipt blocks fresh install",()=>{
 for(const patch of [{applied_workspace_versions:["20261123050000"]},{workspace_public_relations:["workspace_projects"]},
  {workspace_public_function_count:1},{workspace_bucket_exists:true},{workspace_storage_policy_names:["workspace_private_read"]},
  {read_only:false},{auth_users_exists:false},{storage_objects_exists:false},{realtime_publication_exists:false},
  {migration_history_present:false},{database:"other"},{workspace_public_function_count:"0"}]){
  const report=evaluateWorkspaceFreshInstallPreflight({...empty,...patch});
  assert.equal(report.eligible,false);assert.equal(report.deployment_authorized,false);
 }
 assert.equal(evaluateWorkspaceFreshInstallPreflight(null).eligible,false);
 assert.equal(evaluateWorkspaceFreshInstallPreflight({}).eligible,false);
});
test("preflight covers all reviewed migration versions and is read-only",()=>{
 const sql=readFileSync(new URL("../scripts/sql/workspace-staging-fresh-install-preflight.sql",import.meta.url),"utf8");
 assert.equal(WORKSPACE_MIGRATION_PATHS.length,14);
 for(const path of WORKSPACE_MIGRATION_PATHS)assert.ok(sql.includes(path.split("/").at(-1).slice(0,14)));
 assert.match(sql,/BEGIN READ ONLY;/);assert.match(sql,/ROLLBACK;/);
 assert.doesNotMatch(sql,/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/im);
});
