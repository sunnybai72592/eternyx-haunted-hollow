import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  FUNCTION_SECRETS,buildStagingPlan,buildPlanFromEvidence,
} from "../scripts/automation-staging-deployment-plan.mjs";
import {REQUIRED_FUNCTIONS} from "../scripts/automation-runtime-readiness.mjs";

const staging="abcdefghijklmnopqrst";
const production="wcncuarekaofmfurbtbh";
const now=new Date("2026-11-23T16:00:00Z");
const fakeSource=()=>({
  scan:{migrations:["20261122220000_automation_manual_control_plane.sql"],
    problems:[]},
  allMigrationCount:4,otherMigrationCount:3,
  automationMigrations:[{name:"20261122220000_automation_manual_control_plane.sql",
    sha256:"1".repeat(64)}],
  duplicateVersions:[],orderWrong:false,
  functions:Object.entries(REQUIRED_FUNCTIONS).map(([slug,expectedJwt])=>({
    slug,expectedJwt,sha256:"2".repeat(64),
    serverOnlySecretNames:FUNCTION_SECRETS[slug],
  })),
});
const inventory=()=>Object.entries(REQUIRED_FUNCTIONS).map(([slug,verify_jwt],i)=>({
  slug,verify_jwt,version:i+1,status:"ACTIVE",
}));
const evidence=()=>({
  projectRef:staging,source:"operator_supplied_migration_list",
  capturedAt:"2026-11-23T15:59:00Z",
  appliedVersions:["20261122220000"],
});

