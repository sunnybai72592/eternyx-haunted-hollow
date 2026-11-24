import test from "node:test";
import assert from "node:assert/strict";
import {buildCandidate,selectCandidate,CTF,OBSERVED_VERSIONS} from "../scripts/automation-additive-replay-candidate.mjs";
const valid=[CTF,"20261122220000_automation_manual_control_plane.sql",...Array.from({length:21},(_,i)=>"2026112300"+String(i).padStart(2,"0")+"00_automation_step_"+i+".sql")];
test("scoped plan includes every Automation migration and only verified CTF foundation",()=>{
  const scope=selectCandidate([...valid,"20261123000000_docker_sample.sql","20261122180000_ctf_range_session_control.sql"]);
  assert.equal(scope.length,23);
  assert.deepEqual(scope,[...valid].sort());
});
test("candidate rejects occupied and duplicate selected timestamps",()=>{
  assert.throws(()=>selectCandidate(valid,[valid[2].slice(0,14)]),/occupied_version/);
  assert.throws(()=>selectCandidate([...valid,"20261123000000_automation_other.sql"]),/candidate_collision/);
});
test("missing foundations, bad journal and path injection fail closed",()=>{
  assert.throws(()=>selectCandidate(valid.slice(1)),/missing_foundation/);
  assert.throws(()=>selectCandidate([...valid,"../../bad.sql"]),/invalid_source/);
  assert.throws(()=>selectCandidate(valid,[...OBSERVED_VERSIONS,OBSERVED_VERSIONS[0]]),/invalid_journal/);
});
test("real tracked candidate records complete fingerprints but never authorizes hosted writes",async()=>{
  const report=await buildCandidate();
  assert.ok(report.files.length>=23);
  assert.equal(report.files[0].name,CTF);
  assert.equal(report.protectedTables.length,7);
  assert.equal(report.sqlDependenciesVerified,false);
  assert.equal(report.remoteExecutionAuthorized,false);
  for(const row of report.files)assert.match(row.sha256,/^[a-f0-9]{64}$/);
});

test("legacy UUID and mixed-case migration names are valid inventory but remain excluded from scoped replay",()=>{
  const legacy=["20250828011106_6b94a803-f5af-4e9c-9dd5-9d8c41a74268.sql","20250828011234_Legacy-Name.sql"];
  assert.deepEqual(selectCandidate([...valid,...legacy]),[...valid].sort());
  assert.throws(()=>selectCandidate([...valid,"20250828011106_legacy/name.sql"]),/invalid_source/);
});
