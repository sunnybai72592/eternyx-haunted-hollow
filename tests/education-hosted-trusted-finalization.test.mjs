import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {
 TRUSTED_FINALIZE_APPROVAL,TRUSTED_FINALIZE_ACK,
 TRUSTED_FINALIZER_CASES,validateEducationTrustedFinalizerConfig,
} from "../scripts/staging/educationTrustedFinalizerConfig.mjs";
import {validateStagingRlsConfig} from "../scripts/staging/stagingRlsConfig.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const runner=read("scripts/staging/verifyEducationHostedTrustedFinalization.mjs");
const configSrc=read("scripts/staging/educationTrustedFinalizerConfig.mjs");
const evidenceSrc=read("scripts/staging/verifyEducationTrustedFinalizerEvidence.mjs");
const workflow=read(".github/workflows/education-hosted-trusted-finalization.yml");
const guide=read("docs/EDUCATION_TRUSTED_STAGING_FINALIZATION.md");
const verifier=new URL("../scripts/staging/verifyEducationTrustedFinalizerEvidence.mjs",import.meta.url).pathname;
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const stagingRef="a".repeat(20);
const jwt=(role,ref)=>[
 Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),
 Buffer.from(JSON.stringify({role,ref,iss:"supabase"})).toString("base64url"),
 "synthetic_test_signature",
].join(".");
const base=()=>({
 ETERNYX_EDU_FINALIZE_MODE:"preflight",
 ETERNYX_RLS_STAGING_REF:stagingRef,
 ETERNYX_RLS_PRODUCTION_REF:"b".repeat(20),
 ETERNYX_RLS_STAGING_URL:"https://"+stagingRef+".supabase.co",
 ETERNYX_RLS_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_for_testing",
 ETERNYX_RLS_TEST_A_EMAIL:"rls-a@example.com",
 ETERNYX_RLS_TEST_A_PASSWORD:"long-test-a-password",
 ETERNYX_RLS_TEST_B_EMAIL:"rls-b@example.com",
 ETERNYX_RLS_TEST_B_PASSWORD:"long-test-b-password",
 ETERNYX_RLS_INSTRUCTOR_EMAIL:"rls-instructor@example.com",
 ETERNYX_RLS_INSTRUCTOR_PASSWORD:"long-test-instructor-password",
 ETERNYX_EDU_REVIEW_TEST_ID:uuid(1),
 ETERNYX_EDU_REVIEW_ATTEMPT_ID:uuid(2),
 ETERNYX_EDU_REVIEW_ANSWER_ID:uuid(3),
 ETERNYX_EDU_REVIEW_AWARDED_POINTS:"1",
 ETERNYX_EDU_FINALIZE_EXPECTED_SCORE:"6",
 ETERNYX_EDU_FINALIZE_EXPECTED_MAX:"10",
});
const write=()=>({
 ...base(),ETERNYX_EDU_FINALIZE_MODE:"finalize",
 ETERNYX_EDU_FINALIZE_WRITE_APPROVAL:TRUSTED_FINALIZE_APPROVAL,
 ETERNYX_EDU_FINALIZE_IMMUTABLE_ACK:TRUSTED_FINALIZE_ACK,
 ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"sb_secret_"+"x".repeat(30),
});
const verify=()=>({...base(),ETERNYX_EDU_FINALIZE_MODE:"verify"});

