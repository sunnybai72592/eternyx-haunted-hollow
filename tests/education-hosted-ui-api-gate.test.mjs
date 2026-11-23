import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertEducationUiApiBrowserReport,assertEducationUiApiGate,
  EDUCATION_UI_API_BROWSER_CASES,EDUCATION_UI_API_GATE_PATH,
  EDUCATION_UI_API_BROWSER_PATH,EDUCATION_UI_API_OWNER_PATH,
  EDUCATION_UI_API_RESULTS_PATH,
} from "../scripts/staging/educationHostedUiApiGate.mjs";
import { EDUCATION_READ_CASES } from "../scripts/staging/educationHostedReadOnlyConfig.mjs";
import { RESULTS_CASES } from "../scripts/staging/educationHostedResultsConfig.mjs";

const provenance=Object.freeze({sha:"a".repeat(40),runId:"2244",attempt:"2"});
const browser=()=>({
  schema:1,suite:"education-real-staging-browser-readonly",
  source_sha:provenance.sha,github_run_id:provenance.runId,
  github_run_attempt:provenance.attempt,
  environment:"isolated-supabase-staging",
  read_only:true,production_tested:false,production_release_approved:false,
  result:"passed",
  checks:EDUCATION_UI_API_BROWSER_CASES.map(check=>({check,result:"passed"})),
});
function api(suite,cases){
 return {
  schema:1,suite,environment:"isolated-supabase-staging",
  configured:true,distinct_authenticated_students:true,
  expected_cases:cases.length,attempted_cases:cases.length,
  passed_cases:cases.length,
  results:cases.map(c=>({case:c,result:"passed"})),
  staged_sql_deployed_by_test:false,writes_performed:false,
  production_tested:false,production_certified:false,sessions_signed_out:true,
 };
}
const own=()=>api("education-hosted-readonly",EDUCATION_READ_CASES);
const results=()=>api("education-hosted-final-results",RESULTS_CASES);
const blocked=(b,o,r,p=provenance)=>assert.throws(()=>
 assertEducationUiApiGate(b,o,r,p),/Education same-run/);

