import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {assessStageSnapshot,validateSnapshot,STAGING_REF,PRODUCTION_REF,ORGANIZATION_ID} from "../scripts/automation-stage-snapshot-preflight.mjs";

const project=()=>({id:STAGING_REF,ref:STAGING_REF,organization_id:ORGANIZATION_ID,status:"ACTIVE_HEALTHY",region:"us-east-1"});
const snapshot=(versions=[],functions=[])=>({
  schema:"eternyx-staging-snapshot-v1",
  project:project(),
  migrations:versions.map(version=>({version,name:"verified_staging_entry"})),
  functions:functions.map(slug=>({slug}))
});
const observed=["20261123215132","20261123215141","20261123215211"];
test("allows an actually empty verified stage only for empty fresh mirror",()=>{
  const r=assessStageSnapshot(snapshot());
  assert.equal(r.snapshotAccepted,true);
  assert.equal(r.freshMirrorEligible,true);
  assert.equal(r.productionChangesAuthorized,false);
  assert.equal(r.functionDeploymentAuthorized,false);
  assert.equal(r.remoteSqlExecuted,false);
});
test("rejects a previously used stage as fresh (actual 3-entry scenario)",()=>{
  const r=assessStageSnapshot(snapshot(observed));
  assert.equal(r.migrationCount,3);
  assert.equal(r.freshMirrorEligible,false);
  assert.equal(r.snapshotAccepted,false);
  assert.deepEqual(r.unexpectedVersions,observed);
});
test("read-only acknowledgement is allowed only with exact existing journal",()=>{
  const r=assessStageSnapshot(snapshot(observed),{expectedVersions:observed,allowNonempty:true});
  assert.equal(r.snapshotAccepted,true);
  assert.equal(r.freshMirrorEligible,false);
  assert.equal(r.functionDeploymentAuthorized,false);
  assert.equal(r.schemaApplied,false);
});
test("unexpected or missing migrations block even when nonempty acknowledged",()=>{
  assert.equal(assessStageSnapshot(snapshot(observed),{
    expectedVersions:observed.slice(0,2),allowNonempty:true
  }).snapshotAccepted,false);
  assert.deepEqual(assessStageSnapshot(snapshot(observed.slice(0,2)),{
    expectedVersions:observed,allowNonempty:true
  }).missingExpectedVersions,[observed[2]]);
});
test("any already-deployed protected function blocks nonempty stage approval",()=>{
  const r=assessStageSnapshot(snapshot(observed,["automation-control"]),{
    expectedVersions:observed,allowNonempty:true
  });
  assert.equal(r.snapshotAccepted,false);
  assert.deepEqual(r.alreadyDeployedCoreFunctions,["automation-control"]);
});
test("production and wrong organization, region or status are denied",()=>{
  for(const mutation of [
    {ref:PRODUCTION_REF,id:PRODUCTION_REF},
    {id:PRODUCTION_REF},
    {organization_id:"another-organization"},
    {status:"INACTIVE"},
    {region:"eu-west-1"}
  ]){
    const s=snapshot();Object.assign(s.project,mutation);
    assert.throws(()=>validateSnapshot(s),/automation_stage_preflight_wrong_target/);
  }
});
test("malformed and duplicated journal entries never pass",()=>{
  const s=snapshot([observed[0],observed[0]]);
  assert.throws(()=>assessStageSnapshot(s),/duplicate_journal_version/);
  const t=snapshot();t.migrations=[{version:"bad",name:"x"}];
  assert.throws(()=>assessStageSnapshot(t),/invalid_migration/);
  const u=snapshot([],["ctf-verified","ctf-verified"]);
  assert.throws(()=>assessStageSnapshot(u),/duplicate_function_slug/);
  assert.throws(()=>assessStageSnapshot(snapshot(),{expectedVersions:[observed[0],observed[0]]}),/duplicate_expected_versions/);
});
test("future malformed snapshots and bad inputs fail closed",()=>{
  const x=snapshot();x.project=null;
  assert.throws(()=>validateSnapshot(x),/malformed_project/);
  const y=snapshot();y.migrations="empty";
  assert.throws(()=>validateSnapshot(y),/invalid_catalog/);
  assert.throws(()=>assessStageSnapshot(snapshot(),{allowNonempty:"yes"}),/invalid_mode/);
  assert.throws(()=>assessStageSnapshot(snapshot(),{expectedVersions:["../../bad"]}),/invalid_expected_versions/);
});
test("preflight remains pure and does not inspect credentials or deploy",async()=>{
  const body=await readFile(new URL("../scripts/automation-stage-snapshot-preflight.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(body,/\bfetch\s*\(|\bspawn\s*\(|\bexecSync\s*\(|process\.env|service_role|SUPABASE_ACCESS_TOKEN/);
  assert.match(body,/functionDeploymentAuthorized:false/);
  assert.match(body,/remoteSqlExecuted:false/);
});
