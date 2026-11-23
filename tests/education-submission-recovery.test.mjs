import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
 educationDeadlineSafety,educationSubmissionReadScope,
 educationSubmissionRecoveryMessage,verifyEducationOwnedSubmission,
} from "../src/lib/educationSubmissionRecovery.mjs";

const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/pages/TestInterface.tsx");
const doc=read("docs/EDUCATION_SUBMISSION_RECOVERY.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const attemptId=id(10),ownerId=id(11),testId=id(12),otherId=id(13);
const deadline=Date.parse("2026-11-23T13:00:00Z");
const original={
 id:attemptId,user_id:ownerId,test_id:testId,status:"in_progress",
 start_time:"2026-11-23T12:00:00Z",end_time:null,
};
const verify=(row=original)=>verifyEducationOwnedSubmission(row,attemptId,ownerId,testId);
test("01 an exact server deadline with one millisecond remaining permits editing",()=>{
 const x=educationDeadlineSafety("in_progress",deadline,deadline-1);
 assert.deepEqual(x,{editAllowed:true,expired:false,deadlineKnown:true,state:"open"});
});
test("02 reaching the deadline immediately blocks editing and flags expiry",()=>{
 assert.deepEqual(educationDeadlineSafety("in_progress",deadline,deadline),{
  editAllowed:false,expired:true,deadlineKnown:true,state:"expired",
 });
});
test("03 late current time does not extend the exam",()=>{
 assert.equal(educationDeadlineSafety("in_progress",deadline,deadline+123456).state,"expired");
});
test("04 unknown deadline fails closed without inventing expiry or future time",()=>{
 for(const v of [null,undefined,NaN,Infinity,-Infinity,0,-1,"2026-11-23",1.5]){
  const x=educationDeadlineSafety("in_progress",v,deadline-1);
  assert.equal(x.editAllowed,false,String(v));
  assert.equal(x.deadlineKnown,false,String(v));
  assert.equal(x.state,"unavailable",String(v));
 }
});
test("05 missing or invalid clock reading never grants edit permission",()=>{
 for(const value of [NaN,Infinity,-1])
  assert.equal(educationDeadlineSafety("in_progress",deadline,value).editAllowed,false);
});
test("06 non-in-progress attempts never reopen edits",()=>{
 for(const status of ["submitted","auto_submitted","cheated","graded","pending_review",null]){
  assert.equal(educationDeadlineSafety(status,deadline,deadline-1000).editAllowed,false);
 }
});
test("07 confirmed terminal statuses remain distinct from unknown statuses",()=>{
 for(const status of ["submitted","auto_submitted","cheated"]){
  assert.equal(educationDeadlineSafety(status,deadline,deadline).state,"submitted");
 }
 assert.equal(educationDeadlineSafety("graded",deadline,deadline).state,"unavailable");
});
test("08 status projections are immutable",()=>{
 assert(Object.isFrozen(educationDeadlineSafety("in_progress",deadline,deadline-1000)));
});
test("09 valid authenticated exact-match receipt represents in-progress, not success",()=>{
 const x=verify();
 assert.deepEqual(x,{
  id:attemptId,status:"in_progress",confirmed:false,flagged:false,
  startedAt:original.start_time,endedAt:null,
 });
});
test("10 confirmed normal submit must come from real owner-matched server row",()=>{
 const x=verify({...original,status:"submitted",end_time:"2026-11-23T12:29:00Z"});
 assert.equal(x.confirmed,true);
 assert.equal(x.status,"submitted");
 assert.equal(x.flagged,false);
});
test("11 confirmed automatic expiry submit is valid final status",()=>{
 assert.equal(verify({...original,status:"auto_submitted"}).confirmed,true);
});
test("12 submitted flagged status is distinguished from a grade/misconduct verdict",()=>{
 const x=verify({...original,status:"cheated"});
 assert.equal(x.confirmed,true);
 assert.equal(x.flagged,true);
});
test("13 another user's private receipt cannot confirm this attempt",()=>{
 assert.throws(()=>verify({...original,user_id:otherId}),/could not be verified/);
});
test("14 response for another test cannot confirm this attempt",()=>{
 assert.throws(()=>verify({...original,test_id:otherId}),/could not be verified/);
});
test("15 response for a different attempt cannot confirm this one",()=>{
 assert.throws(()=>verify({...original,id:otherId}),/could not be verified/);
});
test("16 wrong UUID arguments cause immediate denial",()=>{
 for(const invalid of ["bad",null,undefined,""]){
  assert.throws(()=>verifyEducationOwnedSubmission(original,invalid,ownerId,testId),/could not be verified/);
  assert.throws(()=>verifyEducationOwnedSubmission(original,attemptId,invalid,testId),/could not be verified/);
  assert.throws(()=>verifyEducationOwnedSubmission(original,attemptId,ownerId,invalid),/could not be verified/);
 }
});
test("17 null or unexpected response structures cannot establish success",()=>{
 for(const value of [null,undefined,[],true,0,"submitted"])
  assert.throws(()=>verifyEducationOwnedSubmission(value,attemptId,ownerId,testId),/could not be verified/);
});
test("18 unexpected statuses are never treated as verified completion",()=>{
 for(const status of ["graded","pending","expired","failed","in_progress ","success",null]){
  assert.throws(()=>verify({...original,status}),/could not be verified/);
 }
});
test("19 missing or invalid original server start time fails closed",()=>{
 for(const start_time of [null,"","invalid",0]){
  assert.throws(()=>verify({...original,start_time}),/start time/);
 }
});
test("20 invalid end timestamp also invalidates an otherwise submitted receipt",()=>{
 for(const end_time of ["not-date",0,{}]){
  assert.throws(()=>verify({...original,status:"submitted",end_time}),/completion timestamp/);
 }
});
test("21 missing end time doesn't fabricate one",()=>{
 assert.equal(verify({...original,status:"submitted",end_time:undefined}).endedAt,null);
});
test("22 untrusted source fields are not included in the verified projection",()=>{
 const x=verify({...original,score:50,points_awarded:42,
  answer_key:"SECRET",student_email:"private@example.com"});
 const serialized=JSON.stringify(x);
 for(const word of ["SECRET","private@example.com","score","points_awarded"])
  assert(!serialized.includes(word));
});
test("23 receipt can't be mutated by downstream UI",()=>{
 assert(Object.isFrozen(verify({...original,status:"submitted"})));
});
test("24 status read scope requires three exact UUIDs",()=>{
 assert.deepEqual(educationSubmissionReadScope(attemptId,ownerId,testId),
  {attemptId,ownerId,testId});
 assert(Object.isFrozen(educationSubmissionReadScope(attemptId,ownerId,testId)));
});
test("25 invalid status-read scopes cannot ever start a new attempt",()=>{
 for(const bad of ["bad",null,undefined]){
  assert.throws(()=>educationSubmissionReadScope(bad,ownerId,testId),/Authenticated/);
  assert.throws(()=>educationSubmissionReadScope(attemptId,bad,testId),/Authenticated/);
  assert.throws(()=>educationSubmissionReadScope(attemptId,ownerId,bad),/Authenticated/);
 }
});
test("26 no receipt yields an honest status-unverified message",()=>{
 assert.match(educationSubmissionRecoveryMessage(null,deadline,deadline),/not been verified/);
});
test("27 normal owner-confirmed receipt gives an unambiguous success message",()=>{
 assert.match(educationSubmissionRecoveryMessage(verify({...original,status:"submitted"}),deadline),
  /Server confirms the attempt is submitted/);
});
test("28 flagged receipt message doesn't claim score or pass",()=>{
 const msg=educationSubmissionRecoveryMessage(verify({...original,status:"cheated"}),deadline);
 assert.match(msg,/flagged/);
 assert(!msg.includes("failed grade"));
});
test("29 in-progress before deadline offers deliberate retry and save review",()=>{
 const msg=educationSubmissionRecoveryMessage(verify(),deadline,deadline-1000);
 assert.match(msg,/Server still reports this attempt in progress/);
 assert.match(msg,/Check saved answers and retry/);
});
test("30 in-progress after expiry does not invite late answers",()=>{
 const msg=educationSubmissionRecoveryMessage(verify(),deadline,deadline);
 assert.match(msg,/original deadline/);
 assert.match(msg,/late answers cannot be accepted/);
});
test("31 unknown deadline refuses to encourage editing",()=>{
 const msg=educationSubmissionRecoveryMessage(verify(),null);
 assert.match(msg,/deadline cannot be verified/);
 assert.match(msg,/Do not edit or submit/);
});
test("32 unsupported response cannot be presented as confirmed",()=>{
 const msg=educationSubmissionRecoveryMessage({status:"accepted",confirmed:false},deadline);
 assert.match(msg,/No submission was confirmed/);
});
test("33 the UI uses the ORIGINAL server start to derive deadline",()=>{
 assert.match(ui,/examDeadline\(attemptQuery\.data\?\.start_time, testQuery\.data\?\.duration_minutes\)/);
 assert.match(ui,/educationDeadlineSafety\(attemptQuery\.data\?\.status, deadline\)/);
 assert.match(ui,/deadlineSafety\.editAllowed/);
});
test("34 old stale remaining-state can no longer unlock expired editing",()=>{
 assert.match(ui,/const expired = deadlineSafety\.expired/);
 assert.doesNotMatch(ui,/const expired = remaining === 0/);
 assert.match(ui,/!deadlineSafety\.deadlineKnown/);
});
test("35 unknown original start prevents browser submission",()=>{
 assert.match(ui,/if \(!educationDeadlineSafety\("in_progress",deadline\)\.deadlineKnown\)/);
 assert.match(ui,/This attempt's original deadline cannot be verified/);
});
test("36 server receipt query is triple owner-scoped, read-only and exact",()=>{
 assert.match(ui,/\.select\("id,user_id,test_id,status,start_time,end_time"\)/);
 assert.match(ui,/\.eq\("id",scope\.attemptId\)/);
 assert.match(ui,/\.eq\("user_id",scope\.ownerId\)/);
 assert.match(ui,/\.eq\("test_id",scope\.testId\)/);
 assert.match(ui,/\.maybeSingle\(\)/);
});
test("37 manual status checker doesn't create a new attempt",()=>{
 const begin=ui.indexOf("const checkSubmissionStatus =");
 const end=ui.indexOf("const submitExam =",begin);
 const check=ui.slice(begin,end);
 assert.match(check,/readOwnedSubmissionStatus\(/);
 assert.doesNotMatch(check,/startCbtAttempt\(|submitCbtAttempt\(|\.insert\(/);
});
test("38 lost HTTP acknowledgment triggers a verified status read before declaring failure",()=>{
 assert.match(ui,/const receipt=await readOwnedSubmissionStatus\(attemptQuery\.data\.id,user\.id,testId!\)/);
 assert.match(ui,/Submission could not be confirmed/);
 assert.match(ui,/Server status check is unavailable|server status check is unavailable/);
});
test("39 real confirmed result navigates to exact recorded attempt",()=>{
 assert.match(ui,/if\(receipt\.confirmed\)/);
 assert.match(ui,/navigate\("\/test-results\/"\+receipt\.id,\{replace:true\}\)/);
 assert.match(ui,/invalidateQueries\(\{queryKey:\["education-owned-attempt-list",user\.id\]\}\)/);
});
test("40 unexpected or mismatched atomic RPC receipt cannot claim submission",()=>{
 assert.match(ui,/result\.id !== attemptId/);
 assert.match(ui,/The server did not confirm this exact assessment submission/);
});
test("41 manual status check is available in uncertain state",()=>{
 assert.match(ui,/submissionUncertain \|\| !deadlineSafety\.deadlineKnown/);
 assert.match(ui,/Check server submission status/);
 assert.match(ui,/statusCheckBusy/);
});
test("42 manual and automatic status reads don't write grades or extend clocks",()=>{
 assert.match(ui,/This reads the existing owner-scoped attempt/);
 assert.match(ui,/does not create another attempt/);
 assert.match(ui,/extend the exam clock or publish a grade/);
});
test("43 any unresolved original deadline is visibly unverified",()=>{
 assert.match(ui,/Unverified" : remaining === null/);
 assert.match(ui,/No extra exam time is granted/);
});
test("44 answer-saving path remains serialized and status truthful",()=>{
 assert.match(ui,/await flushPendingAnswers\(\)/);
 assert.match(ui,/await submitCbtAttempt\(attemptId\)/);
 assert.match(ui,/saveQueueRef\.current\.enqueue\(nextAnswer\)/);
});
test("45 if an answer save fails after deadline the server still gets finalization request",()=>{
 assert.match(ui,/if \(!dueToExpiry && Date\.now\(\) < deadline!\) throw error/);
 assert.match(ui,/The queue retains the latest answer/);
});
test("46 stale response after account switch is fenced from both navigation and UI",()=>{
 assert.match(ui,/submissionGenerationRef\.current \+= 1/);
 assert.match(ui,/if\(generation!==submissionGenerationRef\.current\)return/);
 assert.match(ui,/if\(generation===submissionGenerationRef\.current\)/);
 assert.match(ui,/queryClient\.setQueryData<Attempt>\(/);
 assert.match(ui,/existing => existing\?\.id===receipt\.id/);
 assert.match(ui,/start_time:receipt\.startedAt/);
});
test("47 account change resets uncertain state and pending check",()=>{
 assert.match(ui,/setSubmissionUncertain\(false\)/);
 assert.match(ui,/setStatusCheckBusy\(false\)/);
 assert.match(ui,/setRemaining\(null\)/);
 assert.match(ui,/setNotice\(""\)/);
});
test("48 browser expiry timer still depends on stored deadline and doesn't reset on refresh",()=>{
 assert.match(ui,/examSecondsRemaining\(deadline\)/);
 assert.match(ui,/void submitRef\.current\(true\)/);
 assert.match(ui,/window\.setInterval\(tick, 1000\)/);
});
test("49 legacy exam path is still explicitly marked non-atomic",()=>{
 assert.match(ui,/Legacy path is retained only/);
 assert.match(ui,/high-stakes deployment/);
 assert.match(ui,/\.eq\("id", attemptId\)\.eq\("user_id", user\.id\)/);
});
test("50 no grades, correctness or fake server confirmation in read-only helper",()=>{
 const source=read("src/lib/educationSubmissionRecovery.mjs");
 assert.doesNotMatch(source,/supabase\.rpc|\.from\("|fetch\(|localStorage\./);
 assert.doesNotMatch(source,/award_certificate|points_awarded|is_correct/);
});
test("51 documentation discloses staging and immutable server authority",()=>{
 assert.match(doc,/NOT DEPLOYED/);
 assert.match(doc,/server-side/);
 assert.match(doc,/production/);
 assert.match(doc,/owner/);
});
test("52 exam UI still parses as TSX with recovery controls",()=>{
 const ast=ts.createSourceFile("TestInterface.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
