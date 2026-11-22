import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RESULTS_READ_APPROVAL, RESULTS_CASES, validateEducationResultsReadConfig,
} from "../scripts/staging/educationHostedResultsConfig.mjs";
import {
  validateStagingRlsConfig,
  STAGING_RLS_APPROVAL,
} from "../scripts/staging/stagingRlsConfig.mjs";

const read = path => readFileSync(new URL("../"+path,import.meta.url),"utf8");
const runner=read("scripts/staging/verifyEducationHostedFinalResults.mjs");
const workflow=read(".github/workflows/education-hosted-final-results.yml");
const evidence=read("scripts/staging/verifyEducationHostedFinalEvidence.mjs");
const docs=read("docs/EDUCATION_HOSTED_FINAL_RESULTS_ACCEPTANCE.md");
const verifier=new URL("../scripts/staging/verifyEducationHostedFinalEvidence.mjs",import.meta.url).pathname;
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const base=()=>({
  ETERNYX_EDU_RESULTS_READ_APPROVAL:RESULTS_READ_APPROVAL,
  ETERNYX_RLS_STAGING_REF:"a".repeat(20),
  ETERNYX_RLS_PRODUCTION_REF:"b".repeat(20),
  ETERNYX_RLS_STAGING_URL:"https://"+"a".repeat(20)+".supabase.co",
  ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_staging-only-public-key",
  ETERNYX_RLS_TEST_A_EMAIL:"rls-edu-results-a@example.com",
  ETERNYX_RLS_TEST_A_PASSWORD:"this-is-a-long-staging-password",
  ETERNYX_RLS_TEST_B_EMAIL:"rls-edu-results-b@example.com",
  ETERNYX_RLS_TEST_B_PASSWORD:"this-is-another-long-staging-password",
  ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT:uuid(1),
  ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT:uuid(2),
  ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT:uuid(3),
  ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT:uuid(4),
  ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT:uuid(5),
  ETERNYX_EDU_RESULT_A_SCORE:"7",
  ETERNYX_EDU_RESULT_A_MAX:"10",
  ETERNYX_EDU_RESULT_B_SCORE:"1",
  ETERNYX_EDU_RESULT_B_MAX:"1",
});
test("staging validator reuses exact nonproduction ref fingerprint and public-key guard",()=>{
  const config=validateEducationResultsReadConfig(base());
  assert.equal(config.url,"https://"+"a".repeat(20)+".supabase.co");
  assert.deepEqual(config.marks,{aScore:7,aMax:10,bScore:1,bMax:1});
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.fixture) &&
    Object.isFrozen(config.marks));
});
test("result read approval never grants permissions to the separate staging write runner",()=>{
  assert.throws(()=>validateStagingRlsConfig(base()),/owner approval/);
  const x=base();x.ETERNYX_RLS_STAGING_APPROVAL=STAGING_RLS_APPROVAL;
  assert.doesNotThrow(()=>validateStagingRlsConfig(x));
});
test("missing, imprecise or write-only approval fails closed",()=>{
  for(const value of ["","true",STAGING_RLS_APPROVAL,undefined]){
    const x=base();x.ETERNYX_EDU_RESULTS_READ_APPROVAL=value;
    assert.throws(()=>validateEducationResultsReadConfig(x),/read-only approval/);
  }
});
test("production identity, malformed host, privileged key and real user account are refused",()=>{
  const a=base();a.ETERNYX_RLS_PRODUCTION_REF=a.ETERNYX_RLS_STAGING_REF;
  assert.throws(()=>validateEducationResultsReadConfig(a));
  const b=base();b.ETERNYX_RLS_STAGING_URL="http://"+"a".repeat(20)+".supabase.co";
  assert.throws(()=>validateEducationResultsReadConfig(b));
  const c=base();c.ETERNYX_RLS_STAGING_PUBLISHABLE_KEY="sb_secret_forbidden";
  assert.throws(()=>validateEducationResultsReadConfig(c));
  const d=base();d.ETERNYX_RLS_TEST_A_EMAIL="customer@example.com";
  assert.throws(()=>validateEducationResultsReadConfig(d));
  const e=base();e.ETERNYX_RLS_STAGING_REF="wcncuarekaofmfurbtbh";
  e.ETERNYX_RLS_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co";
  assert.throws(()=>validateEducationResultsReadConfig(e));
});
test("all five reviewed fixture IDs must be valid and unique",()=>{
  const keys=["FINAL_A","FINAL_B","PENDING_A","RUNNING_A","LEGACY_A"];
  for(const key of keys){
    const x=base();delete x["ETERNYX_EDU_RESULT_"+key+"_ATTEMPT"];
    assert.throws(()=>validateEducationResultsReadConfig(x),/fixture/);
    const y=base();y["ETERNYX_EDU_RESULT_"+key+"_ATTEMPT"]="not-an-id";
    assert.throws(()=>validateEducationResultsReadConfig(y),/fixture/);
  }
  const z=base();
  z.ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT=z.ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT;
  assert.throws(()=>validateEducationResultsReadConfig(z),/distinct/);
});
test("grade expectations reject malformed, fractional, negative and greater-than-maximum values",()=>{
  const fields=["A_SCORE","A_MAX","B_SCORE","B_MAX"];
  for(const field of fields){
    for(const val of ["-1","1.5","Infinity","9999999"," 7",undefined]){
      const x=base();x["ETERNYX_EDU_RESULT_"+field]=val;
      assert.throws(()=>validateEducationResultsReadConfig(x));
    }
  }
  const x=base();x.ETERNYX_EDU_RESULT_A_SCORE="11";
  assert.throws(()=>validateEducationResultsReadConfig(x),/inconsistent/);
  const y=base();y.ETERNYX_EDU_RESULT_B_MAX="0";
  assert.throws(()=>validateEducationResultsReadConfig(y),/inconsistent/);
});
test("all 26 evidence cases have exact independent student and anonymous boundaries",()=>{
  assert.equal(RESULTS_CASES.length,26);
  assert.equal(new Set(RESULTS_CASES).size,RESULTS_CASES.length);
  for(const key of [
    "student-b-denied-a-final","student-a-denied-b-final",
    "student-a-pending-no-score","student-a-in-progress-no-score",
    "student-a-legacy-no-score","anonymous-rpc-denied",
    "student-a-direct-ledger-denied","student-b-direct-ledger-denied",
    "anonymous-direct-ledger-denied","both-authenticated-sessions-signed-out",
  ]) assert.ok(RESULTS_CASES.includes(key),key);
});
test("the actual runner uses independent real Supabase Auth JWT identities",()=>{
  assert.match(runner,/signInWithPassword\(config\.accounts\[index\]\)/);
  assert.match(runner,/c\.auth\.getUser\(\)/);
  assert.match(runner,/identities\[0\]!==identities\[1\]/);
  assert.match(runner,/createClient\(config\.url,config\.publishableKey/);
  assert.match(runner,/autoRefreshToken:false/);
  assert.match(runner,/c\.auth\.signOut\(\)/);
});
test("nonfinal states enforce exact five-field null score and timestamps",()=>{
  assert.match(runner,/Object\.keys\(receipt\)\.sort\(\)/);
  assert.match(runner,/r\.score===null && r\.max_score===null && r\.finalized_at===null/);
  assert.match(runner,/r\.grade_status===status/);
  assert.match(runner,/Number\.isSafeInteger\(r\.score\)/);
  assert.match(runner,/Date\.parse\(r\.finalized_at\)/);
});
test("ledger denied by real 42501, not by absence of test rows",()=>{
  assert.match(runner,/code === "42501"/);
  assert.match(runner,/c\.from\("education_final_grades"\)/);
  assert.match(runner,/select\("attempt_id,score,max_score"\)/);
  assert.match(runner,/must\(denied\(/);
});
test("hosted runner uses no writes, grading, secret key or admin APIs",()=>{
  assert.doesNotMatch(runner,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.remove\(|\.storage\.|\.functions\.invoke\(|auth\.admin\.|service_role/i);
  assert.doesNotMatch(runner,/JSON\.stringify\(config\)|JSON\.stringify\(identities\)|console\.log\(config\)|console\.log\(auth\)/);
  assert.match(runner,/writes_performed:false/);
  assert.match(runner,/production_certified:false/);
});
test("workflow is explicitly manual, protected and cannot run on merge",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/type: boolean/);
  assert.match(workflow,/default: false/);
  assert.match(workflow,/environment: rls-staging/);
  assert.match(workflow,/permissions:\s+contents: read/);
  assert.match(workflow,/verifyEducationHostedFinalResults\.mjs/);
  assert.match(workflow,/verifyEducationHostedFinalEvidence\.mjs/);
  assert.doesNotMatch(workflow,/\n\s+pull_request:|\n\s+push:|\n\s+schedule:|SERVICE_ROLE/);
});
test("evidence verifier accepts exactly 26 fixed case names and refuses production claims",()=>{
  assert.match(evidence,/RESULTS_CASES\.length/);
  assert.match(evidence,/production_certified !== false/);
  assert.match(evidence,/writes_performed !== false/);
  assert.match(evidence,/sessions_signed_out !== true/);
});
function verify(data){
  const dir=mkdtempSync(join(tmpdir(),"eternyx-evidence-offline-"));
  try {
    mkdirSync(join(dir,"test-results"));
    writeFileSync(join(dir,"test-results/education-hosted-final-results.json"),
      JSON.stringify(data));
    return spawnSync(process.execPath,[verifier],{
      cwd:dir,encoding:"utf8",timeout:10000,
    });
  }finally{rmSync(dir,{recursive:true,force:true});}
}
const good=()=>({
  schema:1,suite:"education-hosted-final-results",environment:"isolated-supabase-staging",
  configured:true,distinct_authenticated_students:true,
  expected_cases:RESULTS_CASES.length,attempted_cases:RESULTS_CASES.length,
  passed_cases:RESULTS_CASES.length,
  results:RESULTS_CASES.map(name=>({case:name,result:"passed"})),
  staged_sql_deployed_by_test:false,writes_performed:false,
  production_tested:false,production_certified:false,sessions_signed_out:true,
});
test("offline evidence contract accepts complete synthetic receipts, without network",()=>{
  assert.equal(verify(good()).status,0);
});
test("offline evidence rejects omitted cases, status failures, extra sensitive fields and false release claims",()=>{
  for(const mutate of [
    o=>{o.results.pop();},
    o=>{o.results[5].result="failed";},
    o=>{o.results[7].case=o.results[6].case;},
    o=>{o.production_certified=true;},
    o=>{o.writes_performed=true;},
    o=>{o.results[0].email="sensitive";},
    o=>{o.access_token="sensitive";},
    o=>{o.sessions_signed_out=false;},
  ]){
    const o=good();mutate(o);
    assert.notEqual(verify(o).status,0);
  }
});
test("staging documentation requires manual approval, real pre-provisioned fixtures and no production claim",()=>{
  assert.match(docs,/pre-provisioned/i);
  assert.match(docs,/manual/i);
  assert.match(docs,/protected.*environment/i);
  assert.match(docs,/production.*not verified/i);
});
test("scripts pass JS syntax checking without credentials or live database",()=>{
  for(const file of [
    "scripts/staging/educationHostedResultsConfig.mjs",
    "scripts/staging/verifyEducationHostedFinalResults.mjs",
    "scripts/staging/verifyEducationHostedFinalEvidence.mjs",
  ]){
    const r=spawnSync(process.execPath,["--check",new URL("../"+file,import.meta.url).pathname],
      {encoding:"utf8",timeout:10000});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});
