/**
 * ETERNYX Education: approved synthetic instructor review + final result reads.
 * Only the explicit "review" mode writes, using a verified instructor JWT.
 * The "verify" mode is READ-ONLY and never invokes trusted service finalizer.
 * All three roles use a Supabase publishable key; no service_role or admin key.
 * No account IDs, exam UUIDs, scores, credentials, raw response or errors in logs.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync,writeFileSync } from "node:fs";
import {validateEducationHostedReviewConfig,REVIEW_STAGE_CASES} from "./educationHostedReviewConfig.mjs";

const target="test-results/education-hosted-instructor-final-grade.json";
const results=[];
let config,owner,studentA,studentB,guest,accountA,accountB,teacherId;
let threeVerified=false,signedOut=false,reviewWriteAttempted=false,reviewWriteConfirmed=false;
function must(ok){if(!ok)throw new Error("Synthetic instructor review acceptance failed");}
function client(c){
  return createClient(c.url,c.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{headers:{"X-ETERNYX-EDUCATION-STAGING":"review-lifecycle-acceptance"}},
  });
}
function succeeded(r){must(r&&!r.error);return r.data;}
function denied(r){
  const code=String(r?.error?.code||"");
  const msg=String(r?.error?.message||"");
  return Boolean(r?.error&&(code==="42501" ||
    /permission denied|sign.in required|review access required|verified instructor access required|unavailable|not authorized/i.test(msg)));
}
function invalid(r){
  const code=String(r?.error?.code||"");
  return Boolean(r?.error&&(code==="22023" || code==="23514"));
}
function invisible(r){
  return denied(r)||(!r?.error&&Array.isArray(r?.data)&&r.data.length===0);
}
function record(name,success){
  results.push({case:name,result:success?"passed":"failed"});
  process.stdout.write((success?"PASS ":"FAIL ")+name+"\n");
}
async function step(name,fn){
  try{await fn();record(name,true);}
  catch{record(name,false);throw new Error("Staging reviewer acceptance halted");}
}
const reviewQueue=()=>owner.rpc("education_instructor_written_review_queue");
const studentResult=(c)=>c.rpc("education_student_verified_result",{p_attempt_id:config.fixture.attemptId});
const mark=(c,points)=>c.rpc("education_instructor_review_written_answer",{
  p_answer_id:config.fixture.answerId,p_points:points,
});
function queueRow(r){
  const entries=succeeded(r);
  must(Array.isArray(entries));
  const matches=entries.filter(x=>x?.attempt_id===config.fixture.attemptId &&
    x?.answer_id===config.fixture.answerId &&
    x?.test_id===config.fixture.testId);
  must(matches.length===1);
  must(typeof matches[0].response_text==="string"&&
    matches[0].response_text.trim().length>0 &&
    Number.isSafeInteger(matches[0].points_possible) &&
    matches[0].points_possible>=config.awarded);
  return matches[0];
}
function receipt(raw,state){
  const r=succeeded(raw);
  must(r && typeof r==="object" && !Array.isArray(r));
  must(JSON.stringify(Object.keys(r).sort())===
    JSON.stringify(["attempt_id","finalized_at","grade_status","max_score","score"]));
  must(r.attempt_id===config.fixture.attemptId&&r.grade_status===state);
  if(state==="pending_review"){
    must(r.score===null&&r.max_score===null&&r.finalized_at===null);
  }else{
    must(r.score===config.marks.score && r.max_score===config.marks.max &&
      typeof r.finalized_at==="string" && Number.isFinite(Date.parse(r.finalized_at)));
  }
  return r;
}
function report(){
  mkdirSync("test-results",{recursive:true});
  const expected=REVIEW_STAGE_CASES[config?.mode||"preflight"];
  writeFileSync(target,JSON.stringify({
    schema:1,suite:"education-hosted-instructor-final-grade",
    environment:"isolated-supabase-staging",
    mode:config?.mode||"unconfigured",configured:Boolean(config),
    three_distinct_authenticated_accounts:threeVerified,
    expected_cases:expected.length,attempted_cases:results.length,
    passed_cases:results.filter(x=>x.result==="passed").length,results,
    instructor_review_write_attempted:reviewWriteAttempted,
    instructor_review_write_confirmed:reviewWriteConfirmed,
    trusted_finalizer_invoked:false,
    education_schema_deployed_by_test:false,
    production_tested:false,production_certified:false,
    sessions_signed_out:signedOut,
  },null,2)+"\n");
}
async function main(){
  config=validateEducationHostedReviewConfig(process.env);
  const f=config.fixture;
  studentA=client(config);studentB=client(config);owner=client(config);guest=client(config);
  await step("three-distinct-real-auth-identities",async()=>{
    const creds=[config.accounts[0],config.accounts[1],config.instructorAccount];
    const users=[];
    for(const [i,c] of [studentA,studentB,owner].entries()){
      const signIn=await c.auth.signInWithPassword(creds[i]);
      must(!signIn.error && signIn.data?.user?.id);
      const verified=await c.auth.getUser();
      must(!verified.error && verified.data?.user?.id===signIn.data.user.id);
      users.push(verified.data.user.id);
    }
    must(new Set(users).size===3);
    [accountA,accountB,teacherId]=users;
    threeVerified=true;
  });
  await step("instructor-verified-by-grant",async()=>{
    must(succeeded(await owner.rpc("education_instructor_access"))?.approved===true);
  });
  await step("instructor-is-not-an-admin",async()=>{
    must(succeeded(await owner.rpc("is_admin"))===false);
  });
  for(const [name,c] of [
    ["student-a-is-not-an-instructor",studentA],
    ["student-b-is-not-an-instructor",studentB],
  ]){
    await step(name,async()=>{
      must(succeeded(await c.rpc("education_instructor_access"))?.approved===false);
    });
  }
  await step("student-a-owns-submitted-attempt",async()=>{
    const r=succeeded(await studentA.from("user_attempts")
      .select("id,test_id,user_id,status,end_time,score,max_score")
      .eq("id",f.attemptId));
    must(Array.isArray(r)&&r.length===1&&r[0].id===f.attemptId &&
      r[0].test_id===f.testId&&r[0].user_id===accountA&&
      ["submitted","auto_submitted"].includes(r[0].status)&&r[0].end_time);
    if(config.mode!=="verify")must(r[0].score===null&&r[0].max_score===null);
    else must(r[0].score===config.marks.score&&r[0].max_score===config.marks.max);
  });
  await step("student-a-owns-written-answer",async()=>{
    const r=succeeded(await studentA.from("user_answers")
      .select("id,attempt_id,short_answer_text,question_id")
      .eq("id",f.answerId));
    must(Array.isArray(r)&&r.length===1&&r[0].attempt_id===f.attemptId &&
      typeof r[0].short_answer_text==="string"&&r[0].short_answer_text.trim().length>0);
    // Prevent accepting an objective answer record as a reviewed essay.
    const question=succeeded(await studentA.from("questions")
      .select("id,question_type,test_id").eq("id",r[0].question_id));
    must(Array.isArray(question)&&question.length===1 &&
      question[0].test_id===f.testId &&
      question[0].question_type==="short_answer");
  });
  await step("instructor-owns-submitted-review-queue-item",async()=>{
    queueRow(await reviewQueue());
  });
  if(config.mode!=="verify"){
    await step("instructor-review-is-unrecorded",async()=>{
      const row=queueRow(await reviewQueue());
      must(row.reviewed_points===null);
    });
    await step("student-a-result-pending",async()=>{
      receipt(await studentResult(studentA),"pending_review");
    });
  }
  await step("student-b-cannot-read-a-attempt",async()=>{
    must(invisible(await studentB.from("user_attempts").select("id").eq("id",f.attemptId)));
  });
  await step("student-b-cannot-read-a-written-answer",async()=>{
    must(invisible(await studentB.from("user_answers").select("id").eq("id",f.answerId)));
  });
  for(const [name,c] of [
    ["student-a-cannot-select-private-review-table",studentA],
    ["student-b-cannot-select-private-review-table",studentB],
    ["anonymous-cannot-select-private-review-table",guest],
  ]){
    await step(name,async()=>{
      must(denied(await c.from("education_written_reviews")
        .select("answer_id,points_awarded").eq("answer_id",f.answerId)));
    });
  }
  if(config.mode!=="verify"){
    for(const [name,c] of [
      ["student-a-cannot-write-manual-review",studentA],
      ["student-b-cannot-write-manual-review",studentB],
      ["anonymous-cannot-write-manual-review",guest],
    ]){
      await step(name,async()=>{
        must(denied(await mark(c,config.awarded)));
      });
    }
  }
  if(config.mode==="preflight")return;
  if(config.mode==="review"){
    await step("instructor-records-synthetic-human-mark",async()=>{
      reviewWriteAttempted=true;
      const r=succeeded(await mark(owner,config.awarded));
      must(r?.status==="review_recorded"&&
        r?.answer_id===f.answerId &&
        r?.points_awarded===config.awarded &&
        r?.official_score_updated===false);
      reviewWriteConfirmed=true;
    });
    await step("instructor-queue-records-reviewed-points",async()=>{
      must(queueRow(await reviewQueue()).reviewed_points===config.awarded);
    });
    await step("instructor-idempotent-same-points",async()=>{
      const r=succeeded(await mark(owner,config.awarded));
      must(r?.status==="review_recorded"&&r?.points_awarded===config.awarded&&
        r?.official_score_updated===false);
    });
    await step("invalid-above-maximum-review-rejected",async()=>{
      const row=queueRow(await reviewQueue());
      must(invalid(await mark(owner,row.points_possible+1)));
    });
    await step("review-points-unchanged-after-rejection",async()=>{
      must(queueRow(await reviewQueue()).reviewed_points===config.awarded);
    });
    await step("student-grade-still-pending-after-review",async()=>{
      receipt(await studentResult(studentA),"pending_review");
    });
    await step("attempt-score-still-null-before-finalizer",async()=>{
      const rows=succeeded(await studentA.from("user_attempts")
        .select("score,max_score").eq("id",f.attemptId));
      must(Array.isArray(rows)&&rows.length===1&&rows[0].score===null&&rows[0].max_score===null);
    });
    await step("student-b-still-cannot-see-review",async()=>{
      must(denied(await studentB.from("education_written_reviews")
        .select("answer_id,points_awarded").eq("answer_id",f.answerId)));
    });
    await step("anonymous-still-cannot-see-review",async()=>{
      must(denied(await guest.from("education_written_reviews")
        .select("answer_id,points_awarded").eq("answer_id",f.answerId)));
    });
    return;
  }
  // READ ONLY. An authorized staging operator must independently execute
  // trusted atomic grading under the established service-role workflow.
  await step("instructor-queue-shows-reviewed-points",async()=>{
    must(queueRow(await reviewQueue()).reviewed_points===config.awarded);
  });
  await step("student-a-ledger-backed-final-grade",async()=>{
    receipt(await studentResult(studentA),"finalized");
  });
  await step("student-a-score-matches-approved-expectation",async()=>{
    const r=receipt(await studentResult(studentA),"finalized");
    must(r.score<=r.max_score);
  });
  await step("student-a-verified-final-timestamp",async()=>{
    const r=receipt(await studentResult(studentA),"finalized");
    must(Date.parse(r.finalized_at)>0);
  });
  await step("student-a-repeated-read-stable",async()=>{
    const a=receipt(await studentResult(studentA),"finalized");
    const b=receipt(await studentResult(studentA),"finalized");
    must(a.finalized_at===b.finalized_at&&a.score===b.score&&a.max_score===b.max_score);
  });
  await step("student-b-cannot-read-final",async()=>{
    must(denied(await studentResult(studentB)));
  });
  await step("anonymous-cannot-read-final",async()=>{
    must(denied(await studentResult(guest)));
  });
  for(const [name,c] of [
    ["student-a-cannot-select-grade-ledger",studentA],
    ["student-b-cannot-select-grade-ledger",studentB],
    ["anonymous-cannot-select-grade-ledger",guest],
  ]){
    await step(name,async()=>{
      must(denied(await c.from("education_final_grades")
        .select("attempt_id,score,max_score").eq("attempt_id",f.attemptId)));
    });
  }
  await step("final-attempt-marks-match-receipt",async()=>{
    const rows=succeeded(await studentA.from("user_attempts")
      .select("score,max_score").eq("id",f.attemptId));
    must(Array.isArray(rows)&&rows.length===1 &&
      rows[0].score===config.marks.score&&rows[0].max_score===config.marks.max);
  });
  await step("final-written-answer-credit-matches-reviewed-mark",async()=>{
    const rows=succeeded(await studentA.from("user_answers")
      .select("points_awarded,is_correct").eq("id",f.answerId));
    must(Array.isArray(rows)&&rows.length===1&&rows[0].points_awarded===config.awarded &&
      rows[0].is_correct===null);
  });
}
try{await main();}
catch{
  if(!results.some(r=>r.case==="three-distinct-real-auth-identities"))
    record("three-distinct-real-auth-identities",false);
}finally{
  let ok=true;
  for(const c of [studentA,studentB,owner].filter(Boolean)){
    try{const response=await c.auth.signOut();if(response.error)ok=false;}
    catch{ok=false;}
  }
  signedOut=threeVerified&&ok;
  record("three-auth-sessions-signed-out",signedOut);
  report();
}
const expected=REVIEW_STAGE_CASES[config?.mode||"preflight"];
if(!config||!threeVerified||!signedOut||
   results.length!==expected.length ||
   expected.some((name,i)=>results[i]?.case!==name||results[i]?.result!=="passed")||
   (config.mode==="review"&&(!reviewWriteAttempted||!reviewWriteConfirmed))||
   (config.mode!=="review"&&(reviewWriteAttempted||reviewWriteConfirmed)))
  process.exitCode=1;
