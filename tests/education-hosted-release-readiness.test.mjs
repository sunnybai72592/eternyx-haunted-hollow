import test from "node:test";
import assert from "node:assert/strict";
import { EDUCATION_RELEASE_STAGES, summarizeEducationReleaseEvidence,
  validateEducationReleaseConfig } from "../scripts/staging/educationReleaseGate.mjs";

const p={sha:"a".repeat(40),runId:"101",attempt:"1"};
import { DATABASE_CHECKS, validateEducationDbSnapshot, assertEducationDbEvidence } from "../scripts/staging/educationHostedDbMetadata.mjs";
import {readFileSync} from "node:fs";
const dbEvidence=()=>validateEducationDbSnapshot({
  schema:1,checks:Object.fromEntries(DATABASE_CHECKS.map(k=>[k,true])),
},p);
const releaseRunner=readFileSync(new URL("../scripts/staging/runEducationHostedRelease.mjs",import.meta.url),"utf8");
const releaseFlow=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");

function artifact(s,mode) {
  return {
    schema:1,suite:s.suite,environment:"isolated-supabase-staging",
    ...(s.mode?{mode:s.mode}:{}),configured:true,
    production_tested:false,production_certified:false,
    sessions_signed_out:true,expected_cases:s.cases.length,
    attempted_cases:s.cases.length,passed_cases:s.cases.length,
    results:s.cases.map(name=>({case:name,result:"passed"})),
    writes_performed:false,staged_sql_deployed_by_test:false,
    distinct_authenticated_students:true,
    ...(s.id.startsWith("cbt-")?{
      education_writes_attempted:mode!=="preflight",
      synthetic_attempt_confirmed:mode!=="preflight",
      hosted_sql_deployed_by_test:false,
    }:{}),
    ...(s.id==="instructor-review"?{
      instructor_review_write_attempted:true,instructor_review_write_confirmed:true,
      trusted_finalizer_invoked:false,three_distinct_authenticated_accounts:true,
    }:{}),
    ...(s.id==="trusted-finalize"?{
      privileged_rpc_attempted:true,privileged_rpc_confirmed:true,
      schema_deployed_by_test:false,three_distinct_authenticated_accounts:true,
    }:{}),
  };
}
const evidence=mode=>EDUCATION_RELEASE_STAGES[mode].map(s=>artifact(s,mode));

test("read-only preflight is not release clearance",()=>{
  const result=summarizeEducationReleaseEvidence("preflight",evidence("preflight"),p,dbEvidence());
  assert.equal(result.outcome,"read_only_preflight_passed");
  assert.equal(result.production_release_approved,false);
  assert.equal(result.verified_stages.length,3);
});
test("all real hosted stage reports required for rehearsal",()=>{
  const result=summarizeEducationReleaseEvidence("rehearsal",evidence("rehearsal"),p,dbEvidence());
  assert.equal(result.outcome,"staging_rehearsal_passed");
  assert.equal(result.production_release_approved,false);
  assert.equal(result.verified_stages.length,5);
});
test("cannot mistake preflight for a real student write",()=>{
  const e=evidence("rehearsal");e[1].mode="preflight";
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p,dbEvidence()));
});
test("cannot mistake instructor preflight for reviewed written response",()=>{
  const e=evidence("rehearsal");e[2].instructor_review_write_confirmed=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p,dbEvidence()));
});
test("cannot mistake uninvoked privileged finalizer for official grade",()=>{
  const e=evidence("rehearsal");e[3].privileged_rpc_confirmed=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p,dbEvidence()));
});
test("rejects partial, shuffled, failed, and foreign hosted evidence",()=>{
  const a=evidence("rehearsal");assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",a.slice(1),p,dbEvidence()));
  const b=evidence("preflight");b.reverse();assert.throws(()=>summarizeEducationReleaseEvidence("preflight",b,p,dbEvidence()));
  const c=evidence("preflight");c[0].results[0].result="failed";assert.throws(()=>summarizeEducationReleaseEvidence("preflight",c,p,dbEvidence()));
  const d=evidence("preflight");d[0].environment="production";assert.throws(()=>summarizeEducationReleaseEvidence("preflight",d,p,dbEvidence()));
});
test("rejects invalid provenance, apparent production proof and missing signout",()=>{
  const e=evidence("preflight");
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,{...p,sha:"notsha"},dbEvidence()));
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,{...p,runId:"0"},dbEvidence()));
  e[0].production_certified=true;
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,p,dbEvidence()));
  e[0].production_certified=false;e[0].sessions_signed_out=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,p,dbEvidence()));
});
test("config never accepts absent manual staging approval",()=>{
  assert.throws(()=>validateEducationReleaseConfig({}));
  assert.throws(()=>validateEducationReleaseConfig({ETERNYX_EDU_RELEASE_MODE:"rehearsal"}));
});

