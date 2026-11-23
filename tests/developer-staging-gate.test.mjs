import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  DEVELOPER_STAGING_CONFIRMATION, DEVELOPER_BROWSER_CASES, DEVELOPER_BROWSER_VIEWPORTS,
  checkDeveloperStagingConfig, verifyDeveloperStagingEvidence,
} from "../scripts/developer-staging-gate.mjs";
const workflow=readFileSync(new URL("../.github/workflows/developer-staging-browser-acceptance.yml",import.meta.url),"utf8");
const chrome=readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py",import.meta.url),"utf8");
const ci=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
const sha="a".repeat(40);
const config={origin:"https://developer.staging.example.org",expectedHost:"developer.staging.example.org",confirmation:DEVELOPER_STAGING_CONFIRMATION};
const report=(overrides={})=>({
  schema:"eternyx-developer-browser-acceptance-v1", environment:"operator-specified staging",
  production_verified:false, staging_executed:true, browser:"Chrome",
  target_host:config.expectedHost, network_scope:"same-origin only",api_requests_executed:false,
  commit:sha, finished_at:"2026-11-23T19:00:00Z",
  cases:DEVELOPER_BROWSER_VIEWPORTS.flatMap(viewport=>DEVELOPER_BROWSER_CASES.map(name=>({case:name,viewport,result:"passed"}))),
  ...overrides,
});
const now=Date.parse("2026-11-23T19:10:00Z");

test("pin staging origin to one exact repo administrator-controlled HTTPS host",()=>{
  assert.deepEqual(checkDeveloperStagingConfig(config),{origin:config.origin,host:config.expectedHost});
  for(const origin of ["http://developer.staging.example.org","https://developer.staging.example.org/foo",
    "https://dev:secret@developer.staging.example.org","https://developer.staging.example.org?token=a",
    "https://developer.staging.example.org:8443","https://127.0.0.1","https://localhost:443",
    "https://example.com","https://prod.example.org","https://dev.stage.internal"]) {
    assert.throws(()=>checkDeveloperStagingConfig({...config,origin}),/staging gate/);
  }
  assert.throws(()=>checkDeveloperStagingConfig({...config,expectedHost:"other.staging.example.org"}),/staging gate/);
  assert.throws(()=>checkDeveloperStagingConfig({...config,confirmation:"NOT_APPROVED"}),/approval/);
});

test("all 14 actual Chrome results at exact viewports are required for staging evidence",()=>{
  const summary=verifyDeveloperStagingEvidence(report(),config,sha,now);
  assert.equal(summary.developer_case_count,14);
  assert.equal(summary.production_verified,false);
  assert.match(summary.notes,/deployed artifact identity/);
  for(const field of [
    {production_verified:true}, {staging_executed:false}, {environment:"local Vite preview"},
    {browser:"Firefox"}, {target_host:"other.staging.example.org"}, {commit:"b".repeat(40)},
    {api_requests_executed:true},{network_scope:"cross-origin"},{finished_at:"2026-11-20T00:00:00Z"},
    {cases:report().cases.slice(0,13)},
  ]) assert.throws(()=>verifyDeveloperStagingEvidence(report(field),config,sha,now),/staging gate/);
});

test("duplicates, phantom results and non-passed cases are not release acceptance",()=>{
  const base=report();
  assert.throws(()=>verifyDeveloperStagingEvidence(report({cases:[base.cases[0], ...base.cases.slice(0,13)]}),config,sha,now),/duplicated|unexpected/);
  assert.throws(()=>verifyDeveloperStagingEvidence(report({cases:base.cases.map((x,i)=>i===2?{...x,result:"failed"}:x)}),config,sha,now),/failed/);
  assert.throws(()=>verifyDeveloperStagingEvidence(report({cases:base.cases.map((x,i)=>i===2?{...x,case:"no-real-case"}:x)}),config,sha,now),/unexpected/);
  assert.throws(()=>verifyDeveloperStagingEvidence(report({cases:base.cases.map((x,i)=>i===2?{...x,secret:"leak"}:x)}),config,sha,now),/unexpected/);
  assert.throws(()=>verifyDeveloperStagingEvidence(report(),config,"short",now),/full git SHA/);
});

test("manual staging workflow has no implicit schedule, no secrets or production deploy",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\bpush:|\bcron:|\bpull_request:/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/vars\.DEVELOPER_STAGING_ORIGIN/);
  assert.match(workflow,/vars\.DEVELOPER_STAGING_HOST/);
  assert.match(workflow,/RUN_DEVELOPER_STAGING_READ_ONLY/);
  assert.match(workflow,/permissions:\s+contents: read/);
  assert.match(workflow,/--check-config/);
  assert.match(workflow,/--verify-report/);
  assert.match(workflow,/if: always\(\)/);
  assert.doesNotMatch(workflow,/secrets\.|supabase|docker run|deploy|curl.*\$\{/i);
  assert.match(workflow,/developer_project_lab_smoke\.py/);
});

test("browser staging mode is explicitly confirmed, same-origin and nonmutating to backend",()=>{
  assert.match(chrome,/--confirmed-staging/);
  assert.match(chrome,/parsed\.hostname != args\.expected_host/);
  assert.match(chrome,/service_workers="block"/);
  assert.match(chrome,/if not staging:/);
  assert.match(chrome,/target_host/);
  assert.match(chrome,/"api_requests_executed":not bool\(args\.staging\)/);
  assert.match(ci,/node scripts\/developer-staging-gate\.mjs --source-check/);
});
