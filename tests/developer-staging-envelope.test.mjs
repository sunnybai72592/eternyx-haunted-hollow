import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyDeveloperStagingEnvelope} from "../scripts/developer-staging-envelope.mjs";

const now=Date.parse("2026-11-24T12:10:00Z");
const expected={runId:"123456789",runAttempt:"2"};
const fixture=()=>({
  schema:"eternyx-developer-browser-acceptance-v1",environment:"operator-specified staging",
  production_verified:false,staging_executed:true,browser:"Chrome",target_host:"developer.staging.example.org",
  network_scope:"same-origin only",release_observations:[],deep_link_observations:[],
  header_observations:[],runtime_errors:[],asset_failures:[],network_audit:{},
  api_requests_executed:false,started_at:"2026-11-24T12:00:00Z",finished_at:"2026-11-24T12:05:00Z",
  commit:"a".repeat(40),cases:[],
  note:"Only case names/outcomes recorded; project source, URLs, tokens and downloaded artifacts excluded.",
  run_id:expected.runId,run_attempt:expected.runAttempt,
});

test("workflow attempt envelope records only correlation metadata and measured duration",()=>{
  const result=verifyDeveloperStagingEnvelope(fixture(),expected,now);
  assert.equal(result.run_id,expected.runId);
  assert.equal(result.run_attempt,"2");
  assert.equal(result.elapsed_seconds,300);
  assert.match(result.scope,/unsigned/);
  // Envelope acceptance is not acceptance of the empty journey arrays.
});

test("reject missing, extra, arbitrary narrative and mismatched workflow fields",()=>{
  const base=fixture();
  const {run_id,...missing}=base;
  for(const report of [null,[],missing,{...base,private_source:"secret"},
    {...base,note:"arbitrary sensitive value"},{...base,run_id:"123456788"},
    {...base,run_attempt:"1"},{...base,run_id:123456789}]) {
    assert.throws(()=>verifyDeveloperStagingEnvelope(report,expected,now),/staging gate/);
  }
  for(const run of [null,{}, {runId:123456789,runAttempt:"2"}, {runId:expected.runId,runAttempt:"02"},
    {runId:"0",runAttempt:"2"}, {runId:expected.runId,runAttempt:"3"}]) {
    assert.throws(()=>verifyDeveloperStagingEnvelope(base,run,now),/run ID and attempt/);
  }
});

test("strict UTC clock, chronological ordering, bounded duration and freshness",()=>{
  const base=fixture();
  for(const report of [
    {...base,started_at:"2026-11-24T12:06:00Z"},
    {...base,started_at:"2026-11-24T11:49:59Z"},
    {...base,started_at:"2026-11-24T12:00:00+00:00"},
    {...base,started_at:"2026-11-24T12:00:00.000Z"},
    {...base,started_at:"2026-02-30T12:00:00Z"},
    {...base,started_at:"2026-11-24T10:00:00Z",finished_at:"2026-11-24T10:05:00Z"},
    {...base,started_at:"2026-11-24T12:10:00Z",finished_at:"2026-11-24T12:11:01Z"},
  ]) assert.throws(()=>verifyDeveloperStagingEnvelope(report,expected,now),/observation window/);
  assert.throws(()=>verifyDeveloperStagingEnvelope(base,expected,NaN),/observation window/);
  assert.equal(verifyDeveloperStagingEnvelope({...base,started_at:"2026-11-24T11:50:00Z"},expected,now).elapsed_seconds,900);
});

test("runner records actual UTC lifecycle and counts cross-origin write attempts before abort",()=>{
  const runner=readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py",import.meta.url),"utf8");
  assert.match(runner, /started_at=datetime\.now\(timezone\.utc\)/);
  assert.match(runner, /"run_id":os\.getenv\("GITHUB_RUN_ID",""\)/);
  assert.match(runner, /"run_attempt":os\.getenv\("GITHUB_RUN_ATTEMPT",""\)/);
  assert.match(runner, /is_write = args\.staging and route\.request\.method not in \("GET", "HEAD"\)/);
  assert.match(runner, /if is_external:\s+NETWORK_AUDIT\["blocked_external_requests"\] \+= 1\s+if is_write:\s+NETWORK_AUDIT\["blocked_write_attempts"\] \+= 1\s+if is_external or is_write:\s+return route\.abort\(\)/);
});

test("verified summary is written by the gate and published only after successful verification",()=>{
  const gate=readFileSync(new URL("../scripts/developer-staging-gate.mjs",import.meta.url),"utf8");
  const workflow=readFileSync(new URL("../.github/workflows/developer-staging-browser-acceptance.yml",import.meta.url),"utf8");
  assert.match(gate,/runId: process\.env\.GITHUB_RUN_ID, runAttempt: process\.env\.GITHUB_RUN_ATTEMPT/);
  assert.match(gate,/verifyDeveloperStagingEnvelope\(value, expectedRun, currentTime\)/);
  assert.match(gate,/fs\.writeFileSync\(process\.env\.DEVELOPER_VERIFIED_SUMMARY_PATH, output, \{ flag: "wx" \}\)/);
  assert.match(workflow,/DEVELOPER_VERIFIED_SUMMARY_PATH: test-results\/developer-staging-verified-summary\.json/);
  assert.match(workflow,/Preserve independently checked staging summary only on success\s+if: success\(\)/);
  assert.match(workflow,/name: eternyx-developer-verified-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow,/if: always\(\)/);
});
