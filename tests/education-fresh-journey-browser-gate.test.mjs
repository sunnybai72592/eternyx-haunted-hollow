import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {
  PRIVATE_FRESH_JOURNEY_TARGET,FRESH_JOURNEY_BROWSER_EVIDENCE,
  FRESH_JOURNEY_COMBINED_EVIDENCE,FRESH_JOURNEY_BROWSER_CASES,
  makeFreshJourneyTarget,assertFreshJourneyTarget,
  assertFreshJourneyBrowserEvidence,assertFreshJourneyCombinedGate,
} from "../scripts/staging/educationJourneyBrowserGate.mjs";
import {makeJourneyHandoff,JOURNEY_APPROVAL}
  from "../scripts/staging/educationJourneyHandoff.mjs";
import {EDUCATION_RELEASE_STAGES}
  from "../scripts/staging/educationReleaseGate.mjs";
import {DATABASE_CHECKS}
  from "../scripts/staging/educationHostedDbMetadata.mjs";
import {FIXTURE_CHECKS}
  from "../scripts/staging/educationJourneyFixturePreflight.mjs";

const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env=()=>({
  GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"7285",GITHUB_RUN_ATTEMPT:"2",
  GITHUB_REF:"refs/heads/main",
  GITHUB_REPOSITORY:"sunnybai72592/eternyx-haunted-hollow",
  ETERNYX_EDU_RELEASE_MODE:"journey",
  ETERNYX_EDU_JOURNEY_APPROVAL:JOURNEY_APPROVAL,
  ETERNYX_EDU_WRITE_TEST_ID:id(1),
  ETERNYX_EDU_REVIEW_ATTEMPT_ID:id(2),
  ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT:id(2),
  ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT:id(3),
  ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT:id(4),
  ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT:id(5),
  ETERNYX_EDU_STAGING_ATTEMPT_ID:id(6),
  ETERNYX_EDU_FINALIZE_EXPECTED_SCORE:"7",
  ETERNYX_EDU_FINALIZE_EXPECTED_MAX:"10",
  ETERNYX_EDU_RESULT_A_SCORE:"7",
  ETERNYX_EDU_RESULT_A_MAX:"10",
});
const handoff=()=>makeJourneyHandoff(env(),id(7),id(8));
const provenance={sha:"a".repeat(40),runId:"7285",attempt:"2"};
const browser=()=>({
  schema:1,suite:"education-hosted-fresh-journey-browser",
  environment:"isolated-supabase-staging",
  source_sha:provenance.sha,github_run_id:provenance.runId,
  github_run_attempt:provenance.attempt,result:"passed",
  read_only:true,fresh_attempt_verified:true,
  production_tested:false,production_release_approved:false,
  checks:FRESH_JOURNEY_BROWSER_CASES.map(check=>({check,result:"passed"})),
});
const backend=()=>({
  schema:1,suite:"education-hosted-release-readiness",
  environment:"isolated-supabase-staging",mode:"journey",
  source_sha:provenance.sha,github_run_id:provenance.runId,
  github_run_attempt:provenance.attempt,
  outcome:"staging_single_attempt_journey_passed",
  single_new_attempt_lifecycle_verified:true,
  verified_stages:EDUCATION_RELEASE_STAGES.journey.map(stage=>({
    stage:stage.id,passed_cases:stage.cases.length,status:"passed",
  })),
  database_metadata_gate:{status:"passed",checks:DATABASE_CHECKS.length},
  journey_fixture_gate:{status:"passed",checks:FIXTURE_CHECKS.length},
  production_tested:false,production_certified:false,
  production_release_approved:false,
});
const bad=(b,r,p=provenance)=>assert.throws(()=>
  assertFreshJourneyCombinedGate(b,r,p),/fresh-journey/);

test("only a correct, private and brand-new attempt can cross from successful backend to browser",()=>{
  const target=makeFreshJourneyTarget(env(),handoff());
  assert.equal(assertFreshJourneyTarget(target,env()),true);
  assert.equal(target.fresh_attempt_id,id(7));
  assert.equal(target.expected_score,7);
  assert.equal(target.expected_max,10);
  assert.deepEqual(Object.keys(target).sort(),[
    "schema","source_sha","github_run_id","github_run_attempt",
    "fresh_attempt_id","expected_score","expected_max",
  ].sort());
  assert.ok(!JSON.stringify(target).includes("answerId"));
  assert.ok(!JSON.stringify(target).includes("@"));
});