test("single-run gate accepts 22 real-browser, 30 RLS and 26 final-ledger fixed cases",()=>{
 const report=assertEducationUiApiGate(browser(),own(),results(),provenance);
 assert.equal(EDUCATION_UI_API_BROWSER_CASES.length,22);
 assert.equal(report.outcome,"read_only_browser_and_auth_api_passed");
 assert.deepEqual(report.evidence.map(e=>e.checks),
  [EDUCATION_UI_API_BROWSER_CASES.length,EDUCATION_READ_CASES.length,RESULTS_CASES.length]);
 assert.equal(report.production_release_approved,false);
 assert.equal(report.irreversible_writes_tested,false);
 assert.equal(report.real_staging_read_only,true);
 assert.equal(report.same_workflow_run,true);
 assert.equal(report.production_tested,false);
 assert.equal(report.production_certified,false);
 assert.equal(JSON.stringify(report).includes("@" ),false);
});
test("browser proof must match this exact SHA, GitHub run and attempt",()=>{
 for(const field of ["source_sha","github_run_id","github_run_attempt"]){
  const b=browser();b[field]=field==="source_sha"?"b".repeat(40):"111";
  blocked(b,own(),results());
 }
 blocked(browser(),own(),results(),{...provenance,sha:"b".repeat(40)});
 blocked(browser(),own(),results(),{...provenance,runId:"0"});
 blocked(browser(),own(),results(),{...provenance,attempt:"0"});
 blocked(browser(),own(),results(),{...provenance,other:"foreign"});
});
test("browser report refuses any wrong check, missing check or ambiguous additional field",()=>{
 const cases=[
  x=>{x.checks.pop();},x=>{x.checks.reverse();},
  x=>{x.checks[1].result="blocked";},
  x=>{x.checks[1].check="unverified";},
  x=>{x.checks[1].secret="must-not-appear";},
  x=>{x.ignored=true;},x=>{x.result="blocked";},
  x=>{x.read_only=false;},x=>{x.production_tested=true;},
  x=>{x.production_release_approved=true;},
  x=>{x.environment="production";},
 ];
 for(const mutate of cases){const b=browser();mutate(b);blocked(b,own(),results());}
});
test("student RLS API proof refuses failed, missing, swapped, malformed or partial cases",()=>{
 for(const mutate of [
  x=>{x.results.pop();},x=>{x.results.reverse();},
  x=>{x.results[4].result="failed";},
  x=>{x.results[0].extra="response-data";},
  x=>{x.expected_cases--;},x=>{x.passed_cases--;},
  x=>{x.configured=false;},x=>{x.distinct_authenticated_students=false;},
  x=>{x.sessions_signed_out=false;},x=>{x.writes_performed=true;},
  x=>{x.staged_sql_deployed_by_test=true;},
  x=>{x.production_certified=true;},
  x=>{x.schema=2;},x=>{x.suite="wrong-suite";},
 ]){
  const o=own();mutate(o);blocked(browser(),o,results());
 }
});
test("official-result API proof rejects any stale, malformed or unauthorized read evidence",()=>{
 for(const mutate of [
  x=>{x.results.pop();},x=>{x.results[2].result="failed";},
  x=>{x.results[3].case="unknown";},
  x=>{x.expected_cases=0;},x=>{x.attempted_cases=0;},
  x=>{x.distinct_authenticated_students=false;},
  x=>{x.sessions_signed_out=false;},x=>{x.writes_performed=true;},
  x=>{x.production_tested=true;},x=>{x.environment="production";},
  x=>{x.secret="leaked";},
 ]){
  const r=results();mutate(r);blocked(browser(),own(),r);
 }
});
test("no API report can substitute for browser report or vice versa",()=>{
 blocked(own(),browser(),results());
 blocked(results(),own(),browser());
 blocked(browser(),results(),own());
 blocked(undefined,own(),results());
 blocked(browser(),undefined,results());
 blocked(browser(),own(),undefined);
 assert.equal(assertEducationUiApiBrowserReport(browser(),provenance),true);
});
test("only fixed case names, bounded counters and run provenance enter the same-run summary",()=>{
 const summary=assertEducationUiApiGate(browser(),own(),results(),provenance);
 const expected=[
  "schema","suite","environment","source_sha","github_run_id",
  "github_run_attempt","outcome","evidence","same_workflow_run",
  "real_staging_read_only","staged_sql_deployed_by_test",
  "irreversible_writes_tested","production_tested","production_certified",
  "production_release_approved",
 ];
 assert.deepEqual(Object.keys(summary).sort(),expected.sort());
 assert.deepEqual(summary.evidence.map(e=>Object.keys(e).sort()),
  [0,1,2].map(()=>["checks","suite","verified"]));
});
const wf=readFileSync(new URL("../.github/workflows/education-hosted-browser-readonly.yml",import.meta.url),"utf8");
const code=readFileSync(new URL("../scripts/staging/educationHostedUiApiGate.mjs",import.meta.url),"utf8");
function step(name){
 const at=wf.indexOf("      - name: "+name+"\n");
 assert.ok(at>0,"workflow step not found: "+name);
 const end=wf.indexOf("\n      - ",at+8);
 return wf.slice(at,end<0?undefined:end);
}
test("manual workflow reruns Auth/API and browser checks in one protected main run only",()=>{
 assert.match(wf,/on:\s*\n  workflow_dispatch:/);
 assert.match(wf,/environment: rls-staging/);
 assert.match(wf,/github\.ref == 'refs\/heads\/main'/);
 assert.match(wf,/github\.repository == 'sunnybai72592\/eternyx-haunted-hollow'/);
 assert.match(wf,/group: eternyx-education-hosted-shared-staging/);
 const purge=wf.indexOf("Clear any prior browser and read-only API evidence");
 const browser=wf.indexOf("Authenticate three real staging roles in desktop and mobile");
 const api=wf.indexOf("Prove the same staging account boundaries through direct read-only Auth APIs");
 const verdict=wf.indexOf("Reject missing, foreign or incomplete same-run UI and API proof");
 const upload=wf.indexOf("Upload sanitized browser acceptance evidence");
 assert.ok(purge>0 && browser>purge && api>browser && verdict>api && upload>verdict);
 for(const name of [EDUCATION_UI_API_BROWSER_PATH,EDUCATION_UI_API_OWNER_PATH,
    EDUCATION_UI_API_RESULTS_PATH,EDUCATION_UI_API_GATE_PATH]){
   assert.ok(step("Clear any prior browser and read-only API evidence").includes(name));
   assert.ok(step("Upload sanitized browser acceptance evidence even on a failed test").includes(name));
 }
 for(const cmd of [
  "verifyEducationHostedReadOnly.mjs","verifyEducationHostedEvidence.mjs",
  "verifyEducationHostedFinalResults.mjs","verifyEducationHostedFinalEvidence.mjs",
 ]){
  assert.ok(step("Prove the same staging account boundaries through direct read-only Auth APIs").includes(cmd),cmd);
 }
 assert.ok(step("Reject missing, foreign or incomplete same-run UI and API proof").includes("educationHostedUiApiGate.mjs"));
});
test("network credentials never reach npm, build server, artifact upload or gate",()=>{
 const stepNames=[
  "Install pinned frontend dependencies without staging credentials",
  "Prepare browser executable without real account credentials",
  "Start local staging-targeted preview with no account credentials",
  "Clear any prior browser and read-only API evidence",
  "Reject missing, foreign or incomplete same-run UI and API proof",
  "Upload sanitized browser acceptance evidence even on a failed test",
 ];
 for(const name of stepNames)assert.doesNotMatch(step(name),/\$\{\{\s*secrets\./,name);
 const actual=step("Prove the same staging account boundaries through direct read-only Auth APIs");
 for(const name of ["ETERNYX_RLS_TEST_A_PASSWORD","ETERNYX_RLS_TEST_B_PASSWORD",
  "ETERNYX_RLS_STAGING_URL","ETERNYX_RLS_STAGING_PUBLISHABLE_KEY"])
  assert.ok(actual.includes("          "+name+": \${{ secrets."+name+" }}"));
 assert.doesNotMatch(actual,/INSTRUCTOR_PASSWORD|SERVICE_ROLE_KEY|DB_PASSWORD|STAGING_DB_PASSWORD/);
 assert.doesNotMatch(wf,/VITE_SUPABASE_SERVICE_ROLE|VITE_SUPABASE_DB_PASSWORD|ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY/);
 assert.match(code,/rmSync\(EDUCATION_UI_API_GATE_PATH,\{force:true\}\)/);
 assert.match(code,/GITHUB_REF!=="refs\/heads\/main"/);
});