// Independent verdict evidence must be from the same GitHub SHA/run/attempt.
test("combined release summary requires matching hosted DB audit evidence",()=>{
  for(const mode of ["preflight","rehearsal"]){
    const report=summarizeEducationReleaseEvidence(mode,evidence(mode),p,dbEvidence());
    assert.deepEqual(report.database_metadata_gate,{status:"passed",checks:DATABASE_CHECKS.length});
    assert.equal(report.production_release_approved,false);
    assert.throws(()=>summarizeEducationReleaseEvidence(mode,evidence(mode),p,undefined));
    for(const mutate of [
      x=>{x.github_run_id="999";},
      x=>{x.github_run_attempt="2";},
      x=>{x.source_sha="b".repeat(40);},
      x=>{x.results[0].result="failed";},
      x=>{x.results.pop();},
      x=>{x.results[1].check="unknown";},
      x=>{x.production_certified=true;},
      x=>{x.results[0].secret="sensitive";},
      x=>{x.sql="untrusted";},
    ]){
      const copy=structuredClone(dbEvidence());mutate(copy);
      assert.throws(()=>summarizeEducationReleaseEvidence(mode,evidence(mode),p,copy));
    }
  }
});
test("metadata gate happens before first hosted rehearsal stage, never after writes",()=>{
  const check=releaseRunner.indexOf("assertEducationDbEvidence(dbEvidence,provenance)");
  const stage=releaseRunner.indexOf("for(const stage of stages)");
  assert.ok(check>0 && stage>check);
  assert.match(releaseRunner,/ETERNYX_EDU_STAGING_DB_PASSWORD:""/);
  assert.match(releaseRunner,/stage.id==="trusted-finalize"/);
  assert.match(releaseFlow,/node scripts\/staging\/educationHostedDbMetadata\.mjs/);
  assert.match(releaseFlow,/node scripts\/staging\/runEducationHostedRelease\.mjs/);
  const auditStep=releaseFlow.split("      - name: Verify real staging database RLS")[1]
    .split("      - name: Run ordered real-JWT")[0];
  assert.match(auditStep,/env:\s+ETERNYX_EDU_STAGING_DB_PASSWORD: \$\{\{ secrets\.ETERNYX_EDU_STAGING_DB_PASSWORD \}\}/);
  const studentStep=releaseFlow.split("      - name: Run ordered real-JWT")[1];
  assert.doesNotMatch(studentStep,/ETERNYX_EDU_STAGING_DB_PASSWORD/);
});
test("strict audit evidence rejects altered fields and missing run context",()=>{
  assert.equal(assertEducationDbEvidence(dbEvidence(),p),true);
  assert.throws(()=>assertEducationDbEvidence(dbEvidence(),{...p,runId:"0"}));
  assert.throws(()=>assertEducationDbEvidence(dbEvidence(),{...p,attempt:"2"}));
});

import {HANDOFF_PATH,JOURNEY_APPROVAL,makeJourneyHandoff,
  verifyJourneyHandoff,journeyStageEnv} from "../scripts/staging/educationJourneyHandoff.mjs";