test("1. Preflight validates existing three-party fixture without a privileged key",()=>{
 const c=validateEducationTrustedFinalizerConfig(base());
 assert.equal(c.mode,"preflight");
 assert.equal(c.secret,null);
 assert.equal(c.expectedCases.length,18);
 assert.deepEqual(c.expectedMarks,{score:6,max:10});
 assert.equal(c.fixture.attemptId,uuid(2));
 assert(Object.isFrozen(c)&&Object.isFrozen(c.expectedMarks));
});
test("2. Explicit grading requires both independent, exact owner approval tokens",()=>{
 for(const property of ["ETERNYX_EDU_FINALIZE_WRITE_APPROVAL","ETERNYX_EDU_FINALIZE_IMMUTABLE_ACK"]){
  const c=write();delete c[property];
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
  c[property]="true";
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 }
 assert.equal(validateEducationTrustedFinalizerConfig(write()).mode,"finalize");
 assert.equal(validateEducationTrustedFinalizerConfig(write()).expectedCases.length,28);
});
test("3. Read-only verify and preflight refuse a privileged secret even if consent exists",()=>{
 for(const mode of ["preflight","verify"]){
  const c={...(mode==="verify"?verify():base()),
   ETERNYX_EDU_FINALIZE_WRITE_APPROVAL:TRUSTED_FINALIZE_APPROVAL,
   ETERNYX_EDU_FINALIZE_IMMUTABLE_ACK:TRUSTED_FINALIZE_ACK,
   ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY:"sb_secret_"+"x".repeat(30)};
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 }
});
test("4. No inherited RLS fixture-write grant or instructor-review write authorization",()=>{
 assert.throws(()=>validateStagingRlsConfig(write()));
 assert.equal(validateEducationTrustedFinalizerConfig(write()).mode,"finalize");
 assert.match(configSrc,/ETERNYX_EDU_REVIEW_MODE:"preflight"/);
});
test("5. Forbidden modes and malformed staging refs fail closed",()=>{
 for(const mode of [undefined,"","write","grade","FINALIZE","production",null]){
  const c=base();c.ETERNYX_EDU_FINALIZE_MODE=mode;
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 }
 const c=base();c.ETERNYX_RLS_PRODUCTION_REF=c.ETERNYX_RLS_STAGING_REF;
 assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 const d=base();d.ETERNYX_RLS_STAGING_URL="http://"+stagingRef+".supabase.co";
 assert.throws(()=>validateEducationTrustedFinalizerConfig(d));
 const e=base();e.ETERNYX_RLS_STAGING_REF="wcncuarekaofmfurbtbh";
 e.ETERNYX_RLS_STAGING_URL="https://wcncuarekaofmfurbtbh.supabase.co";
 assert.throws(()=>validateEducationTrustedFinalizerConfig(e));
});
test("6. Role-secret policy rejects anon, wrong ref and publishable keys",()=>{
 for(const secret of [
  "not-a-real-role-key",jwt("anon",stagingRef),
  jwt("service_role","c".repeat(20)),
  base().ETERNYX_RLS_STAGING_PUBLISHABLE_KEY,
  "sb_secret_bad","sb_secret_bad!"; // deliberately malformed secret
 ]){
  const c=write();c.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY=secret;
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 }
});
test("7. Both inspectable legacy staging-role JWT and modern staging secret forms can be admitted",()=>{
 const c=write();c.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY=jwt("service_role",stagingRef);
 assert.equal(validateEducationTrustedFinalizerConfig(c).secret,c.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY);
 const d=write();
 assert.equal(validateEducationTrustedFinalizerConfig(d).secret,d.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY);
});
test("8. Expected final mark and max are mandatory and bounded",()=>{
 for(const name of ["ETERNYX_EDU_FINALIZE_EXPECTED_SCORE","ETERNYX_EDU_FINALIZE_EXPECTED_MAX"]){
  for(const value of ["-1","1.5","Infinity","100001",undefined]){
   const c=base();c[name]=value;
   assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
  }
 }
 const c=base();c.ETERNYX_EDU_FINALIZE_EXPECTED_SCORE="11";
 assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 const d=base();d.ETERNYX_EDU_FINALIZE_EXPECTED_MAX="0";
 assert.throws(()=>validateEducationTrustedFinalizerConfig(d));
});
test("9. Reviewed attempt and approved instructor identity remain prerequisites",()=>{
 for(const prop of [
  "ETERNYX_EDU_REVIEW_TEST_ID","ETERNYX_EDU_REVIEW_ATTEMPT_ID",
  "ETERNYX_EDU_REVIEW_ANSWER_ID","ETERNYX_RLS_INSTRUCTOR_EMAIL",
 ]){
  const c=base();delete c[prop];
  assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
 }
 const c=base();c.ETERNYX_RLS_INSTRUCTOR_EMAIL="rls-a@example.com";
 assert.throws(()=>validateEducationTrustedFinalizerConfig(c));
});
test("10. All mode-specific cases are exactly named and deduplicated",()=>{
 assert.equal(TRUSTED_FINALIZER_CASES.preflight.length,18);
 assert.equal(TRUSTED_FINALIZER_CASES.finalize.length,28);
 assert.equal(TRUSTED_FINALIZER_CASES.verify.length,21);
 for(const entries of Object.values(TRUSTED_FINALIZER_CASES)){
  assert.equal(new Set(entries).size,entries.length);
  assert.equal(entries.at(-1),"all-staging-sessions-signed-out");
 }
});
test("11. Three real Auth accounts and fresh getUser checks precede privileged code",()=>{
 assert.match(runner,/c\.auth\.signInWithPassword\(creds\[i\]\)/);
 assert.match(runner,/c\.auth\.getUser\(\)/);
 assert.match(runner,/new Set\(identities\)\.size===3/);
 assert.match(runner,/instructor-grant-still-approved/);
 assert.match(runner,/instructor-is-not-admin/);
});
test("12. Staging preflight verifies instructor review and actual written response ownership",()=>{
 assert.match(runner,/exact-instructor-review-remains-recorded/);
 assert.match(runner,/student-a-owns/); // uses owned and accountA controls
 assert.match(runner,/short_answer/);
 assert.match(runner,/r\.reviewed_points===config\.awarded/);
 assert.match(runner,/pending-student-receipt-hides-scores/);
 assert.match(runner,/attempt-grades-not-written-before-finalizer/);
});
test("13. Cross-student, anonymous and direct ledger access are rejected",()=>{
 for(const name of [
  "student-b-cannot-inspect-a-attempt",
  "student-b-cannot-inspect-a-answer",
  "student-a-direct-ledger-select-denied",
  "student-b-direct-ledger-select-denied",
  "anonymous-direct-ledger-select-denied",
  "student-b-cannot-read-a-final-result",
  "anonymous-cannot-read-a-final-result",
 ])assert.match(runner,new RegExp(name));
 assert.match(runner,/code==="42501"/);
});
test("14. Privileged grader is called only inside explicit finalize mode",()=>{
 const branch=runner.indexOf('if(config.mode==="finalize"){');
 const call=runner.indexOf('service.rpc("education_finalize_cbt_grade"');
 assert(branch>0&&call>branch);
 assert.match(runner,/if\(config\.mode==="preflight"\)return/);
 assert.match(runner,/serviceInvoked=true/);
 assert.match(runner,/serviceConfirmed=true/);
});
test("15. Real finalization accepts only exact expected score and zero missing reviews",()=>{
 assert.match(runner,/r\.status==="finalized"/);
 assert.match(runner,/r\.pending_manual_review===0/);
 assert.match(runner,/r\.score===config\.expectedMarks\.score/);
 assert.match(runner,/r\.max_score===config\.expectedMarks\.max/);
});
test("16. Retry checks an already finalized ledger rather than regrading",()=>{
 assert.match(runner,/finalizer-idempotent-retry-reuses-ledger/);
 assert.match(runner,/r\?\.status==="already_finalized"/);
 assert.match(runner,/r\.pending_manual_review===0/);
});
test("17. Final student receipt is narrow, ledger-backed and truthful",()=>{
 assert.match(runner,/JSON\.stringify\(Object\.keys\(r\)\.sort\(\)\)/);
 assert.match(runner,/r\.grade_status==="finalized"/);
 assert.match(runner,/student-a-repeat-result-read-is-stable/);
 assert.match(runner,/finalized-attempt-matches-receipt-score/);
 assert.match(runner,/finalized-essay-matches-approved-mark/);
 assert.match(runner,/rows\[0\]\.is_correct===null/);
});
test("18. No arbitrary database writes, extra service-role calls or sensitive log output",()=>{
 assert.doesNotMatch(runner,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.remove\(|auth\.admin\./);
 assert.doesNotMatch(runner,/console\.log\(config\)|console\.log\(r\)|console\.log\(identities\)/);
 assert.match(runner,/fixture_cleanup_performed:false/);
 assert.match(runner,/production_certified:false/);
});
test("19. Workflow is protected and manual only; privileged key exists in finalize mode only",()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/default: preflight/);
 assert.match(workflow,/environment: rls-staging/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/permissions:\n\s+contents: read/);
 assert.match(workflow,/inputs\.run_mode == 'finalize' && secrets\.ETERNYX_EDU_STAGING_SERVICE_ROLE_KEY/);
 assert.match(workflow,/approve_one_official_grade/);
 assert.match(workflow,/acknowledge_immutable_grade/);
 assert.doesNotMatch(workflow,/\n\s+pull_request:|\n\s+push:|\n\s+schedule:/);
});
test("20. Evidence validator binds mode-specific exact case list and forbids production claims",()=>{
 assert.match(evidenceSrc,/TRUSTED_FINALIZER_CASES\[e\.mode\]/);
 assert.match(evidenceSrc,/production_certified!==false/);
 assert.match(evidenceSrc,/sessions_signed_out!==true/);
 assert.match(evidenceSrc,/privileged_rpc_confirmed!==\(e\.mode==="finalize"\)/);
});
function expectedEvidence(mode){
 const list=TRUSTED_FINALIZER_CASES[mode];
 return {
  schema:1,suite:"education-hosted-trusted-finalization",
  environment:"isolated-supabase-staging",mode,configured:true,
  three_distinct_authenticated_accounts:true,
  expected_cases:list.length,attempted_cases:list.length,
  passed_cases:list.length,results:list.map(name=>({case:name,result:"passed"})),
  privileged_rpc_attempted:mode==="finalize",
  privileged_rpc_confirmed:mode==="finalize",
  schema_deployed_by_test:false,fixture_cleanup_performed:false,
  production_tested:false,production_certified:false,sessions_signed_out:true,
 };
}
function checkEvidence(data){
 const dir=mkdtempSync(join(tmpdir(),"eternyx-grade-evidence-"));
 try{
  mkdirSync(join(dir,"test-results"));
  writeFileSync(join(dir,"test-results/education-trusted-finalization.json"),JSON.stringify(data));
  return spawnSync(process.execPath,[verifier],{cwd:dir,encoding:"utf8",timeout:10000}).status;
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test("21. Offline evidence validator accepts only complete nonproduction proofs",()=>{
 for(const mode of ["preflight","finalize","verify"])
  assert.equal(checkEvidence(expectedEvidence(mode)),0,mode);
});
test("22. Incomplete or fabricated official finalization evidence fails closed",()=>{
 for(const mutation of [
  x=>{x.results.pop();},x=>{x.results[0].result="failed";},
  x=>{x.results[2].case="fake";},x=>{x.score=6;},
  x=>{x.results[0].user_id="private";},
  x=>{x.privileged_rpc_attempted=true;},
  x=>{x.privileged_rpc_confirmed=true;},
  x=>{x.production_certified=true;},
  x=>{x.fixture_cleanup_performed=true;},
  x=>{x.sessions_signed_out=false;},
  x=>{x.mode="finalize";},
 ]){
  const c=expectedEvidence("preflight");mutation(c);
  assert.notEqual(checkEvidence(c),0);
 }
 const d=expectedEvidence("finalize");
 d.privileged_rpc_confirmed=false;
 assert.notEqual(checkEvidence(d),0);
});
test("23. Operator documentation discloses immutable scoring, manual consent and staging limits",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/immutable/i);
 assert.match(guide,/manual/i);
 assert.match(guide,/production/i);
 assert.match(guide,/read-only/i);
});
test("24. Source scripts pass offline Node syntax checks",()=>{
 for(const path of [
  "scripts/staging/educationTrustedFinalizerConfig.mjs",
  "scripts/staging/verifyEducationHostedTrustedFinalization.mjs",
  "scripts/staging/verifyEducationTrustedFinalizerEvidence.mjs",
 ]){
  const r=spawnSync(process.execPath,["--check",new URL("../"+path,import.meta.url).pathname],
   {encoding:"utf8",timeout:10000});
  assert.equal(r.status,0,r.stderr||r.stdout);
 }
});
