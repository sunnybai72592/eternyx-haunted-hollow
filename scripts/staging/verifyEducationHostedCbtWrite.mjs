/**
 * ETERNYX Education: opt-in hosted CBT write-path acceptance.
 * PRE-FLIGHT BY DEFAULT. Only the explicit dual-approved "write" mode calls
 * start/save/submit on one pre-provisioned synthetic staging exam.
 * Never uses service_role or admin credentials, deploys SQL, or deletes rows.
 * No user IDs, UUIDs, answer content, error details, tokens or URLs are logged.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  isExplicitAuthorizationDenial, isDeniedOrNoVisibleRow,
} from "./educationHostedMutationDenial.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  validateEducationHostedCbtConfig,
  CBT_STAGING_CASES,
} from "./educationHostedCbtWriteConfig.mjs";

const reportPath="test-results/education-hosted-cbt-write.json";
const syntheticEssay="Synthetic staging exercise: polarization shifts the metal potential.";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const completed=[];
let config, studentA, studentB, guest, accountA, accountB, attemptId, essayAnswerId;
let twoVerified=false,signedOut=false,writesAttempted=false,attemptCreated=false;
function must(value){if(!value)throw new Error("Synthetic staging gate failed");}
function success(result){must(result && !result.error);return result.data;}
function permissionDenied(result){
  const code=String(result?.error?.code || "");
  const msg=String(result?.error?.message || "");
  return Boolean(result?.error && (
    code==="42501" || /permission denied|not authorized|sign.in required|attempt unavailable|not enrolled|access required/i.test(msg)
  ));
}
function invisible(result){
  return permissionDenied(result) ||
    (!result?.error && Array.isArray(result?.data) && result.data.length===0);
}
function client(info){
  return createClient(info.url,info.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{"X-ETERNYX-EDUCATION-STAGING":"synthetic-cbt-rehearsal"}},
  });
}
function pass(name,good){
  completed.push({case:name,result:good?"passed":"failed"});
  process.stdout.write((good?"PASS ":"FAIL ")+name+"\n");
}
async function gate(name,fn){
  try{await fn();pass(name,true);}
  catch{pass(name,false);throw new Error("Staging acceptance refused");}
}
async function assertCatalog(client,examId,includes){
  const data=success(await client.rpc("education_student_enrolled_catalog"));
  must(Array.isArray(data));
  must(data.some(item=>item?.id===examId)===includes);
}
function exactRows(result,count){
  const data=success(result);
  must(Array.isArray(data)&&data.length===count);
  return data;
}
function checkAttempt(data){
  must(data && uuid.test(data.id) &&
    data.user_id===accountA && data.test_id===config.fixture.testId);
}
function ungradedReceipt(result,status){
  const data=success(result);
  must(data && data.attempt_id===attemptId && data.grade_status===status &&
    data.score===null && data.max_score===null && data.finalized_at===null);
  must(JSON.stringify(Object.keys(data).sort())===
    JSON.stringify(["attempt_id","finalized_at","grade_status","max_score","score"]));
}
function report(){
  mkdirSync("test-results",{recursive:true});
  const expected=CBT_STAGING_CASES[config?.mode||"preflight"];
  writeFileSync(reportPath,JSON.stringify({
    schema:1,suite:"education-hosted-cbt-student-write",
    environment:"isolated-supabase-staging",
    mode:config?.mode || "unconfigured",
    configured:Boolean(config),
    distinct_authenticated_students:twoVerified,
    expected_cases:expected.length,
    attempted_cases:completed.length,
    passed_cases:completed.filter(x=>x.result==="passed").length,
    results:completed,
    education_writes_attempted:writesAttempted,
    synthetic_attempt_confirmed:attemptCreated,
    automatic_cleanup_performed:false,
    hosted_sql_deployed_by_test:false,
    production_tested:false,
    production_certified:false,
    sessions_signed_out:signedOut,
  },null,2)+"\n");
}
async function main(){
  config=validateEducationHostedCbtConfig(process.env);
  const f=config.fixture;
  studentA=client(config);studentB=client(config);guest=client(config);
  await gate("two-distinct-verified-test-students",async()=>{
    const a=await studentA.auth.signInWithPassword(config.accounts[0]);
    const b=await studentB.auth.signInWithPassword(config.accounts[1]);
    must(!a.error&&!b.error&&a.data?.user?.id&&b.data?.user?.id);
    const ua=await studentA.auth.getUser();
    const ub=await studentB.auth.getUser();
    must(!ua.error&&!ub.error&&ua.data?.user?.id===a.data.user.id &&
      ub.data?.user?.id===b.data.user.id && ua.data.user.id!==ub.data.user.id);
    accountA=ua.data.user.id;accountB=ub.data.user.id;
    twoVerified=true;
  });
  await gate("student-a-not-admin",async()=>{
    must(success(await studentA.rpc("is_admin"))===false);
  });
  await gate("student-b-not-admin",async()=>{
    must(success(await studentB.rpc("is_admin"))===false);
  });
  await gate("student-a-not-an-instructor",async()=>{
    must(success(await studentA.rpc("education_instructor_access"))?.approved===false);
  });
  await gate("student-b-not-an-instructor",async()=>{
    must(success(await studentB.rpc("education_instructor_access"))?.approved===false);
  });
  await gate("student-a-has-enrollment",async()=>{
    await assertCatalog(studentA,f.testId,true);
  });
  await gate("student-b-has-no-enrollment",async()=>{
    await assertCatalog(studentB,f.testId,false);
  });
  await gate("student-a-can-read-approved-exam",async()=>{
    const data=exactRows(await studentA.from("tests")
      .select("id,is_active,is_published,duration_minutes").eq("id",f.testId),1);
    must(data[0].id===f.testId && data[0].is_active===true &&
      data[0].is_published===true && data[0].duration_minutes>=30);
  });
  await gate("student-a-can-read-mcq-question",async()=>{
    const r=exactRows(await studentA.from("questions")
      .select("id,test_id,question_type").eq("id",f.mcqId),1)[0];
    must(r.id===f.mcqId && r.test_id===f.testId &&
      r.question_type==="multiple_choice");
  });
  await gate("student-a-can-read-written-question",async()=>{
    const r=exactRows(await studentA.from("questions")
      .select("id,test_id,question_type").eq("id",f.essayId),1)[0];
    must(r.id===f.essayId && r.test_id===f.testId &&
      r.question_type==="short_answer");
  });
  await gate("student-a-can-read-safe-option",async()=>{
    const r=exactRows(await studentA.from("options")
      .select("id,question_id,option_text").eq("id",f.mcqOptionId),1)[0];
    must(r.id===f.mcqOptionId && r.question_id===f.mcqId &&
      typeof r.option_text==="string" && r.option_text.length>0);
  });
  await gate("student-b-cannot-read-exam",async()=>{
    must(invisible(await studentB.from("tests").select("id").eq("id",f.testId)));
  });
  await gate("student-a-has-no-existing-attempt",async()=>{
    exactRows(await studentA.from("user_attempts").select("id")
      .eq("test_id",f.testId).eq("user_id",accountA),0);
  });
  await gate("student-b-has-no-existing-attempt",async()=>{
    exactRows(await studentB.from("user_attempts").select("id")
      .eq("test_id",f.testId).eq("user_id",accountB),0);
  });
  await gate("student-a-cannot-read-option-key",async()=>{
    must(permissionDenied(await studentA.from("options")
      .select("id,is_correct").eq("id",f.mcqOptionId)));
  });
  await gate("anonymous-cannot-read-enrolled-catalog",async()=>{
    must(permissionDenied(await guest.rpc("education_student_enrolled_catalog")));
  });

  // The default preflight exits HERE without creating any CBT attempts.
  if(config.mode!=="write")return;

  await gate("student-a-starts-one-staging-attempt",async()=>{
    // The request can reach PostgreSQL even if a network timeout is reported.
    // Keep this conservative "attempted" flag in the sanitized evidence.
    writesAttempted=true;
    const r=success(await studentA.rpc("start_cbt_attempt",{p_test_id:f.testId}));
    must(r?.status==="in_progress"&&typeof r.id==="string"&&uuid.test(r.id));
    attemptId=r.id;attemptCreated=true;
  });
  await gate("student-a-repeated-start-reuses-attempt",async()=>{
    const r=success(await studentA.rpc("start_cbt_attempt",{p_test_id:f.testId}));
    must(r?.id===attemptId && r?.status==="in_progress");
  });
  await gate("student-a-saves-mcq-choice",async()=>{
    const r=success(await studentA.rpc("save_cbt_answer",{
      p_attempt_id:attemptId,p_question_id:f.mcqId,
      p_selected_option_id:f.mcqOptionId,p_short_answer_text:null,
    }));
    must(r?.status==="saved");
  });
  await gate("student-a-saves-written-response",async()=>{
    const r=success(await studentA.rpc("save_cbt_answer",{
      p_attempt_id:attemptId,p_question_id:f.essayId,
      p_selected_option_id:null,p_short_answer_text:syntheticEssay,
    }));
    must(r?.status==="saved");
  });
  await gate("student-a-reads-only-two-owned-responses",async()=>{
    const rows=exactRows(await studentA.from("user_answers")
      .select("id,attempt_id,question_id,selected_option_id,short_answer_text")
      .eq("attempt_id",attemptId),2);
    must(rows.every(x=>x.attempt_id===attemptId) &&
      rows.some(x=>x.question_id===f.mcqId && x.selected_option_id===f.mcqOptionId) &&
      rows.some(x=>x.question_id===f.essayId && x.short_answer_text===syntheticEssay));
    const essay=rows.find(x=>x.question_id===f.essayId);
    must(essay && typeof essay.id==="string" && uuid.test(essay.id));
    essayAnswerId=essay.id;
  });
  await gate("student-a-attempt-in-progress",async()=>{
    const r=exactRows(await studentA.from("user_attempts")
      .select("id,user_id,test_id,status").eq("id",attemptId),1)[0];
    checkAttempt(r);must(r.status==="in_progress");
  });
  await gate("student-b-cannot-read-a-attempt",async()=>{
    must(invisible(await studentB.from("user_attempts")
      .select("id").eq("id",attemptId)));
  });
  await gate("student-b-cannot-read-a-answers",async()=>{
    must(invisible(await studentB.from("user_answers")
      .select("id").eq("attempt_id",attemptId)));
  });
  await gate("student-b-cannot-save-a-answer",async()=>{
    must(permissionDenied(await studentB.rpc("save_cbt_answer",{
      p_attempt_id:attemptId,p_question_id:f.essayId,
      p_selected_option_id:null,p_short_answer_text:syntheticEssay,
    })));
  });
  await gate("student-b-cannot-submit-a-attempt",async()=>{
    must(permissionDenied(await studentB.rpc("submit_cbt_attempt",
      {p_attempt_id:attemptId})));
  });
  // Negative direct Data API mutation probes are NEVER run by the safe preflight.
  // They are deliberately attempted only after operator write approval and only
  // against the synthetic attempt created in THIS run. If a broken grant permits
  // any of them, STOP: preserve the fixture for manual incident review.
  await gate("student-a-cannot-forge-attempt-score",async()=>{
    const r=await studentA.from("user_attempts")
      .update({score:777,max_score:777}).eq("id",attemptId).select("id");
    must(isExplicitAuthorizationDenial(r));
  });
  await gate("student-a-cannot-finalize-attempt-directly",async()=>{
    const r=await studentA.from("user_attempts")
      .update({status:"submitted"}).eq("id",attemptId).select("id");
    must(isExplicitAuthorizationDenial(r));
  });
  await gate("student-a-cannot-insert-forged-attempt",async()=>{
    const r=await studentA.from("user_attempts").insert({
      id:randomUUID(),user_id:accountA,test_id:f.testId,
      status:"submitted",score:777,max_score:777,
      start_time:new Date().toISOString(),end_time:new Date().toISOString(),
    }).select("id");
    must(isExplicitAuthorizationDenial(r));
  });
  await gate("student-a-cannot-forge-written-answer-points",async()=>{
    const r=await studentA.from("user_answers")
      .update({points_awarded:777,is_correct:true})
      .eq("id",essayAnswerId).select("id");
    must(isExplicitAuthorizationDenial(r));
  });
  await gate("student-a-cannot-bypass-answer-save-rpc",async()=>{
    const r=await studentA.from("user_answers")
      .update({short_answer_text:"Synthetic direct-table bypass attempt"})
      .eq("id",essayAnswerId).select("id");
    must(isExplicitAuthorizationDenial(r));
  });
  await gate("student-b-cannot-forge-a-attempt-score",async()=>{
    const r=await studentB.from("user_attempts")
      .update({score:777}).eq("id",attemptId).select("id");
    must(isDeniedOrNoVisibleRow(r));
  });
  await gate("student-b-cannot-forge-a-answer-points",async()=>{
    const r=await studentB.from("user_answers")
      .update({points_awarded:777}).eq("id",essayAnswerId).select("id");
    must(isDeniedOrNoVisibleRow(r));
  });
  await gate("anonymous-cannot-forge-a-attempt-score",async()=>{
    const r=await guest.from("user_attempts")
      .update({score:777}).eq("id",attemptId).select("id");
    must(isDeniedOrNoVisibleRow(r));
  });
  await gate("all-synthetic-records-unchanged-after-direct-tamper",async()=>{
    const attempts=exactRows(await studentA.from("user_attempts")
      .select("id,user_id,test_id,status,score,max_score")
      .eq("test_id",f.testId).eq("user_id",accountA),1);
    must(attempts[0].id===attemptId && attempts[0].status==="in_progress" &&
      attempts[0].score===null && attempts[0].max_score===null);
    const answer=exactRows(await studentA.from("user_answers")
      .select("id,attempt_id,short_answer_text,is_correct,points_awarded")
      .eq("id",essayAnswerId),1)[0];
    must(answer.attempt_id===attemptId&&answer.short_answer_text===syntheticEssay &&
      answer.is_correct===null && answer.points_awarded===null);
  });

  await gate("student-a-submits-staging-exam",async()=>{
    const r=success(await studentA.rpc("submit_cbt_attempt",
      {p_attempt_id:attemptId}));
    must(r?.id===attemptId && r?.status==="submitted");
  });
  await gate("student-a-repeat-submit-is-idempotent",async()=>{
    const r=success(await studentA.rpc("submit_cbt_attempt",
      {p_attempt_id:attemptId}));
    must(r?.id===attemptId&&r?.status==="submitted");
  });
  await gate("student-a-late-save-is-blocked",async()=>{
    const r=success(await studentA.rpc("save_cbt_answer",{
      p_attempt_id:attemptId,p_question_id:f.essayId,
      p_selected_option_id:null,p_short_answer_text:"Synthetic post-submit tamper",
    }));
    must(r?.status==="already_submitted");
  });
  await gate("student-a-has-pending-unverified-result",async()=>{
    ungradedReceipt(await studentA.rpc("education_student_verified_result",
      {p_attempt_id:attemptId}),"pending_review");
  });
  await gate("student-b-cannot-read-a-result",async()=>{
    must(permissionDenied(await studentB.rpc("education_student_verified_result",
      {p_attempt_id:attemptId})));
  });
  await gate("anonymous-cannot-read-a-result",async()=>{
    must(permissionDenied(await guest.rpc("education_student_verified_result",
      {p_attempt_id:attemptId})));
  });
  await gate("student-a-submission-is-persisted",async()=>{
    const r=exactRows(await studentA.from("user_attempts")
      .select("id,user_id,test_id,status,end_time,score,max_score")
      .eq("id",attemptId),1)[0];
    checkAttempt(r);
    must(r.status==="submitted"&&typeof r.end_time==="string"&&
      Number.isFinite(Date.parse(r.end_time)) && r.score===null&&r.max_score===null);
    const answer=exactRows(await studentA.from("user_answers")
      .select("question_id,short_answer_text").eq("attempt_id",attemptId),2);
    must(answer.some(x=>x.question_id===f.essayId&&x.short_answer_text===syntheticEssay));
  });
  await gate("student-a-cannot-read-private-grade-ledger",async()=>{
    must(permissionDenied(await studentA.from("education_final_grades")
      .select("attempt_id,score,max_score").eq("attempt_id",attemptId)));
  });
  await gate("student-b-did-not-gain-an-attempt",async()=>{
    exactRows(await studentB.from("user_attempts")
      .select("id").eq("test_id",f.testId).eq("user_id",accountB),0);
  });
  await gate("student-a-cannot-retake-submitted-exam",async()=>{
    const result=await studentA.rpc("start_cbt_attempt",{p_test_id:f.testId});
    const code=String(result?.error?.code||"");
    must(Boolean(result?.error)&&(code==="22023" ||
      /already completed|expired|already started/i.test(String(result.error.message||""))));
  });
}

try { await main(); }
catch {
  if(!completed.some(x=>x.case==="two-distinct-verified-test-students"))
    pass("two-distinct-verified-test-students",false);
}
finally {
  let ok=true;
  for(const c of [studentA,studentB].filter(Boolean)){
    try {const result=await c.auth.signOut();if(result.error)ok=false;}
    catch{ok=false;}
  }
  signedOut=twoVerified&&ok;
  pass("both-test-sessions-signed-out",signedOut);
  report();
}
const expected=CBT_STAGING_CASES[config?.mode||"preflight"];
if(!config || !twoVerified || !signedOut ||
  completed.length!==expected.length ||
  expected.some((name,i)=>completed[i]?.case!==name||
    completed[i]?.result!=="passed") ||
  (config.mode==="preflight" && (writesAttempted||attemptCreated)) ||
  (config.mode==="write" && (!writesAttempted||!attemptCreated))) {
  process.exitCode=1;
}
