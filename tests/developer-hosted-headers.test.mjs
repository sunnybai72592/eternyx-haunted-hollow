import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  DEVELOPER_HEADER_CONTROLS, DEVELOPER_HEADERS_VIEWPORTS,
  DEVELOPER_HEADERS_PHASES, verifyDeveloperHostedHeaders, summarizeDeveloperReleaseDecision,
} from "../scripts/developer-staging-headers.mjs";

const observations=()=>DEVELOPER_HEADERS_VIEWPORTS.flatMap(viewport=>
  DEVELOPER_HEADERS_PHASES.map(phase=>({
    viewport,phase,http_status:200,
    ...Object.fromEntries(DEVELOPER_HEADER_CONTROLS.map(key=>[key,true])),
  }))
);

test("real sampled HTTPS headers must cover both screen sizes and before/after phases",()=>{
  const result=verifyDeveloperHostedHeaders(observations());
  assert.equal(result.status,"passed");
  assert.equal(result.evaluated_responses,4);
  assert.equal(result.required_controls.length,7);
  assert.match(result.scope,/public staging root only/);
  assert.throws(()=>verifyDeveloperHostedHeaders(observations().slice(1)),/missing browser observations/);
  assert.throws(()=>verifyDeveloperHostedHeaders([...observations().slice(0,3),observations()[0]]),/duplicate/);
});
test("failed and missing security controls cannot be treated as staging acceptance",()=>{
  for(const name of DEVELOPER_HEADER_CONTROLS){
    const modified=observations();
    modified[2]={...modified[2],[name]:false};
    assert.throws(()=>verifyDeveloperHostedHeaders(modified),new RegExp(name));
    modified[2]={...modified[2],[name]:null};
    assert.throws(()=>verifyDeveloperHostedHeaders(modified),new RegExp(name));
  }
  const failed=observations(); failed[1].http_status=302;
  assert.throws(()=>verifyDeveloperHostedHeaders(failed),/HTTP status/);
});
test("header report rejects raw values, cookies, tokens, custom URLs or spoofed viewports",()=>{
  const entries=observations(); entries[0].set_cookie="auth=secret";
  assert.throws(()=>verifyDeveloperHostedHeaders(entries),/unsafe evidence fields/);
  entries[0].set_cookie=undefined;
  assert.throws(()=>verifyDeveloperHostedHeaders(entries),/unsafe evidence fields/);
  delete entries[0].set_cookie; entries[0].viewport="1024x768";
  assert.throws(()=>verifyDeveloperHostedHeaders(entries),/unsupported/);
});
test("a complete staging pass still produces HOLD_PRODUCTION pending backend and roles",()=>{
  const decision=summarizeDeveloperReleaseDecision(
    {developer_case_count:14},
    {observations:4},
    {blocked_write_attempts:0,runtime_exceptions:0,failed_first_party_assets:0},
    verifyDeveloperHostedHeaders(observations()));
  assert.equal(decision.decision,"HOLD_PRODUCTION");
  assert.equal(decision.protected_backend,"not-tested");
  assert.equal(decision.authenticated_roles_and_rls,"not-tested");
  assert.equal(decision.staging_https_posture,"passed-for-observed-root");
  assert.throws(()=>summarizeDeveloperReleaseDecision(
    {developer_case_count:13},{observations:4},
    {blocked_write_attempts:0,runtime_exceptions:0,failed_first_party_assets:0},
    verifyDeveloperHostedHeaders(observations())),/missing verified/);
});
test("browser supplies independently inspected sanitized HTTPS header evidence",()=>{
  const browser=readFileSync(new URL("../tests/browser/developer_project_lab_smoke.py",import.meta.url),"utf8");
  const gate=readFileSync(new URL("../scripts/developer-staging-gate.mjs",import.meta.url),"utf8");
  const ci=readFileSync(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8");
  assert.match(browser,/def inspect_https_response_headers\(/);
  assert.match(browser,/response\.all_headers\(\)/);
  assert.match(browser,/HEADER_OBSERVATIONS\.append/);
  assert.match(browser,/\"header_observations\":HEADER_OBSERVATIONS/);
  assert.match(browser,/\"nosniff\":/);
  assert.match(browser,/\"frame_protection\":/);
  assert.match(browser,/\"csp_no_unsafe_eval\":/);
  assert.match(gate,/verifyDeveloperHostedHeaders\(value\.header_observations\)/);
  assert.match(gate,/summarizeDeveloperReleaseDecision\(/);
  assert.match(gate,/HOLD_PRODUCTION/);
  assert.match(ci,/node --check scripts\/developer-staging-headers\.mjs/);
});