const journeyConfig=()=>({
  GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"101",GITHUB_RUN_ATTEMPT:"1",
  ETERNYX_EDU_RELEASE_MODE:"journey",ETERNYX_EDU_JOURNEY_APPROVAL:JOURNEY_APPROVAL,
  ETERNYX_EDU_WRITE_TEST_ID:"10000000-0000-4000-8000-000000000001",
  ETERNYX_EDU_REVIEW_ATTEMPT_ID:"10000000-0000-4000-8000-000000000002",
  ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT:"10000000-0000-4000-8000-000000000002",
  ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT:"10000000-0000-4000-8000-000000000003",
  ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT:"10000000-0000-4000-8000-000000000004",
  ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT:"10000000-0000-4000-8000-000000000005",
  ETERNYX_EDU_STAGING_ATTEMPT_ID:"10000000-0000-4000-8000-000000000006",
});
const newHandoff=()=>makeJourneyHandoff(journeyConfig(),
  "10000000-0000-4000-8000-000000000007",
  "10000000-0000-4000-8000-000000000008");
test("journey requires five real hosted stages, with no production authorization",()=>{
 assert.deepEqual(EDUCATION_RELEASE_STAGES.journey,EDUCATION_RELEASE_STAGES.rehearsal);
 const result=summarizeEducationReleaseEvidence("journey",evidence("journey"),p,dbEvidence(),true);
 assert.equal(result.outcome,"staging_single_attempt_journey_passed");
 assert.equal(result.single_new_attempt_lifecycle_verified,true);
 assert.equal(result.production_release_approved,false);
 assert.throws(()=>summarizeEducationReleaseEvidence("journey",evidence("journey"),p,dbEvidence()));
});
test("private handoff requires same exact source run and fresh fixture IDs",()=>{
 const env=journeyConfig(),valid=newHandoff();
 assert.equal(verifyJourneyHandoff(env,valid),true);
 for(const change of [
  x=>{x.sha="b".repeat(40);},
  x=>{x.run="102";},
  x=>{x.iteration="2";},
  x=>{x.testId="10000000-0000-4000-8000-000000000009";},
  x=>{x.attemptId=env.ETERNYX_EDU_REVIEW_ATTEMPT_ID;},
  x=>{x.attemptId=env.ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT;},
  x=>{x.answerId=x.attemptId;},
  x=>{x.attemptId="invalid";},
  x=>{x.extra="not-allowed";},
 ]){
  const altered={...valid};change(altered);
  assert.throws(()=>verifyJourneyHandoff(env,altered));
 }
 assert.throws(()=>verifyJourneyHandoff({...env,ETERNYX_EDU_JOURNEY_APPROVAL:""},valid));
});
test("same newly submitted attempt links instructor review and final results",()=>{
 const env=journeyConfig(),h=newHandoff(),linked=journeyStageEnv(env,h);
 assert.equal(linked.ETERNYX_EDU_REVIEW_TEST_ID,h.testId);
 assert.equal(linked.ETERNYX_EDU_REVIEW_ATTEMPT_ID,h.attemptId);
 assert.equal(linked.ETERNYX_EDU_REVIEW_ANSWER_ID,h.answerId);
 assert.equal(linked.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT,h.attemptId);
 assert.equal(env.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT,
 "10000000-0000-4000-8000-000000000002");
});
test("private journey data is never uploaded in hosted release workflow",()=>{
 const runner=readFileSync(new URL("../scripts/staging/runEducationHostedRelease.mjs",import.meta.url),"utf8");
 const cbt=readFileSync(new URL("../scripts/staging/verifyEducationHostedCbtWrite.mjs",import.meta.url),"utf8");
 const wf=readFileSync(new URL("../.github/workflows/education-hosted-release-readiness.yml",import.meta.url),"utf8");
 assert.match(runner,/verifyJourneyHandoff/);
 assert.match(runner,/rmSync\(HANDOFF_PATH,\{force:true\}\)/);
 assert.match(cbt,/mode:0o600,flag:"wx"/);
 assert.match(wf,/approve_single_attempt_journey/);
 assert.match(wf,/- journey/);
 assert.equal(wf.includes(HANDOFF_PATH),false);
});