test("new attempt target is pinned to exact run, fixture ID, official score and approval",()=>{
 const original=makeFreshJourneyTarget(env(),handoff());
 for(const mutate of [
  x=>{x.schema=2;},x=>{x.source_sha="b".repeat(40);},
  x=>{x.github_run_id="0";},x=>{x.github_run_attempt="1";},
  x=>{x.fresh_attempt_id=id(2);},
  x=>{x.fresh_attempt_id=id(3);},
  x=>{x.fresh_attempt_id="malformed";},
  x=>{x.expected_score=8;},x=>{x.expected_max=8;},
  x=>{x.secret="leak";},
 ]){
  const altered={...original};mutate(altered);
  assert.throws(()=>assertFreshJourneyTarget(altered,env()));
 }
 for(const mutate of [
  x=>{x.GITHUB_REF="refs/heads/feature";},
  x=>{x.GITHUB_REPOSITORY="another/repository";},
  x=>{x.ETERNYX_EDU_RELEASE_MODE="preflight";},
  x=>{x.ETERNYX_EDU_JOURNEY_APPROVAL="";},
  x=>{x.ETERNYX_EDU_FINALIZE_EXPECTED_SCORE="99";},
  x=>{x.ETERNYX_EDU_RESULT_A_SCORE="99";},
  x=>{x.GITHUB_RUN_ATTEMPT="3";},
 ]){
  const e=env();mutate(e);
  assert.throws(()=>assertFreshJourneyTarget(original,e));
 }
 assert.throws(()=>makeFreshJourneyTarget({...env(),ETERNYX_EDU_RELEASE_MODE:"rehearsal"},handoff()));
});

test("combined verdict requires both complete actual browser and five backend lifecycle stages",()=>{
 const verdict=assertFreshJourneyCombinedGate(browser(),backend(),provenance);
 assert.equal(verdict.outcome,"same_fresh_attempt_browser_and_backend_verified");
 assert.equal(verdict.same_fresh_attempt_verified,true);
 assert.equal(verdict.browser_checks,6);
 assert.equal(verdict.backend_stages,5);
 assert.equal(verdict.irreversible_staging_backend_writes_tested,true);
 assert.equal(verdict.browser_read_only,true);
 assert.equal(verdict.production_tested,false);
 assert.equal(verdict.production_certified,false);
 assert.equal(verdict.production_release_approved,false);
 assert.equal(JSON.stringify(verdict).includes(id(7)),false);
});

test("all tampered, partial or wrong-account browser evidence fails closed",()=>{
 const variants=[
  x=>{x.checks.pop();},
  x=>{x.checks.reverse();},
  x=>{x.checks[0].result="blocked";},
  x=>{x.checks[1].check="student_b_owns_a";},
  x=>{x.checks[1].private_answer="leaked";},
  x=>{x.source_sha="b".repeat(40);},
  x=>{x.github_run_id="999";},
  x=>{x.github_run_attempt="3";},
  x=>{x.result="blocked";},
  x=>{x.read_only=false;},
  x=>{x.fresh_attempt_verified=false;},
  x=>{x.production_release_approved=true;},
  x=>{x.production_tested=true;},
  x=>{x.suite="other";},
  x=>{x.environment="production";},
 ];
 for(const mutate of variants){
  const b=browser();mutate(b);bad(b,backend());
 }
 assert.equal(assertFreshJourneyBrowserEvidence(browser(),provenance),true);
 bad(undefined,backend());
});