test("offline source manifest proves real handler & migration files, hashing and ordering",async()=>{
  const plan=await buildStagingPlan();
  assert.equal(plan.schema,"eternyx-automation-v1-staging-handoff-v1");
  assert.equal(plan.mode,"offline_source_plan");
  assert.ok(plan.automationMigrationCount>=20);
  assert.ok(plan.repositoryMigrationCount>=plan.automationMigrationCount);
  assert.equal(plan.functionSources.length,6);
  for(const f of plan.functionSources){
    assert.match(f.sha256,/^[0-9a-f]{64}$/);
    assert.deepEqual(f.serverOnlySecretNames,FUNCTION_SECRETS[f.slug]);
    assert.equal(f.expectedJwt,REQUIRED_FUNCTIONS[f.slug]);
  }
  assert.ok(plan.sourceMigrations.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
  assert.equal(plan.orderedReadOnlyCommands.length,0);
  assert.equal(plan.commandsExecuted,false);
  assert.equal(plan.productionReady,false);
  assert.ok(plan.blockers.some(x=>x.code==="staging_target_not_bound"));
});
test("explicit staging ref cannot match production or become a URL or shell injection",()=>{
  for(const a of [
    {stagingRef:production,productionRef:production},
    {stagingRef:"https://evil.invalid",productionRef:production},
    {stagingRef:"abcdefghij;rm -rf /",productionRef:production},
    {stagingRef:staging,productionRef:"not-a-reference"},
    {stagingRef:null,productionRef:production},
    {stagingRef:staging,productionRef:null},
  ]){
    assert.throws(()=>buildPlanFromEvidence(fakeSource(),a));
  }
});
test("v3 dry-run commands target explicit staging ref and never mutate hosted DB",()=>{
  const r=buildPlanFromEvidence(fakeSource(),{stagingRef:staging,productionRef:production,
    inventory:inventory(),migrationEvidence:evidence(),now});
  assert.equal(r.mode,"staging_plan");
  assert.equal(r.stagingRef,staging);
  assert.deepEqual(r.orderedReadOnlyCommands,[
    {stage:"read-only remote migration history",
      argv:["supabase","migration","list","--remote="+staging],
      changesHostedProject:false},
    {stage:"dry-run against all repository migrations, not just Automation",
      argv:["supabase","db","push","--dry-run","--remote="+staging],
      changesHostedProject:false},
  ]);
  assert.equal(r.liveInventoryChecked,true);
  assert.equal(r.appliedMigrationsEvidenced,true);
  assert.deepEqual(r.observedMissing,[]);
  assert.equal(r.migrationVersionsMatched,1);
  assert.equal(r.blockers.some(x=>x.code==="function_not_deployed"),false);
  for(const key of ["readyForExecution","productionReady","productionProjectChanged",
    "stagingProjectChanged","commandsExecuted","releaseAuthorized",
    "stagingExecutionVerified"])assert.equal(r[key],false,key);
  for(const cmd of r.orderedReadOnlyCommands){
    assert.ok(cmd.argv.every(x=>!x.includes("--yes")));
    assert.ok(cmd.argv.every(x=>!x.includes("--prune")));
    assert.ok(cmd.argv.every(x=>!x.includes("functions deploy")));
    assert.ok(cmd.argv.every(x=>!x.includes(production)));
  }
});
test("missing cloud inventory and migration evidence are separate blockers, not false completion",()=>{
  const r=buildPlanFromEvidence(fakeSource(),{stagingRef:staging,productionRef:production});
  assert.equal(r.liveInventoryChecked,false);
  assert.equal(r.appliedMigrationsEvidenced,false);
  assert.equal(r.observedMissing.length,6);
  assert.deepEqual(r.blockers.filter(x=>x.code.endsWith("_missing")).map(x=>x.code),
    ["deployed_function_inventory_missing","applied_migration_evidence_missing"]);
  assert.equal(r.readyForExecution,false);
});
test("real connected missing-core example produces exact missing-function blockers",()=>{
  const partial=inventory().filter(f=>!["automation-control","automation-webhook",
    "automation-scheduler-worker"].includes(f.slug));
  const r=buildPlanFromEvidence(fakeSource(),{
    stagingRef:staging,productionRef:production,inventory:partial,migrationEvidence:evidence(),now,
  });
  assert.deepEqual(r.observedMissing,[
    "automation-control","automation-webhook","automation-scheduler-worker",
  ]);
  assert.equal(r.blockers.filter(x=>x.code==="function_not_deployed").length,3);
  assert.equal(r.productionReady,false);
});
test("stale migration, wrong project and missing migration are rejected or flagged",()=>{
  assert.throws(()=>buildPlanFromEvidence(fakeSource(),{
    stagingRef:staging,productionRef:production,
    migrationEvidence:{...evidence(),projectRef:production},now,
  }));
  assert.throws(()=>buildPlanFromEvidence(fakeSource(),{
    stagingRef:staging,productionRef:production,
    migrationEvidence:{...evidence(),capturedAt:"2026-11-21T15:59:00Z"},now,
  }));
  const absent=buildPlanFromEvidence(fakeSource(),{
    stagingRef:staging,productionRef:production,
    migrationEvidence:{...evidence(),appliedVersions:[]},now,
  });
  assert.equal(absent.migrationVersionsMatched,0);
  assert.ok(absent.blockers.some(x=>x.code==="migration_not_evidenced"));
});
test("duplicate migration timestamps, ordering and source errors fail closed",()=>{
  const src=fakeSource();
  src.duplicateVersions=["20261122220000"];
  src.orderWrong=true;
  src.scan.problems=[{code:"jwt_config_mismatch",subject:"automation-control"}];
  const r=buildPlanFromEvidence(src);
  assert.ok(r.blockers.some(x=>x.code==="duplicate_migration_versions"));
  assert.ok(r.blockers.some(x=>x.code==="out_of_order_automation_migrations"));
  assert.ok(r.blockers.some(x=>x.code==="jwt_config_mismatch"));
});
test("server-only secret requirement names are published without secret values",async()=>{
  const r=buildPlanFromEvidence(fakeSource());
  const all=JSON.stringify(r);
  assert.match(all,/AUTOMATION_WEBHOOK_ENCRYPTION_KEY/);
  assert.match(all,/AUTOMATION_SCHEDULER_WORKER_KEY/);
  assert.match(all,/AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY/);
  assert.equal(all.includes("sb_secret_"),false);
  assert.equal(all.includes("service_role"),false);
  const script=await readFile(new URL("../scripts/automation-staging-deployment-plan.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(script,/\bspawn\s*\(|\bexecFile\s*\(|\bfetch\s*\(|process\.env|import\(["']child_process/);
  assert.doesNotMatch(script,/supabase db reset|supabase secrets set|functions deploy --yes/);
});
