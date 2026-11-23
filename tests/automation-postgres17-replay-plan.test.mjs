import test from "node:test";
import assert from "node:assert/strict";
import {readFile,mkdtemp,writeFile,rm,mkdir} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {planReplay,writeReplayPlan} from "../scripts/automation-postgres17-replay-plan.mjs";
import {inspectRehearsalSource} from "../scripts/automation-fresh-staging-mirror.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sqlName=(p,i)=>"20261123"+String(i).padStart(6,"0")+"_"+p+"_"+i+".sql";
const sha40="a".repeat(40),sha64="b".repeat(64);
function fixture(){
  const files=[];
  for(let i=0;i<20;i++)files.push({
    original:i===0?"20261122220000_automation_manual_control_plane.sql":sqlName("automation",i),
    mirror:i===0?"20261122220000_automation_manual_control_plane.sql":sqlName("automation",i),
    sourceGitBlob:sha40,contentSha256:sha64,
  });
  for(let i=20;i<28;i++)files.push({
    original:sqlName("docker",i),mirror:sqlName("docker",i),
    sourceGitBlob:sha40,contentSha256:sha64,
  });
  return {schema:"eternyx-fresh-staging-migration-mirror-v1",
    sourceSqlBytesChanged:false,sourceBaselineValid:true,
    allMirrorTimestampsUnique:true,productionDeploymentAllowed:false,
    remoteMigrationsReconciled:false,schemaApplied:false,
    migrationsPushed:false,deploymentAuthorized:false,
    sourceFileCount:files.length,files};
}
test("valid mirror plans two pillars with an exact ordered, unique migration set",()=>{
  const plan=planReplay(fixture());
  assert.equal(plan.schema,"eternyx-automation-docker-postgres17-replay-v1");
  assert.equal(plan.combinedMigrationCount,28);
  assert.equal(plan.automationMigrationCount,20);
  assert.equal(plan.dockerMigrationCount,8);
  assert.equal(plan.order[0].original,"20261122220000_automation_manual_control_plane.sql");
  assert.equal(plan.localPostgresExecutionVerified,false);
  assert.equal(plan.remoteProjectChanged,false);
  assert.equal(plan.otherPillarsExcluded,true);
  assert.equal(plan.remoteDeployAllowed,false);
});
test("planner fails on duplicate timestamps, missing source identity or suspicious flags",()=>{
  const raw=fixture();
  for(const evil of [
    {...raw,files:raw.files.map((f,i)=>i===1?{...f,mirror:raw.files[0].mirror}:f)},
    {...raw,files:raw.files.map((f,i)=>i===1?{...f,mirror:"20261123010000_unrelated.sql"}:f)},
    {...raw,files:raw.files.map((f,i)=>i===1?{...f,sourceGitBlob:"invalid"}:f)},
    {...raw,files:raw.files.slice(1)},
    {...raw,productionDeploymentAllowed:true},
    {...raw,remoteMigrationsReconciled:true},
    {...raw,sourceSqlBytesChanged:true},
    {...raw,files:raw.files.filter(f=>!f.original.includes("_docker_"))},
  ])assert.throws(()=>planReplay(evil));
});
test("live source mirror plan proves complete available Automation and Docker chain without fake database success",async()=>{
  const source=await inspectRehearsalSource();
  const copy=await readFile(path.join(root,"scripts/automation-fresh-staging-mirror.mjs"),"utf8");
  assert.equal(source.sourceBaselineValid,true);
  assert.ok(source.sourceFileCount>=108);
  assert.equal(source.originalCollisionVersions,11);
  assert.match(copy,/sourceSqlBytesChanged:false/);
  const workflow=await readFile(path.join(root,".github/workflows/automation-docker-postgres17-replay.yml"),"utf8");
  assert.match(workflow,/--network none/);
  assert.match(workflow,/POSTGRES_PASSWORD=local_ci_only/);
  assert.match(workflow,/ctf-range-db-bootstrap.sql/);
  assert.match(workflow,/automation-control-db-smoke.sql/);
  assert.match(workflow,/docker-lab-db-acceptance.sql/);
  assert.match(workflow,/ON_ERROR_STOP=1/);
  assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD|DATABASE_URL|\$\{\{\s*secrets\./);
});
test("plan is confined to fresh local mirror and cannot be overwritten",async()=>{
  const base=await mkdtemp(path.join(tmpdir(),"eternyx-replay-"));
  try{
    const mirror=path.join(base,"mirror");
    await mkdir(mirror);
    await writeFile(path.join(mirror,"REHEARSAL_ONLY.json"),JSON.stringify(fixture()));
    const output=path.join(mirror,"plan.txt");
    const plan=await writeReplayPlan(mirror,output);
    assert.equal(plan.combinedMigrationCount,28);
    const rows=(await readFile(output,"utf8")).trim().split("\n");
    assert.deepEqual(rows,plan.order.map(x=>x.mirror));
    await assert.rejects(writeReplayPlan(mirror,output),/EEXIST/);
    await assert.rejects(writeReplayPlan(mirror,"/tmp/malicious-plan"),/cross_pillar_plan_outside_workspace/);
    await assert.rejects(writeReplayPlan(mirror,"relative"),/cross_pillar_unsafe_paths/);
  }finally{await rm(base,{recursive:true,force:true});}
});
test("replay planner cannot execute SQL, run CLI, connect Supabase or inspect secrets",async()=>{
  const source=await readFile(path.join(root,"scripts/automation-postgres17-replay-plan.mjs"),"utf8");
  assert.doesNotMatch(source,/\bfetch\s*\(|\bspawn\s*\(|\bexecFile\s*\(|\bexecSync\s*\(|process\.env|supabase\.rpc\(/);
  assert.doesNotMatch(source,/service_role|SUPABASE_SECRET|SUPABASE_ACCESS_TOKEN/);
});
