import test from "node:test";
import assert from "node:assert/strict";
import { EDUCATION_RELEASE_STAGES, summarizeEducationReleaseEvidence,
  validateEducationReleaseConfig } from "../scripts/staging/educationReleaseGate.mjs";

const p={sha:"a".repeat(40),runId:"101",attempt:"1"};
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
      education_writes_attempted:mode==="rehearsal",
      synthetic_attempt_confirmed:mode==="rehearsal",
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
  const result=summarizeEducationReleaseEvidence("preflight",evidence("preflight"),p);
  assert.equal(result.outcome,"read_only_preflight_passed");
  assert.equal(result.production_release_approved,false);
  assert.equal(result.verified_stages.length,3);
});
test("all real hosted stage reports required for rehearsal",()=>{
  const result=summarizeEducationReleaseEvidence("rehearsal",evidence("rehearsal"),p);
  assert.equal(result.outcome,"staging_rehearsal_passed");
  assert.equal(result.production_release_approved,false);
  assert.equal(result.verified_stages.length,5);
});
test("cannot mistake preflight for a real student write",()=>{
  const e=evidence("rehearsal");e[1].mode="preflight";
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p));
});
test("cannot mistake instructor preflight for reviewed written response",()=>{
  const e=evidence("rehearsal");e[2].instructor_review_write_confirmed=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p));
});
test("cannot mistake uninvoked privileged finalizer for official grade",()=>{
  const e=evidence("rehearsal");e[3].privileged_rpc_confirmed=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",e,p));
});
test("rejects partial, shuffled, failed, and foreign hosted evidence",()=>{
  const a=evidence("rehearsal");assert.throws(()=>summarizeEducationReleaseEvidence("rehearsal",a.slice(1),p));
  const b=evidence("preflight");b.reverse();assert.throws(()=>summarizeEducationReleaseEvidence("preflight",b,p));
  const c=evidence("preflight");c[0].results[0].result="failed";assert.throws(()=>summarizeEducationReleaseEvidence("preflight",c,p));
  const d=evidence("preflight");d[0].environment="production";assert.throws(()=>summarizeEducationReleaseEvidence("preflight",d,p));
});
test("rejects invalid provenance, apparent production proof and missing signout",()=>{
  const e=evidence("preflight");
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,{...p,sha:"notsha"}));
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,{...p,runId:"0"}));
  e[0].production_certified=true;
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,p));
  e[0].production_certified=false;e[0].sessions_signed_out=false;
  assert.throws(()=>summarizeEducationReleaseEvidence("preflight",e,p));
});
test("config never accepts absent manual staging approval",()=>{
  assert.throws(()=>validateEducationReleaseConfig({}));
  assert.throws(()=>validateEducationReleaseConfig({ETERNYX_EDU_RELEASE_MODE:"rehearsal"}));
});
