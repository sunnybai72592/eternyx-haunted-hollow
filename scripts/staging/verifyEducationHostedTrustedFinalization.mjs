/**
 * Manual-only hosted Education finalization proof.
 * Preflight and verify: ZERO Education writes and ZERO privileged credentials.
 * Finalize: one approved synthetic attempt via one trusted service_role RPC.
 * No SQL deployment, direct grade-table updates, or fixture cleanup.
 * Never print JWTs, UUIDs, response texts, project refs, marks, or API errors.
 */
import {createClient} from "@supabase/supabase-js";
import {mkdirSync,writeFileSync} from "node:fs";
import {
 validateEducationTrustedFinalizerConfig,TRUSTED_FINALIZER_CASES,
} from "./educationTrustedFinalizerConfig.mjs";

const evidencePath="test-results/education-trusted-finalization.json";
const cases=[];
let config,studentA,studentB,reviewer,anon;
let aId,bId,reviewerId;
let threeVerified=false,signedOut=false,serviceInvoked=false,serviceConfirmed=false;
const must=x=>{if(!x)throw new Error("Isolated Education finalization check rejected");};
const ok=r=>{must(r&&!r.error);return r.data;};
function denied(r){
 const code=String(r?.error?.code||"");
 const msg=String(r?.error?.message||"");
 return Boolean(r?.error&&(code==="42501"||
  /permission denied|not authorized|attempt unavailable|sign.in required/i.test(msg)));
}
function invisible(r){
 return denied(r)||(!r?.error&&Array.isArray(r.data)&&r.data.length===0);
}
function client(key){
 return createClient(config.url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{headers:{"X-ETERNYX-EDUCATION-STAGING":"final-grade-rehearsal"}},
 });
}
function record(label,passed){
 cases.push({case:label,result:passed?"passed":"failed"});
 process.stdout.write((passed?"PASS ":"FAIL ")+label+"\n");
}
async function gate(label,fn){
 try{await fn();record(label,true);}
 catch{record(label,false);throw new Error("Education staging acceptance stopped");}
}
function queueAnswer(){
 return reviewer.rpc("education_instructor_written_review_queue");
}
function learnerResult(c){
 return c.rpc("education_student_verified_result",
  {p_attempt_id:config.fixture.attemptId});
}
function queueEntry(data){
 must(Array.isArray(data));
 const matches=data.filter(row=>
  row?.test_id===config.fixture.testId &&
  row?.attempt_id===config.fixture.attemptId &&
  row?.answer_id===config.fixture.answerId);
 must(matches.length===1);
 const r=matches[0];
 must(r.reviewed_points===config.awarded&&
  Number.isSafeInteger(r.points_possible)&&r.points_possible>=config.awarded&&
  typeof r.response_text==="string"&&r.response_text.trim().length>0);
 return r;
}
function officialReceipt(result,final){
 const r=ok(result);
 must(r&&typeof r==="object"&&!Array.isArray(r));
 must(JSON.stringify(Object.keys(r).sort())===
  JSON.stringify(["attempt_id","finalized_at","grade_status","max_score","score"]));
 must(r.attempt_id===config.fixture.attemptId);
 if(final){
  must(r.grade_status==="finalized"&&
   r.score===config.expectedMarks.score&&
   r.max_score===config.expectedMarks.max&&
   typeof r.finalized_at==="string"&&
   Number.isFinite(Date.parse(r.finalized_at)));
 }else{
  must(r.grade_status==="pending_review"&&r.score===null&&
   r.max_score===null&&r.finalized_at===null);
 }
 return r;
}
function evidence(){
 mkdirSync("test-results",{recursive:true});
 const expected=TRUSTED_FINALIZER_CASES[config?.mode||"preflight"];
 writeFileSync(evidencePath,JSON.stringify({
  schema:1,suite:"education-hosted-trusted-finalization",
  environment:"isolated-supabase-staging",
  mode:config?.mode||"unconfigured",
  configured:Boolean(config),
  three_distinct_authenticated_accounts:threeVerified,
  expected_cases:expected.length,
  attempted_cases:cases.length,
  passed_cases:cases.filter(x=>x.result==="passed").length,
  results:cases,
  privileged_rpc_attempted:serviceInvoked,
  privileged_rpc_confirmed:serviceConfirmed,
  schema_deployed_by_test:false,
  fixture_cleanup_performed:false,
  production_tested:false,production_certified:false,
  sessions_signed_out:signedOut,
 },null,2)+"\n");
}
async function main(){
 config=validateEducationTrustedFinalizerConfig(process.env);
 const f=config.fixture;
 studentA=client(config.publishableKey);
 studentB=client(config.publishableKey);
 reviewer=client(config.publishableKey);
 anon=client(config.publishableKey);
 await gate("three-distinct-staging-auth-identities",async()=>{
  const creds=[...config.accounts,config.instructorAccount];
  const identities=[];
  for(const [i,c] of [studentA,studentB,reviewer].entries()){
   const login=await c.auth.signInWithPassword(creds[i]);
   must(!login.error&&login.data?.user?.id);
   const current=await c.auth.getUser();
   must(!current.error&&current.data?.user?.id===login.data.user.id);
   identities.push(current.data.user.id);
  }
  must(new Set(identities).size===3);
  [aId,bId,reviewerId]=identities;
  threeVerified=true;
 });
 await gate("instructor-grant-still-approved",async()=>{
  must(ok(await reviewer.rpc("education_instructor_access"))?.approved===true);
 });
 await gate("instructor-is-not-admin",async()=>{
  must(ok(await reviewer.rpc("is_admin"))===false);
 });
 for(const [label,c] of [
  ["student-a-is-not-instructor",studentA],
  ["student-b-is-not-instructor",studentB],
 ]){
  await gate(label,async()=>{
   must(ok(await c.rpc("education_instructor_access"))?.approved===false);
  });
 }
 await gate("submitted-attempt-owned-by-a",async()=>{
  const rows=ok(await studentA.from("user_attempts")
   .select("id,test_id,user_id,status,end_time")
   .eq("id",f.attemptId));
  must(Array.isArray(rows)&&rows.length===1&&
   rows[0].id===f.attemptId&&rows[0].test_id===f.testId&&
   rows[0].user_id===aId&&rows[0].end_time&&
   ["submitted","auto_submitted"].includes(rows[0].status));
 });
 await gate("written-answer-belongs-to-synthetic-exam",async()=>{
  const rows=ok(await studentA.from("user_answers")
   .select("id,attempt_id,question_id,short_answer_text")
   .eq("id",f.answerId));
  must(Array.isArray(rows)&&rows.length===1&&rows[0].attempt_id===f.attemptId&&
   typeof rows[0].short_answer_text==="string"&&
   rows[0].short_answer_text.trim().length>0);
  const questions=ok(await studentA.from("questions")
   .select("id,test_id,question_type").eq("id",rows[0].question_id));
  must(Array.isArray(questions)&&questions.length===1&&
   questions[0].test_id===f.testId&&
   questions[0].question_type==="short_answer");
 });
 await gate("exact-instructor-review-remains-recorded",async()=>{
  queueEntry(ok(await queueAnswer()));
 });
 await gate("student-b-cannot-inspect-a-attempt",async()=>{
  must(invisible(await studentB.from("user_attempts")
   .select("id").eq("id",f.attemptId)));
 });
 await gate("student-b-cannot-inspect-a-answer",async()=>{
  must(invisible(await studentB.from("user_answers")
   .select("id").eq("id",f.answerId)));
 });
 for(const [label,c] of [
  ["student-a-direct-ledger-select-denied",studentA],
  ["student-b-direct-ledger-select-denied",studentB],
  ["anonymous-direct-ledger-select-denied",anon],
 ]){
  await gate(label,async()=>{
   must(denied(await c.from("education_final_grades")
    .select("attempt_id,score,max_score").eq("attempt_id",f.attemptId)));
  });
 }
 if(config.mode!=="verify"){
  await gate("pending-student-receipt-hides-scores",async()=>{
   officialReceipt(await learnerResult(studentA),false);
  });
  await gate("attempt-grades-not-written-before-finalizer",async()=>{
   const rows=ok(await studentA.from("user_attempts")
    .select("score,max_score").eq("id",f.attemptId));
   must(Array.isArray(rows)&&rows.length===1&&
    rows[0].score===null&&rows[0].max_score===null);
  });
  await gate("student-b-cannot-read-a-unfinalized-receipt",async()=>{
   must(denied(await learnerResult(studentB)));
  });
  await gate("anonymous-cannot-read-a-unfinalized-receipt",async()=>{
   must(denied(await learnerResult(anon)));
  });
 }
 if(config.mode==="preflight")return;

 if(config.mode==="finalize"){
  // The trusted key is supplied only on the explicitly authorized
  // finalization action and never used for any admin or direct table writes.
  const service=client(config.secret);
  await gate("trusted-server-finalization-invoked",async()=>{
   serviceInvoked=true;
   const r=ok(await service.rpc("education_finalize_cbt_grade",
    {p_attempt_id:f.attemptId}));
   must(r?.attempt_id===f.attemptId&&r.status==="finalized"&&
    r.pending_manual_review===0&&
    r.score===config.expectedMarks.score&&
    r.max_score===config.expectedMarks.max);
   serviceConfirmed=true;
  });
  await gate("official-grading-result-matches-expected-score",async()=>{
   officialReceipt(await learnerResult(studentA),true);
  });
  await gate("finalizer-idempotent-retry-reuses-ledger",async()=>{
   const r=ok(await service.rpc("education_finalize_cbt_grade",
    {p_attempt_id:f.attemptId}));
   must(r?.status==="already_finalized"&&
    r.attempt_id===f.attemptId&&
    r.score===config.expectedMarks.score&&
    r.max_score===config.expectedMarks.max&&
    r.pending_manual_review===0);
  });
 }
 await gate("student-a-final-receipt-matches-reviewed-expectation",async()=>{
  officialReceipt(await learnerResult(studentA),true);
 });
 await gate("finalized-receipt-has-valid-timestamp",async()=>{
  const r=officialReceipt(await learnerResult(studentA),true);
  must(Date.parse(r.finalized_at)>0);
 });
 await gate("student-a-repeat-result-read-is-stable",async()=>{
  const a=officialReceipt(await learnerResult(studentA),true);
  const b=officialReceipt(await learnerResult(studentA),true);
  must(a.finalized_at===b.finalized_at&&a.score===b.score&&a.max_score===b.max_score);
 });
 await gate("finalized-attempt-matches-receipt-score",async()=>{
  const rows=ok(await studentA.from("user_attempts")
   .select("score,max_score").eq("id",f.attemptId));
  must(Array.isArray(rows)&&rows.length===1&&
   rows[0].score===config.expectedMarks.score&&
   rows[0].max_score===config.expectedMarks.max);
 });
 await gate("finalized-essay-matches-approved-mark",async()=>{
  const rows=ok(await studentA.from("user_answers")
   .select("points_awarded,is_correct").eq("id",f.answerId));
  must(Array.isArray(rows)&&rows.length===1&&
   rows[0].points_awarded===config.awarded&&
   rows[0].is_correct===null);
 });
 await gate("student-b-cannot-read-a-final-result",async()=>{
  must(denied(await learnerResult(studentB)));
 });
 await gate("anonymous-cannot-read-a-final-result",async()=>{
  must(denied(await learnerResult(anon)));
 });
}
try{await main();}
catch{
 if(!cases.some(x=>x.case==="three-distinct-staging-auth-identities"))
  record("three-distinct-staging-auth-identities",false);
}finally{
 let success=true;
 for(const c of [studentA,studentB,reviewer].filter(Boolean)){
  try{const r=await c.auth.signOut();if(r.error)success=false;}
  catch{success=false;}
 }
 signedOut=threeVerified&&success;
 record("all-staging-sessions-signed-out",signedOut);
 evidence();
}
const expected=TRUSTED_FINALIZER_CASES[config?.mode||"preflight"];
if(!config||!threeVerified||!signedOut||
  cases.length!==expected.length||
  expected.some((name,i)=>cases[i]?.case!==name||cases[i]?.result!=="passed")||
  (config.mode==="finalize"&&(!serviceInvoked||!serviceConfirmed))||
  (config.mode!=="finalize"&&(serviceInvoked||serviceConfirmed)))
 process.exitCode=1;
