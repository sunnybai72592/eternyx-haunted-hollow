import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {planReplay,writeReplayPlan} from "../scripts/automation-postgres17-replay-plan.mjs";
import {createRehearsalMirror} from "../scripts/automation-fresh-staging-mirror.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sha40="a".repeat(40),sha64="b".repeat(64);
function fixture(serviceCount=13){
  const files=[
    "20261122201000_service_requests.sql",
    "20261122220000_automation_manual_control_plane.sql",
  ];
  let seq=1;
  for(const [pillar,count] of [["automation",19],["docker",8],["workspace",12],["service",serviceCount-1]]){
    for(let i=0;i<count;i++){
      const n=String(seq++).padStart(6,"0");
      files.push("20261123"+n+"_"+pillar+"_"+n+".sql");
    }
  }
  return {
    schema:"eternyx-fresh-staging-migration-mirror-v1",
    sourceFileCount:files.length,sourceBaselineValid:true,
    allMirrorTimestampsUnique:true,sourceSqlBytesChanged:false,
    productionDeploymentAllowed:false,remoteMigrationsReconciled:false,
    schemaApplied:false,migrationsPushed:false,deploymentAuthorized:false,
    files:files.map(name=>({
      original:name,mirror:name,sourceGitBlob:sha40,contentSha256:sha64,
    })),
  };
}
test("four-pillar mode selects Services only by explicit consent and preserves previous three modes",()=>{
  const raw=fixture();
  const two=planReplay(raw);
  const three=planReplay(raw,{includeWorkspace:true});
  const four=planReplay(raw,{includeWorkspace:true,includeServices:true});
  assert.equal(two.scope,"Automation_and_Docker_SQL_only");
  assert.equal(two.combinedMigrationCount,28);
  assert.equal(two.servicesMigrationCount,0);
  assert.equal(three.scope,"Automation_Docker_Workspace_SQL_only");
  assert.equal(three.combinedMigrationCount,40);
  assert.equal(three.servicesMigrationCount,0);
  assert.equal(four.scope,"Automation_Docker_Workspace_Services_SQL_only");
  assert.equal(four.combinedMigrationCount,53);
  assert.equal(four.automationMigrationCount,20);
  assert.equal(four.dockerMigrationCount,8);
  assert.equal(four.workspaceMigrationCount,12);
  assert.equal(four.servicesMigrationCount,13);
  assert.equal(four.order[0].original,"20261122201000_service_requests.sql");
  assert.equal(four.localPostgresExecutionVerified,false);
  assert.equal(four.productionReady,false);
  assert.equal(four.remoteProjectChanged,false);
});
test("four-pillar scope rejects missing Services, half-enabled Services, and forged source metadata",()=>{
  assert.throws(()=>planReplay(fixture(12),{includeWorkspace:true,includeServices:true}),
    /cross_pillar_missing_pillar_migrations/);
  assert.throws(()=>planReplay(fixture(),{includeServices:true}),/cross_pillar_invalid_scope/);
  assert.throws(()=>planReplay(fixture(),{includeWorkspace:true,includeServices:"yes"}),
    /cross_pillar_invalid_scope/);
  const forged=fixture();
  forged.files.find(f=>f.original.includes("_service_")).mirror=
    "20261124030000_fake_service_changed.sql";
  assert.throws(()=>planReplay(forged,{includeWorkspace:true,includeServices:true}),
    /cross_pillar_changed_sql_source_identity/);
  const dupe=fixture();
  dupe.files.at(-1).mirror=dupe.files.at(-2).mirror;
  assert.throws(()=>planReplay(dupe,{includeWorkspace:true,includeServices:true}),
    /cross_pillar_invalid_file_provenance/);
});
test("actual migration mirror provides complete, unique Services source chain and no cloud changes",async()=>{
  const rootDir=await mkdtemp(path.join(tmpdir(),"eternyx-services-fourpillar-"));
  try{
    const mirror=path.join(rootDir,"fresh");
    await createRehearsalMirror({output:mirror,explicitConsent:true});
    const result=await writeReplayPlan(mirror,path.join(mirror,"four-pillars.txt"),
      {includeWorkspace:true,includeServices:true});
    assert.ok(result.combinedMigrationCount>=59);
    assert.ok(result.servicesMigrationCount>=13);
    assert.equal(result.otherPillarsExcluded,true);
    assert.equal(result.productionReady,false);
    assert.equal(result.remoteDeployAllowed,false);
    assert.equal(result.remoteProjectChanged,false);
    assert.equal(new Set(result.order.map(x=>x.mirror.slice(0,14))).size,result.order.length);
    assert.equal(result.order[0].original.includes("_service_requests"),true);
    const lines=(await readFile(path.join(mirror,"four-pillars.txt"),"utf8"))
      .trim().split("\n");
    assert.deepEqual(lines,result.order.map(x=>x.mirror));
    await assert.rejects(
      writeReplayPlan(mirror,path.join(mirror,"four-pillars.txt"),
        {includeWorkspace:true,includeServices:true}),/EEXIST/);
  }finally{await rm(rootDir,{recursive:true,force:true});}
});
test("new isolated workflow really executes four-pillar SQL and Services owner/admin checks",async()=>{
  const workflow=await readFile(path.join(root,
    ".github/workflows/automation-services-four-pillar-postgres17.yml"),"utf8");
  for(const required of [
    "--network none","postgres:17-alpine","ON_ERROR_STOP=1",
    "--include-workspace --include-services",
    "services-four-pillar-bootstrap.sql","services-four-pillar-acceptance.sql",
    "automation-control-db-smoke.sql","docker-lab-db-acceptance.sql",
    "workspace-revisions-db-smoke.sql","workspace-team-notification-snapshot-db-smoke.sql",
    "docker rm --force","if: always()",
  ])assert.ok(workflow.includes(required),required);
  assert.doesNotMatch(workflow,
    /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|DATABASE_URL|\$\{\{\s*secrets\./);
  const sql=await readFile(path.join(root,"tests/sql/services-four-pillar-acceptance.sql"),"utf8");
  assert.match(sql,/SET ROLE authenticated/);
  assert.match(sql,/service_request_journal/);
  assert.match(sql,/service_requests SET status='completed'/);
  assert.match(sql,/is_admin/);
  const bootstrap=await readFile(path.join(root,"tests/sql/services-four-pillar-bootstrap.sql"),"utf8");
  assert.match(bootstrap,/33333333-3333-4333-8333-333333333333/);
  assert.doesNotMatch(bootstrap,/704936db-cc9c-427b-b760-1c7c9b97618a/);
});