test("reject stale backend, failed review, absent finalizer or forged same-run grade clearance",()=>{
 const variants=[
  x=>{x.github_run_attempt="1";},
  x=>{x.github_run_id="999";},
  x=>{x.source_sha="b".repeat(40);},
  x=>{x.mode="rehearsal";},
  x=>{x.outcome="staging_rehearsal_passed";},
  x=>{x.verified_stages.pop();},
  x=>{x.verified_stages.reverse();},
  x=>{x.verified_stages[2].passed_cases--;},
  x=>{x.verified_stages[3].status="blocked";},
  x=>{x.single_new_attempt_lifecycle_verified=false;},
  x=>{x.database_metadata_gate.checks--;},
  x=>{x.journey_fixture_gate.status="blocked";},
  x=>{x.production_certified=true;},
  x=>{x.production_release_approved=true;},
  x=>{x.production_tested=true;},
  x=>{x.extra="private account";},
 ];
 for(const mutate of variants){
  const r=backend();mutate(r);bad(browser(),r);
 }
 bad(browser(),undefined);
 bad(browser(),backend(),{...provenance,runId:"0"});
});

const workflow=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");
const standalone=readFileSync(new URL("../.github/workflows/education-hosted-browser-readonly.yml",import.meta.url),"utf8");
const runner=readFileSync(new URL("../scripts/staging/runEducationHostedRelease.mjs",import.meta.url),"utf8");
const script=readFileSync(new URL("./browser/education_fresh_journey_hosted.py",import.meta.url),"utf8");
const moduleSource=readFileSync(new URL("../scripts/staging/educationJourneyBrowserGate.mjs",import.meta.url),"utf8");
function step(name){
 const at=workflow.indexOf("      - name: "+name+"\n");
 assert.ok(at>=0,"workflow step missing: "+name);
 const end=workflow.indexOf("\n      - ",at+8);
 return workflow.slice(at,end<0?undefined:end);
}
test("workflow runs real-browser journey only after five successful backend stages, with no early writes",()=>{
 const backendStep=workflow.indexOf("Run ordered real-JWT protected backend acceptance");
 const build=workflow.indexOf("Build disposable frontend against staging only");
 const browser=workflow.indexOf("Verify newly finalized owned attempt in real desktop and mobile browser");
 const gate=workflow.indexOf("Refuse a full staging journey verdict without fresh-attempt browser proof");
 const cleanup=workflow.indexOf("Erase protected fresh-attempt handoff");
 const upload=workflow.indexOf("Upload sanitized same-run evidence for independent review");
 const launch=workflow.indexOf("Prove Chromium can launch locally before consuming the synthetic attempt");
 const preview=workflow.indexOf("Start local staging-targeted journey UI preview");
 assert.ok(build>0 && preview>build && launch>preview && backendStep>launch && browser>backendStep &&
   gate>browser && cleanup>gate && upload>cleanup);
 assert.match(workflow,/environment: rls-staging/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/approve_single_attempt_journey/);
 assert.match(workflow,/acknowledge_immutable_grade/);
 for(const label of [
  "Build disposable frontend against staging only for the newly finalized attempt",
  "Install isolated Chromium for fresh staging journey without credentials",
  "Start local staging-targeted journey UI preview with no account credentials",
  "Prove Chromium can launch locally before consuming the synthetic attempt",
  "Verify newly finalized owned attempt in real desktop and mobile browser",
  "Refuse a full staging journey verdict without fresh-attempt browser proof",
 ])assert.match(step(label),/if: inputs\.run_mode == 'journey'/);
 assert.match(step("Erase protected fresh-attempt handoff before any artifact upload"),
   /if: always\(\)/);
 assert.match(workflow,/rm -f test-results\/education-journey-ui-target-private\.json/);
 assert.ok(!step("Upload sanitized same-run evidence for independent review").includes(PRIVATE_FRESH_JOURNEY_TARGET));
 assert.ok(step("Upload sanitized same-run evidence for independent review").includes(FRESH_JOURNEY_BROWSER_EVIDENCE));
 assert.ok(step("Upload sanitized same-run evidence for independent review").includes(FRESH_JOURNEY_COMBINED_EVIDENCE));
});

