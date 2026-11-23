import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateEducationHostedCbtConfig, CBT_PREFLIGHT_CASES,
  CBT_WRITE_CASES, CBT_STAGING_CASES,
  EDUCATION_CBT_WRITE_APPROVAL,EDUCATION_CBT_IRREVERSIBLE_ACK,
} from "../scripts/staging/educationHostedCbtWriteConfig.mjs";
import { validateStagingRlsConfig } from "../scripts/staging/stagingRlsConfig.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const runner=read("scripts/staging/verifyEducationHostedCbtWrite.mjs");
const configSource=read("scripts/staging/educationHostedCbtWriteConfig.mjs");
const evidence=read("scripts/staging/verifyEducationHostedCbtEvidence.mjs");
const workflow=read(".github/workflows/education-hosted-cbt-write.yml");
const docs=read("docs/EDUCATION_HOSTED_CBT_WRITE_ACCEPTANCE.md");
const verifier=new URL("../scripts/staging/verifyEducationHostedCbtEvidence.mjs",import.meta.url).pathname;
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const sample=()=>({
  ETERNYX_EDU_WRITE_MODE:"preflight",
  ETERNYX_RLS_STAGING_REF:"a".repeat(20),
  ETERNYX_RLS_PRODUCTION_REF:"b".repeat(20),
  ETERNYX_RLS_STAGING_URL:"https://"+"a".repeat(20)+".supabase.co",
  ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_staging-only-synthetic",
  ETERNYX_RLS_TEST_A_EMAIL:"rls-edu-student-a@example.com",
  ETERNYX_RLS_TEST_A_PASSWORD:"long-synthetic-staging-password-a",
  ETERNYX_RLS_TEST_B_EMAIL:"rls-edu-student-b@example.com",
  ETERNYX_RLS_TEST_B_PASSWORD:"long-synthetic-staging-password-b",
  ETERNYX_EDU_WRITE_TEST_ID:uuid(1),
  ETERNYX_EDU_WRITE_MCQ_ID:uuid(2),
  ETERNYX_EDU_WRITE_MCQ_OPTION_ID:uuid(3),
  ETERNYX_EDU_WRITE_ESSAY_ID:uuid(4),
});
function writeSample(){
  return {...sample(),ETERNYX_EDU_WRITE_MODE:"write",
    ETERNYX_EDU_CBT_WRITE_APPROVAL:EDUCATION_CBT_WRITE_APPROVAL,
    ETERNYX_EDU_IRREVERSIBLE_ACK:EDUCATION_CBT_IRREVERSIBLE_ACK,
  };
}
test("1. Preflight is the default safe choice and never needs write approval",()=>{
  const cfg=validateEducationHostedCbtConfig(sample());
  assert.equal(cfg.mode,"preflight");
  assert.equal(cfg.url,"https://"+"a".repeat(20)+".supabase.co");
  assert.equal(cfg.expectedCases.length,17);
  assert.equal(cfg.fixture.testId,uuid(1));
  assert.ok(Object.isFrozen(cfg)&&Object.isFrozen(cfg.fixture));
});
test("2. Neither the write-approval token nor acknowledgement alone can activate writes",()=>{
  const x=sample();x.ETERNYX_EDU_CBT_WRITE_APPROVAL=EDUCATION_CBT_WRITE_APPROVAL;
  x.ETERNYX_EDU_IRREVERSIBLE_ACK=EDUCATION_CBT_IRREVERSIBLE_ACK;
  assert.equal(validateEducationHostedCbtConfig(x).mode,"preflight");
  const y=sample();y.ETERNYX_EDU_WRITE_MODE="write";
  assert.throws(()=>validateEducationHostedCbtConfig(y),/owner write approval/);
  y.ETERNYX_EDU_CBT_WRITE_APPROVAL=EDUCATION_CBT_WRITE_APPROVAL;
  assert.throws(()=>validateEducationHostedCbtConfig(y),/acknowledgement/);
  y.ETERNYX_EDU_IRREVERSIBLE_ACK=EDUCATION_CBT_IRREVERSIBLE_ACK;
  assert.equal(validateEducationHostedCbtConfig(y).mode,"write");
  assert.equal(validateEducationHostedCbtConfig(y).expectedCases.length,46);
});
test("3. Arbitrary mode, missing mode or wrong approval constants fail closed",()=>{
  for(const mode of [undefined,"Write","write-now","production","","read-only",null]){
    const env=sample();env.ETERNYX_EDU_WRITE_MODE=mode;
    assert.throws(()=>validateEducationHostedCbtConfig(env));
  }
  for(const prop of ["ETERNYX_EDU_CBT_WRITE_APPROVAL","ETERNYX_EDU_IRREVERSIBLE_ACK"]){
    const env=writeSample();env[prop]="approved";
    assert.throws(()=>validateEducationHostedCbtConfig(env));
  }
});
test("4. Separate Supabase staging RLS writes approval is not granted implicitly",()=>{
  assert.throws(()=>validateStagingRlsConfig(writeSample()),/owner approval/);
});
test("5. The known production project and identical staging/production refs are blocked",()=>{
  const same=sample();same.ETERNYX_RLS_PRODUCTION_REF=same.ETERNYX_RLS_STAGING_REF;
  assert.throws(()=>validateEducationHostedCbtConfig(same));
  const wrong=sample();wrong.ETERNYX_RLS_STAGING_REF="wcncuarekaofmfurbtbh";
  wrong.ETERNYX_RLS_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co";
  assert.throws(()=>validateEducationHostedCbtConfig(wrong));
});
test("6. HTTPS hostname, public keys, and dedicated accounts must pass strict guards",()=>{
  const variations=[
    ["ETERNYX_RLS_STAGING_URL","http://"+"a".repeat(20)+".supabase.co"],
    ["ETERNYX_RLS_STAGING_URL","https://evil.example.com"],
    ["ETERNYX_RLS_STAGING_PUBLISHABLE_KEY","sb_secret_banned"],
    ["ETERNYX_RLS_STAGING_PUBLISHABLE_KEY","service_role"],
    ["ETERNYX_RLS_TEST_A_EMAIL","customer@gmail.com"],
    ["ETERNYX_RLS_TEST_B_EMAIL","rls-edu-student-a@example.com"],
    ["ETERNYX_RLS_TEST_A_PASSWORD","short"],
  ];
  for(const [key,value] of variations){
    const env=sample();env[key]=value;
    assert.throws(()=>validateEducationHostedCbtConfig(env),key);
  }
});
test("7. All four reviewed exam/question/option fixture IDs are valid and distinct",()=>{
  const fields=["TEST_ID","MCQ_ID","MCQ_OPTION_ID","ESSAY_ID"];
  for(const field of fields){
    const name="ETERNYX_EDU_WRITE_"+field;
    const x=sample();delete x[name];
    assert.throws(()=>validateEducationHostedCbtConfig(x));
    const y=sample();y[name]="not-an-uuid";
    assert.throws(()=>validateEducationHostedCbtConfig(y));
  }
  const same=sample();
  same.ETERNYX_EDU_WRITE_ESSAY_ID=same.ETERNYX_EDU_WRITE_MCQ_ID;
  assert.throws(()=>validateEducationHostedCbtConfig(same),/differ/);
});
test("8. Both acceptance modes have exact fixed, nonduplicate case names",()=>{
  assert.equal(CBT_PREFLIGHT_CASES.length,16);
  assert.equal(CBT_WRITE_CASES.length,29);
  assert.equal(CBT_STAGING_CASES.preflight.length,17);
  assert.equal(CBT_STAGING_CASES.write.length,46);
  for(const x of Object.values(CBT_STAGING_CASES))assert.equal(new Set(x).size,x.length);
  assert.ok(CBT_STAGING_CASES.write.includes("student-b-cannot-save-a-answer"));
  assert.ok(CBT_STAGING_CASES.write.includes("student-a-has-pending-unverified-result"));
});
test("9. Real Supabase staging runner signs in and verifies two distinct JWT identities",()=>{
  assert.match(runner,/auth\.signInWithPassword\(config\.accounts\[0\]\)/);
  assert.match(runner,/auth\.signInWithPassword\(config\.accounts\[1\]\)/);
  assert.match(runner,/studentA\.auth\.getUser\(\)/);
  assert.match(runner,/studentB\.auth\.getUser\(\)/);
  assert.match(runner,/ua\.data\.user\.id!==ub\.data\.user\.id/);
  assert.match(runner,/autoRefreshToken:false/);
});
test("10. Every staging exam write is guarded by explicit mode after all preflight checks",()=>{
  const branch=runner.indexOf('if(config.mode!=="write")return;');
  const start=runner.indexOf('studentA.rpc("start_cbt_attempt"');
  const save=runner.indexOf('studentA.rpc("save_cbt_answer"');
  const submit=runner.indexOf('studentA.rpc("submit_cbt_attempt"');
  assert(branch>0&&start>branch&&save>start&&submit>save);
  assert.match(runner,/writesAttempted=true/);
  assert.match(runner,/synthetic_attempt_confirmed:attemptCreated/);
});
test("11. Preflight inspects fresh attempts, enrollment and question mapping",()=>{
  assert.match(runner,/student-a-has-no-existing-attempt/);
  assert.match(runner,/student-b-has-no-existing-attempt/);
  assert.match(runner,/student-a-can-read-approved-exam/);
  assert.match(runner,/student-a-can-read-mcq-question/);
  assert.match(runner,/student-a-can-read-written-question/);
  assert.match(runner,/r\.question_id===f\.mcqId/);
  assert.match(runner,/data\[0\]\.duration_minutes>=30/);
});
test("12. Real-JWT student tests deny cross-account access and grade disclosure",()=>{
  for(const key of [
    "student-b-cannot-read-a-attempt",
    "student-b-cannot-read-a-answers",
    "student-b-cannot-save-a-answer",
    "student-b-cannot-submit-a-attempt",
    "anonymous-cannot-read-a-result",
    "student-a-cannot-read-private-grade-ledger",
    "student-a-cannot-read-option-key",
  ])assert.ok(runner.includes(key),key);
  assert.match(runner,/code==="42501"/);
});
test("13. Submission, retry, written response and post-submission rejection are real RPCs",()=>{
  assert.match(runner,/studentA\.rpc\("submit_cbt_attempt"/);
  assert.match(runner,/student-a-repeat-submit-is-idempotent/);
  assert.match(runner,/student-a-late-save-is-blocked/);
  assert.match(runner,/student-a-cannot-retake-submitted-exam/);
  assert.match(runner,/status==="already_submitted"/);
});
test("14. Official results must remain ungraded, matching exact five-field receipt",()=>{
  assert.match(runner,/grade_status===status/);
  assert.match(runner,/data\.score===null && data\.max_score===null && data\.finalized_at===null/);
  assert.match(runner,/student-a-has-pending-unverified-result/);
  assert.match(runner,/r\.score===null&&r\.max_score===null/);
});
test("15. Direct table mutation attempts are negative probes after opt-in write gate only",()=>{
  const guard=runner.indexOf('if(config.mode!=="write")return;');
  const firstDirect=runner.indexOf('.update({score:777,max_score:777})');
  assert.ok(guard>0 && firstDirect>guard);
  assert.match(runner,/student-a-cannot-insert-forged-attempt/);
  assert.match(runner,/student-a-cannot-forge-written-answer-points/);
  assert.match(runner,/student-b-cannot-forge-a-answer-points/);
  assert.match(runner,/anonymous-cannot-forge-a-attempt-score/);
  assert.match(runner,/all-synthetic-records-unchanged-after-direct-tamper/);
  assert.match(runner,/isExplicitAuthorizationDenial\(r\)/);
  assert.match(runner,/isDeniedOrNoVisibleRow\(r\)/);
  assert.doesNotMatch(runner,/\.upsert\(|\.delete\(|\.remove\(|\.functions\.invoke\(|auth\.admin\./);
  assert.doesNotMatch(runner,/getSupabaseSecretKey|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
  assert.match(runner,/hosted_sql_deployed_by_test:false/);
  assert.match(runner,/automatic_cleanup_performed:false/);
  assert.match(runner,/production_certified:false/);
});
test("16. Workflow is manual only; preflight default; dual consent and protected environment",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/type: choice/);
  assert.match(workflow,/- preflight\n\s+- write/);
  assert.match(workflow,/default: preflight/);
  assert.match(workflow,/acknowledge_no_retake/);
  assert.match(workflow,/approve_cbt_attempt_write/);
  assert.match(workflow,/environment: rls-staging/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/permissions:\n\s+contents: read/);
  assert.doesNotMatch(workflow,/\n\s+push:|\n\s+pull_request:|\n\s+schedule:/);
});
test("17. Evidence gate checks both modes, exact schema and no production claims",()=>{
  assert.match(evidence,/CBT_STAGING_CASES\[evidence\.mode\]/);
  assert.match(evidence,/production_certified!==false/);
  assert.match(evidence,/synthetic_attempt_confirmed!==\(evidence\.mode==="write"\)/);
  assert.match(evidence,/sessions_signed_out!==true/);
});
function validEvidence(mode){
  const list=CBT_STAGING_CASES[mode];
  return {
    schema:1,suite:"education-hosted-cbt-student-write",
    environment:"isolated-supabase-staging",
    mode,configured:true,distinct_authenticated_students:true,
    expected_cases:list.length,attempted_cases:list.length,passed_cases:list.length,
    results:list.map(name=>({case:name,result:"passed"})),
    education_writes_attempted:mode==="write",
    synthetic_attempt_confirmed:mode==="write",
    automatic_cleanup_performed:false,hosted_sql_deployed_by_test:false,
    production_tested:false,production_certified:false,
    sessions_signed_out:true,
  };
}
function checkEvidence(obj){
  const dir=mkdtempSync(join(tmpdir(),"eternyx-education-cbt-"));
  try{
    mkdirSync(join(dir,"test-results"));
    writeFileSync(join(dir,"test-results/education-hosted-cbt-write.json"),JSON.stringify(obj));
    return spawnSync(process.execPath,[verifier],{cwd:dir,encoding:"utf8",timeout:10000});
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test("18. Synthetic offline evidence accepts both correct independent case sets",()=>{
  assert.equal(checkEvidence(validEvidence("preflight")).status,0);
  assert.equal(checkEvidence(validEvidence("write")).status,0);
});
test("19. Tampered evidence, fabricated passing writes or leaks are rejected",()=>{
  const mutations=[
    d=>{d.results.pop();},
    d=>{d.results[5].result="failed";},
    d=>{d.results[5].case="not-a-case";},
    d=>{d.results[2].user_id="private";},
    d=>{d.token="private";},
    d=>{d.production_certified=true;},
    d=>{d.automatic_cleanup_performed=true;},
    d=>{d.sessions_signed_out=false;},
    d=>{d.mode="write";},
    d=>{d.education_writes_attempted=true;},
    d=>{d.synthetic_attempt_confirmed=true;},
  ];
  for(const mutate of mutations){
    const d=validEvidence("preflight");mutate(d);
    assert.notEqual(checkEvidence(d).status,0);
  }
  const d=validEvidence("write");d.education_writes_attempted=false;
  assert.notEqual(checkEvidence(d).status,0);
});
test("20. Documentation and workflow both state manual staging-only consent and residual fixture cleanup",()=>{
  assert.match(docs,/NOT DEPLOYED/);
  assert.match(docs,/Preflight/i);
  assert.match(docs,/irreversible/i);
  assert.match(docs,/manual cleanup/i);
  assert.match(docs,/separate Supabase staging project/i);
  assert.match(docs,/production/i);
  assert.match(workflow,/inputs\.run_mode == 'write'/);
});
test("21. Node validates scripts' JS syntax without live connections",()=>{
  for(const path of [
    "scripts/staging/educationHostedCbtWriteConfig.mjs",
    "scripts/staging/verifyEducationHostedCbtWrite.mjs",
    "scripts/staging/verifyEducationHostedCbtEvidence.mjs",
    "scripts/staging/educationHostedMutationDenial.mjs",
  ]){
    const result=spawnSync(process.execPath,["--check",
      new URL("../"+path,import.meta.url).pathname],{encoding:"utf8",timeout:10000});
    assert.equal(result.status,0,result.stderr||result.stdout);
  }
});


// A denied write must be a real permission result; other SQL failures do not
// prove that the row or column grants are safe.
import {
  isExplicitAuthorizationDenial, isDeniedOrNoVisibleRow,
} from "../scripts/staging/educationHostedMutationDenial.mjs";
test("22. Explicit Postgres permission failures prove direct-write rejection",()=>{
  assert.equal(isExplicitAuthorizationDenial({error:{code:"42501",message:"insufficient privilege"}}),true);
  assert.equal(isExplicitAuthorizationDenial({error:{code:"PGRST301",message:"permission denied"}}),true);
  assert.equal(isExplicitAuthorizationDenial({error:{code:"23505",message:"duplicate key"}}),false);
  assert.equal(isExplicitAuthorizationDenial({error:{code:"23502",message:"null value violates not-null"}}),false);
  assert.equal(isExplicitAuthorizationDenial({error:{code:"PGRST116",message:"0 rows"}}),false);
  assert.equal(isExplicitAuthorizationDenial({error:{code:"",message:"Network connection timeout"}}),false);
  assert.equal(isExplicitAuthorizationDenial({data:[],error:null}),false);
  assert.equal(isExplicitAuthorizationDenial(null),false);
});
test("23. An invisible non-owner write needs an exact empty RETURNING and follow-up owner check",()=>{
  assert.equal(isDeniedOrNoVisibleRow({data:[],error:null}),true);
  assert.equal(isDeniedOrNoVisibleRow({data:[{id:"row"}],error:null}),false);
  assert.equal(isDeniedOrNoVisibleRow({data:null,error:null}),false);
  assert.equal(isDeniedOrNoVisibleRow({data:[],error:{code:"23505",message:"duplicate"}}),false);
  assert.match(runner,/\.select\("id"\)/);
  assert.match(runner,/attempts\[0\]\.score===null && attempts\[0\]\.max_score===null/);
  assert.match(runner,/answer\.is_correct===null && answer\.points_awarded===null/);
});
