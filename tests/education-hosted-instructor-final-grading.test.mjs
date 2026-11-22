import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
  REVIEW_WRITE_APPROVAL,REVIEW_WRITE_ACK,REVIEW_STAGE_CASES,
  validateEducationHostedReviewConfig,
} from "../scripts/staging/educationHostedReviewConfig.mjs";
import {validateStagingRlsConfig} from "../scripts/staging/stagingRlsConfig.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const runner=read("scripts/staging/verifyEducationHostedInstructorGrading.mjs");
const workflow=read(".github/workflows/education-hosted-instructor-final-grading.yml");
const doc=read("docs/EDUCATION_HOSTED_INSTRUCTOR_FINAL_GRADING.md");
const evidence=read("scripts/staging/verifyEducationHostedInstructorEvidence.mjs");
const verifier=new URL("../scripts/staging/verifyEducationHostedInstructorEvidence.mjs",import.meta.url).pathname;
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env=()=>({
  ETERNYX_EDU_REVIEW_MODE:"preflight",
  ETERNYX_RLS_STAGING_REF:"a".repeat(20),
  ETERNYX_RLS_PRODUCTION_REF:"b".repeat(20),
  ETERNYX_RLS_STAGING_URL:"https://"+"a".repeat(20)+".supabase.co",
  ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_for_test",
  ETERNYX_RLS_TEST_A_EMAIL:"rls-student-a@example.com",
  ETERNYX_RLS_TEST_A_PASSWORD:"staging-test-student-a-pass",
  ETERNYX_RLS_TEST_B_EMAIL:"rls-student-b@example.com",
  ETERNYX_RLS_TEST_B_PASSWORD:"staging-test-student-b-pass",
  ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-instructor@example.com",
  ETERNYX_RLS_INSTRUCTOR_PASSWORD:"staging-instructor-secret-test",
  ETERNYX_EDU_REVIEW_TEST_ID:id(1),
  ETERNYX_EDU_REVIEW_ATTEMPT_ID:id(2),
  ETERNYX_EDU_REVIEW_ANSWER_ID:id(3),
  ETERNYX_EDU_REVIEW_AWARDED_POINTS:"1",
});
function reviewEnv(){
  return {...env(),ETERNYX_EDU_REVIEW_MODE:"review",
    ETERNYX_EDU_REVIEW_WRITE_APPROVAL:REVIEW_WRITE_APPROVAL,
    ETERNYX_EDU_REVIEW_WRITE_ACK:REVIEW_WRITE_ACK};
}
function verifiedEnv(){
  return {...env(),ETERNYX_EDU_REVIEW_MODE:"verify",
    ETERNYX_EDU_REVIEW_FINAL_SCORE:"6",ETERNYX_EDU_REVIEW_FINAL_MAX:"10"};
}
test("1: preflight is read-only, relies on independently hosted synthetic fixture",()=>{
  const c=validateEducationHostedReviewConfig(env());
  assert.equal(c.mode,"preflight");
  assert.equal(c.awarded,1);
  assert.deepEqual(c.fixture,{testId:id(1),attemptId:id(2),answerId:id(3)});
  assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.fixture));
  assert.equal(c.expectedCases.length,16);
});
test("2: explicit instructor review requires both distinct approvals",()=>{
  const a=env();a.ETERNYX_EDU_REVIEW_MODE="review";
  assert.throws(()=>validateEducationHostedReviewConfig(a));
  a.ETERNYX_EDU_REVIEW_WRITE_APPROVAL=REVIEW_WRITE_APPROVAL;
  assert.throws(()=>validateEducationHostedReviewConfig(a));
  a.ETERNYX_EDU_REVIEW_WRITE_ACK=REVIEW_WRITE_ACK;
  assert.equal(validateEducationHostedReviewConfig(a).mode,"review");
  assert.equal(validateEducationHostedReviewConfig(a).expectedCases.length,28);
});
test("3: write approval flags never activate reads-only preflight or verify",()=>{
  const a={...env(),ETERNYX_EDU_REVIEW_WRITE_APPROVAL:REVIEW_WRITE_APPROVAL,
    ETERNYX_EDU_REVIEW_WRITE_ACK:REVIEW_WRITE_ACK};
  assert.equal(validateEducationHostedReviewConfig(a).mode,"preflight");
  assert.equal(validateEducationHostedReviewConfig({...verifiedEnv(),...{
    ETERNYX_EDU_REVIEW_WRITE_APPROVAL:REVIEW_WRITE_APPROVAL,
    ETERNYX_EDU_REVIEW_WRITE_ACK:REVIEW_WRITE_ACK}}).mode,"verify");
});
test("4: verify requires reviewed fixture score and max, never invokes grading worker",()=>{
  assert.throws(()=>validateEducationHostedReviewConfig({...env(),ETERNYX_EDU_REVIEW_MODE:"verify"}));
  const c=validateEducationHostedReviewConfig(verifiedEnv());
  assert.deepEqual(c.marks,{score:6,max:10});
  assert.equal(c.expectedCases.length,26);
  assert.match(runner,/trusted_finalizer_invoked:false/);
  assert.doesNotMatch(runner,/education_finalize_cbt_grade/);
});
test("5: missing and malformed run modes are rejected",()=>{
  for(const value of [undefined,null,"","WRITE","grade","finalize","production","readonly"]){
    const x=env();x.ETERNYX_EDU_REVIEW_MODE=value;
    assert.throws(()=>validateEducationHostedReviewConfig(x));
  }
});
test("6: no production ref, unsafe host, secret-key or non-dedicated account",()=>{
  const cases=[
    ["ETERNYX_RLS_PRODUCTION_REF","a".repeat(20)],
    ["ETERNYX_RLS_STAGING_URL","http://"+"a".repeat(20)+".supabase.co"],
    ["ETERNYX_RLS_STAGING_URL","https://example.com"],
    ["ETERNYX_RLS_STAGING_PUBLISHABLE_KEY","sb_secret_forbidden"],
    ["ETERNYX_RLS_INSTRUCTOR_EMAIL","real-instructor@example.com"],
    ["ETERNYX_RLS_INSTRUCTOR_PASSWORD","short"],
    ["ETERNYX_RLS_INSTRUCTOR_EMAIL","rls-student-a@example.com"],
  ];
  for(const [key,value] of cases){
    const x=env();x[key]=value;
    assert.throws(()=>validateEducationHostedReviewConfig(x),key);
  }
  const x=env();x.ETERNYX_RLS_STAGING_REF="wcncuarekaofmfurbtbh";
  x.ETERNYX_RLS_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co";
  assert.throws(()=>validateEducationHostedReviewConfig(x));
});
test("7: fixture test, attempt and answer identifiers must be valid and unique",()=>{
  const keys=["ETERNYX_EDU_REVIEW_TEST_ID","ETERNYX_EDU_REVIEW_ATTEMPT_ID",
    "ETERNYX_EDU_REVIEW_ANSWER_ID"];
  for(const key of keys){
    const a=env();delete a[key];assert.throws(()=>validateEducationHostedReviewConfig(a));
    const b=env();b[key]="not-a-uuid";assert.throws(()=>validateEducationHostedReviewConfig(b));
  }
  const c=env();c.ETERNYX_EDU_REVIEW_ANSWER_ID=c.ETERNYX_EDU_REVIEW_ATTEMPT_ID;
  assert.throws(()=>validateEducationHostedReviewConfig(c));
});
test("8: invalid review point and finalized score values are refused",()=>{
  for(const invalid of ["-1","1.5","NaN","1001","1000000","01",undefined]){
    const a=env();a.ETERNYX_EDU_REVIEW_AWARDED_POINTS=invalid;
    assert.throws(()=>validateEducationHostedReviewConfig(a));
  }
  for(const bad of ["-1","1.5","Infinity","1000000",undefined]){
    const a=verifiedEnv();a.ETERNYX_EDU_REVIEW_FINAL_SCORE=bad;
    assert.throws(()=>validateEducationHostedReviewConfig(a));
  }
  const a=verifiedEnv();a.ETERNYX_EDU_REVIEW_FINAL_SCORE="11";
  assert.throws(()=>validateEducationHostedReviewConfig(a));
  const b=verifiedEnv();b.ETERNYX_EDU_REVIEW_FINAL_MAX="0";
  assert.throws(()=>validateEducationHostedReviewConfig(b));
});
test("9: review approval is not general-purpose fixture write approval",()=>{
  assert.throws(()=>validateStagingRlsConfig(reviewEnv()));
});
test("10: three modes have unique fixed audited case names",()=>{
  assert.equal(REVIEW_STAGE_CASES.preflight.length,16);
  assert.equal(REVIEW_STAGE_CASES.review.length,28);
  assert.equal(REVIEW_STAGE_CASES.verify.length,26);
  for(const [mode,cases] of Object.entries(REVIEW_STAGE_CASES)){
    assert.equal(new Set(cases).size,cases.length,mode);
    assert.equal(cases.at(-1),"three-auth-sessions-signed-out");
  }
});
test("11: three Auth identities are independently verified by real Supabase",()=>{
  assert.match(runner,/c\.auth\.signInWithPassword\(creds\[i\]\)/);
  assert.match(runner,/c\.auth\.getUser\(\)/);
  assert.match(runner,/new Set\(users\)\.size===3/);
  assert.match(runner,/studentA=client\(config\);studentB=client\(config\);owner=client\(config\)/);
  assert.match(runner,/autoRefreshToken:false/);
});
test("12: trusted teacher and student role boundaries validated before review",()=>{
  assert.match(runner,/owner\.rpc\("education_instructor_access"\)/);
  assert.match(runner,/owner\.rpc\("is_admin"\)/);
  assert.match(runner,/student-a-is-not-an-instructor/);
  assert.match(runner,/student-b-is-not-an-instructor/);
  assert.match(runner,/student-a-owns-submitted-attempt/);
  assert.match(runner,/instructor-owns-submitted-review-queue-item/);
});
test("13: stage fixture is an actual written response owned by the student",()=>{
  assert.match(runner,/r\[0\]\.attempt_id===f\.attemptId/);
  assert.match(runner,/question\[0\]\.question_type==="short_answer"/);
  assert.match(runner,/typeof matches\[0\]\.response_text==="string"/);
  assert.match(runner,/matches\.length===1/);
});
test("14: learners and anon cannot read private reviews or grade each other",()=>{
  for(const name of [
    "student-b-cannot-read-a-attempt",
    "student-b-cannot-read-a-written-answer",
    "student-a-cannot-select-private-review-table",
    "student-b-cannot-select-private-review-table",
    "anonymous-cannot-select-private-review-table",
    "student-a-cannot-write-manual-review",
    "student-b-cannot-write-manual-review",
    "anonymous-cannot-write-manual-review",
  ])assert.match(runner,new RegExp(name));
});
test("15: only confirmed review mode calls authorized instructor write",()=>{
  const pos=runner.indexOf('if(config.mode==="review"){');
  const write=runner.indexOf('mark(owner,config.awarded)');
  assert(pos>0&&write>pos);
  assert.match(runner,/reviewWriteAttempted=true/);
  assert.match(runner,/reviewWriteConfirmed=true/);
  assert.match(runner,/official_score_updated===false/);
  assert.match(runner,/instructor-idempotent-same-points/);
  assert.match(runner,/invalid-above-maximum-review-rejected/);
});
test("16: reviewed grades do not become official without separate trusted finalization",()=>{
  assert.match(runner,/student-grade-still-pending-after-review/);
  assert.match(runner,/attempt-score-still-null-before-finalizer/);
  assert.match(runner,/r\.score===null&&r\.max_score===null&&r\.finalized_at===null/);
  assert.match(runner,/return;/);
});
test("17: final verification confirms immutable five-field receipt and no forged essay correctness",()=>{
  assert.match(runner,/student-a-ledger-backed-final-grade/);
  assert.match(runner,/student-a-repeated-read-stable/);
  assert.match(runner,/final-written-answer-credit-matches-reviewed-mark/);
  assert.match(runner,/rows\[0\]\.is_correct===null/);
  assert.match(runner,/Date\.parse\(r\.finalized_at\)/);
  assert.match(runner,/student-b-cannot-read-final/);
  assert.match(runner,/anonymous-cannot-read-final/);
});
test("18: service-role secrets, privileged writes and public logs are absent",()=>{
  assert.doesNotMatch(runner,/\.insert\(|\.update\(|\.delete\(|auth\.admin\.|SUPABASE_SERVICE_ROLE_KEY|sb_secret_|getSupabaseSecretKey/);
  assert.doesNotMatch(runner,/console\.log\(users\)|console\.log\(config\)|console\.log\(r\)/);
  assert.match(runner,/education_schema_deployed_by_test:false/);
  assert.match(runner,/production_certified:false/);
  assert.match(runner,/trusted_finalizer_invoked:false/);
});
test("19: protected workflow is manual-only and preflight default",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/default: preflight/);
  assert.match(workflow,/environment: rls-staging/);
  assert.match(workflow,/approve_instructor_review_write/);
  assert.match(workflow,/acknowledge_review_persists/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/permissions:\n\s+contents: read/);
  assert.doesNotMatch(workflow,/\n\s+pull_request:|\n\s+push:|\n\s+schedule:/);
});
test("20: independent evidence validator binds exact mode, ordered cases and cleanup",()=>{
  assert.match(evidence,/REVIEW_STAGE_CASES\[data\.mode\]/);
  assert.match(evidence,/trusted_finalizer_invoked!==false/);
  assert.match(evidence,/sessions_signed_out!==true/);
  assert.match(evidence,/production_certified!==false/);
});
const sampleEvidence=mode=>{
  const list=REVIEW_STAGE_CASES[mode];
  return {
    schema:1,suite:"education-hosted-instructor-final-grade",
    environment:"isolated-supabase-staging",mode,configured:true,
    three_distinct_authenticated_accounts:true,
    expected_cases:list.length,attempted_cases:list.length,
    passed_cases:list.length,results:list.map(name=>({case:name,result:"passed"})),
    instructor_review_write_attempted:mode==="review",
    instructor_review_write_confirmed:mode==="review",
    trusted_finalizer_invoked:false,education_schema_deployed_by_test:false,
    production_tested:false,production_certified:false,
    sessions_signed_out:true,
  };
};
function verify(data){
  const dir=mkdtempSync(join(tmpdir(),"edu-instructor-evidence-"));
  try{
    mkdirSync(join(dir,"test-results"));
    writeFileSync(join(dir,"test-results/education-hosted-instructor-final-grade.json"),
      JSON.stringify(data));
    return spawnSync(process.execPath,[verifier],{cwd:dir,encoding:"utf8",timeout:10000}).status;
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test("21: offline signed-out, strictly sanitized synthetic evidence passes in all modes",()=>{
  for(const mode of ["preflight","review","verify"])
    assert.equal(verify(sampleEvidence(mode)),0,mode);
});
test("22: malformed, cross-mode, leaky and fabricated evidence fails closed",()=>{
  for(const mutation of [
    x=>{x.results.pop();},x=>{x.results[2].result="failed";},
    x=>{x.results[1].student_id="private";},
    x=>{x.access_token="private";},x=>{x.mode="review";},
    x=>{x.instructor_review_write_attempted=true;},
    x=>{x.instructor_review_write_confirmed=true;},
    x=>{x.trusted_finalizer_invoked=true;},
    x=>{x.sessions_signed_out=false;},
    x=>{x.production_certified=true;},
  ]){
    const x=sampleEvidence("preflight");mutation(x);
    assert.notEqual(verify(x),0);
  }
  const bad=sampleEvidence("review");bad.instructor_review_write_confirmed=false;
  assert.notEqual(verify(bad),0);
});
test("23: docs require approved synthetic fixture, manual review and independent service finalizer",()=>{
  assert.match(doc,/NOT DEPLOYED/);
  assert.match(doc,/manual/i);
  assert.match(doc,/separate.*staging/i);
  assert.match(doc,/separate.*trusted atomic finalization/i);
  assert.match(doc,/production/i);
});
test("24: all staging script files pass offline Node syntax checking",()=>{
  for(const p of [
    "scripts/staging/educationHostedReviewConfig.mjs",
    "scripts/staging/verifyEducationHostedInstructorGrading.mjs",
    "scripts/staging/verifyEducationHostedInstructorEvidence.mjs",
  ]){
    const r=spawnSync(process.execPath,["--check",new URL("../"+p,import.meta.url).pathname],
      {encoding:"utf8",timeout:10000});
    assert.equal(r.status,0,r.stderr||r.stdout);
  }
});