test("private handoff created ONLY after complete backend proof, erased on all errors",()=>{
 const evidence=runner.indexOf("summarizeEducationReleaseEvidence(");
 const fresh=runner.indexOf("saveFreshJourneyTarget(process.env,journeyHandoff)");
 assert.ok(evidence>0 && fresh>evidence);
 assert.match(runner,/if\(config.mode==="journey"\)/);
 assert.match(runner,/verifyJourneyHandoff\(process\.env,handoff\)/);
 assert.match(runner,/rmSync\(PRIVATE_FRESH_JOURNEY_TARGET,\{force:true\}\)/);
 assert.match(moduleSource,/mode:0o600,flag:"wx"/);
 assert.match(moduleSource,/rmSync\(FRESH_JOURNEY_COMBINED_EVIDENCE,\{force:true\}\)/);
 assert.match(moduleSource,/outcome:"same_fresh_attempt_browser_and_backend_verified"/);
});

test("new Chrome frontend uses staging public key but neither service role nor DB credentials",()=>{
 const build=step("Build disposable frontend against staging only for the newly finalized attempt");
 for(const key of ["VITE_CBT_ATOMIC_RPC","VITE_EDUCATION_INSTRUCTOR_RPC",
   "VITE_EDUCATION_PUBLICATION_RPC","VITE_EDUCATION_WRITTEN_REVIEW_RPC",
   "VITE_EDUCATION_VERIFIED_RESULTS_RPC"])
  assert.ok(build.includes(key+': "true"'),key);
 assert.match(build,/VITE_SUPABASE_URL: \$\{\{ secrets\.ETERNYX_RLS_STAGING_URL \}\}/);
 assert.match(build,/VITE_SUPABASE_PUBLISHABLE_KEY: \$\{\{ secrets\.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY \}\}/);
 const browserStep=step("Verify newly finalized owned attempt in real desktop and mobile browser");
 assert.match(browserStep,/ETERNYX_RLS_TEST_A_PASSWORD/);
 assert.match(browserStep,/ETERNYX_RLS_TEST_B_PASSWORD/);
 for(const label of [
  "Install isolated Chromium for fresh staging journey without credentials",
  "Start local staging-targeted journey UI preview with no account credentials",
  "Prove Chromium can launch locally before consuming the synthetic attempt",
  "Refuse a full staging journey verdict without fresh-attempt browser proof",
 ])
  assert.doesNotMatch(step(label),/\$\{\{\s*secrets\./,label);
 assert.doesNotMatch(browserStep,/SERVICE_ROLE|DB_PASSWORD|INSTRUCTOR_PASSWORD/);
 assert.doesNotMatch(build,/SERVICE_ROLE|DB_PASSWORD|TEST_A_PASSWORD|INSTRUCTOR_PASSWORD/);
});

test("both real hosted Chromium workflows actually install browser binary, not just Python package",()=>{
 assert.match(standalone,/python" -m playwright install --with-deps chromium/);
 assert.match(workflow,/python" -m playwright install --with-deps chromium/);
});

test("private student browser exercises EXACT fresh receipt and denies B in both viewports",()=>{
 assert.equal(FRESH_JOURNEY_BROWSER_CASES.length,6);
 for(const name of FRESH_JOURNEY_BROWSER_CASES) assert.ok(script.includes('"'+name+'"'),name);
 assert.match(script,/1440.*900/);
 assert.match(script,/390.*844/);
 assert.match(script,/login\(page,email,password\)/);
 assert.match(script,/expect_ledger_grade\(page,attempt_id,target\["expected_score"\]/);
 assert.match(script,/expect_denied\(page,attempt_id\)/);
 assert.match(script,/guard_request\(route,staging_host,violations\)/);
 assert.match(script,/context\.close\(\)/);
 assert.match(script,/fresh_attempt_verified":status=="passed"/);
 assert.match(script,/production_release_approved":False/);
 assert.doesNotMatch(script,/requests\.|urllib\.request|screenshot|video|storage_state|service_role/);
});

test("Python browser syntax compiles offline with zero real accounts",()=>{
 const path=fileURLToPath(new URL("./browser/education_fresh_journey_hosted.py",import.meta.url));
 const r=spawnSync("python3",["-m","py_compile",path],{encoding:"utf8",timeout:10000});
 if(r.error?.code==="ENOENT")return;
 assert.equal(r.status,0,"Fresh-journey real Chromium source must compile without credentials");
});
