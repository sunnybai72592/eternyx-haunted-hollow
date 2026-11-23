import test from "node:test";
import assert from "node:assert/strict";
import {readFile, mkdtemp, mkdir, writeFile, rm} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {planReplay,writeReplayPlan} from "../scripts/automation-postgres17-replay-plan.mjs";
import {inspectRehearsalSource,createRehearsalMirror} from "../scripts/automation-fresh-staging-mirror.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const fn=(p,i)=>"20261123"+String(i).padStart(6,"0")+"_"+p+"_"+i+".sql";
const sha40="a".repeat(40),sha64="b".repeat(64);
function fixture(workspaceCount=12){
  const files=[];
  const parts=[["automation",20],["docker",8],["workspace",workspaceCount]];
  let id=1;
  files.push({original:"20261122220000_automation_manual_control_plane.sql",
    mirror:"20261122220000_automation_manual_control_plane.sql",
    sourceGitBlob:sha40,contentSha256:sha64});
  for(const [pillar,total] of parts){
    for(let i=pillar==="automation"?1:0;i<total;i++){
      const n=fn(pillar,id++);
      files.push({original:n,mirror:n,sourceGitBlob:sha40,contentSha256:sha64});
    }
  }
  return {
    schema:"eternyx-fresh-staging-migration-mirror-v1",
    sourceFileCount:files.length,sourceBaselineValid:true,
    sourceSqlBytesChanged:false,allMirrorTimestampsUnique:true,
    productionDeploymentAllowed:false,remoteMigrationsReconciled:false,
    schemaApplied:false,migrationsPushed:false,deploymentAuthorized:false,
    files,
  };
}
test("three-pillar mode includes all three scopes, while default two-pillar behavior is preserved",()=>{
  const raw=fixture();
  const original=planReplay(raw);
  const expanded=planReplay(raw,{includeWorkspace:true});
  assert.equal(original.scope,"Automation_and_Docker_SQL_only");
  assert.equal(original.workspaceMigrationCount,0);
  assert.equal(original.combinedMigrationCount,28);
  assert.equal(expanded.scope,"Automation_Docker_Workspace_SQL_only");
  assert.equal(expanded.automationMigrationCount,20);
  assert.equal(expanded.dockerMigrationCount,8);
  assert.equal(expanded.workspaceMigrationCount,12);
  assert.equal(expanded.combinedMigrationCount,40);
  assert.equal(expanded.selection,"timestamp_sorted_source_locked");
  assert.equal(expanded.productionReady,false);
  assert.equal(expanded.remoteProjectChanged,false);
  assert.equal(expanded.localPostgresExecutionVerified,false);
  assert.deepEqual(expanded.order.map(x=>x.mirror),
    [...expanded.order.map(x=>x.mirror)].sort());
});
test("three-pillar replay must reject incomplete Workspace, duplicate version or forged source identity",()=>{
  assert.throws(()=>planReplay(fixture(11),{includeWorkspace:true}),
    /cross_pillar_missing_pillar_migrations/);
  assert.throws(()=>planReplay(fixture(),{includeWorkspace:"yes"}),
    /cross_pillar_invalid_scope/);
  const forged=fixture();
  forged.files.find(x=>x.original.includes("_workspace_")).mirror=
    "20261124090000_automation_not_workspace.sql";
  assert.throws(()=>planReplay(forged,{includeWorkspace:true}),
    /cross_pillar_changed_sql_source_identity/);
  const dup=fixture();
  dup.files.at(-1).mirror=dup.files.at(-2).mirror;
  assert.throws(()=>planReplay(dup,{includeWorkspace:true}),
    /cross_pillar_invalid_file_provenance/);
});
test("actual source mirror supports 40+ distinct Automation Docker Workspace migration identifiers",async()=>{
  const scan=await inspectRehearsalSource();
  assert.equal(scan.sourceBaselineValid,true);
  assert.equal(scan.originalCollisionVersions,11);
  assert.equal(scan.locallyReversionedFiles,14);
  assert.equal(scan.productionDeploymentAllowed,false);
  const base=await mkdtemp(path.join(tmpdir(),"eternyx-adw-rehearsal-"));
  try{
    const mirror=path.join(base,"fresh");
    await createRehearsalMirror({output:mirror,explicitConsent:true});
    const result=await writeReplayPlan(mirror,path.join(mirror,"workspace-plan.txt"),
      {includeWorkspace:true});
    assert.ok(result.combinedMigrationCount>=42);
    assert.ok(result.workspaceMigrationCount>=12);
    assert.ok(result.automationMigrationCount>=20);
    assert.ok(result.dockerMigrationCount>=8);
    assert.deepEqual(new Set(result.order.map(x=>x.mirror.slice(0,14))).size,result.order.length);
    assert.equal(result.remoteProjectChanged,false);
    assert.equal(result.remoteDeployAllowed,false);
    const rows=(await readFile(path.join(mirror,"workspace-plan.txt"),"utf8")).trim().split("\n");
    assert.deepEqual(rows,result.order.map(x=>x.mirror));
    await assert.rejects(writeReplayPlan(mirror,path.join(mirror,"workspace-plan.txt"),
      {includeWorkspace:true}),/EEXIST/);
  }finally{await rm(base,{recursive:true,force:true});}
});
test("isolated workflow uses actual PG17 SQL execution, real A/B smoke and no Supabase credentials",async()=>{
  const workflow=await readFile(path.join(root,".github/workflows/automation-docker-workspace-postgres17.yml"),"utf8");
  for(const marker of [
    "--network none","postgres:17-alpine","ON_ERROR_STOP=1",
    "--include-workspace","workspace-revisions-bootstrap.sql",
    "automation-control-db-smoke.sql","docker-lab-db-acceptance.sql",
    "workspace-revisions-db-smoke.sql","workspace-team-notification-snapshot-db-smoke.sql",
    "docker rm --force","scripts/automation-migration-collision-forensics.mjs",
  ])assert.ok(workflow.includes(marker),"Missing true integration gate: "+marker);
  assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|DATABASE_URL|service_role_key|\$\{\{\s*secrets\./);
  const script=await readFile(path.join(root,"scripts/automation-postgres17-replay-plan.mjs"),"utf8");
  assert.doesNotMatch(script,/\bfetch\s*\(|\bexecFile\s*\(|\bspawn\s*\(|process\.env/);
  assert.match(script,/remoteProjectChanged:false/);
});
