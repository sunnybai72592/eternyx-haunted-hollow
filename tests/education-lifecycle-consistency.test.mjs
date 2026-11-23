import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  educationExamAffectedQueryKeys,educationExamRestoreGate,
  isEducationTerminalAttempt,validateEducationAttemptEnvelope,
} from "../src/lib/educationExamLifecycle.mjs";
import {validateEducationExamQuestions,restoreEducationExamAnswers} from "../src/lib/educationExamResponseIntegrity.mjs";
import {educationDeadlineSafety} from "../src/lib/educationSubmissionRecovery.mjs";
import {createEducationExamReview} from "../src/lib/educationExamReview.mjs";
import {summarizeAttempt} from "../src/lib/educationResults.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const page=read("src/pages/TestInterface.tsx");
const catalog=read("src/pages/Education.tsx");
const history=read("src/pages/EducationHistory.tsx");
const results=read("src/pages/TestResults.tsx");
const doc=read("docs/EDUCATION_EXAM_LIFECYCLE_CONSISTENCY.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const uid=id(1),otherUid=id(2),tid=id(3),aid=id(4),qid=id(10),qid2=id(11),qid3=id(12);
const start="2026-11-22T12:00:00Z";
const attempt={id:aid,status:"in_progress",start_time:start};
const questions=[
 {id:qid,order_index:0,question_text:"Which CP anode has a strong driving voltage?",
  question_type:"multiple_choice",points:4},
 {id:qid2,order_index:1,question_text:"Explain current flow.",
  question_type:"short_answer",points:6},
];
const goodGate=()=>({
 atomicEnabled:true,ownerId:uid,attemptId:aid,
 restoredSuccess:true,restoredScope:uid+":"+aid,
 queueScope:uid+":"+aid,queueReady:true,
});
test("01 active attempt from the server preserves exact id, status, and start",()=>{
 assert.deepEqual(validateEducationAttemptEnvelope(attempt),attempt);
});
test("02 submitted attempt is a known, non-editable terminal lifecycle state",()=>{
 assert.equal(validateEducationAttemptEnvelope({...attempt,status:"submitted"}).status,"submitted");
 assert.equal(isEducationTerminalAttempt("submitted"),true);
});
test("03 server auto-submitted attempt is a terminal state",()=>{
 assert.equal(isEducationTerminalAttempt(validateEducationAttemptEnvelope(
  {...attempt,status:"auto_submitted"}).status),true);
});
test("04 flagged terminal attempt has the same results-navigation availability",()=>{
 assert.equal(isEducationTerminalAttempt(validateEducationAttemptEnvelope(
  {...attempt,status:"cheated"}).status),true);
});
test("05 an in-progress attempt is never mislabeled as submitted",()=>{
 assert.equal(isEducationTerminalAttempt(attempt.status),false);
});
test("06 unknown, expired, future or manually graded statuses do not invent completion",()=>{
 for(const status of ["expired","finalized","graded","pending_review","unknown","",undefined,null])
  assert.equal(isEducationTerminalAttempt(status),false,String(status));
});
test("07 unrecognized server status blocks attempt loading",()=>{
 for(const status of ["finalized","in_progress ","resubmitted","",null,undefined])
  assert.throws(()=>validateEducationAttemptEnvelope({...attempt,status}),/invalid or unsupported/);
});
test("08 malformed attempt ID fails before saved answers can load",()=>{
 for(const wrong of ["bad",null,undefined,"","123"])
  assert.throws(()=>validateEducationAttemptEnvelope({...attempt,id:wrong}),/invalid or unsupported/);
});
test("09 missing start time is rejected rather than granting unlimited time",()=>{
 for(const missing of [null,undefined,"",12,"not-a-time"])
  assert.throws(()=>validateEducationAttemptEnvelope({...attempt,start_time:missing}),/invalid or unsupported/);
});
test("10 invalid server object shape is never trusted",()=>{
 for(const input of [null,undefined,{},[],true,false,"submitted",0])
  assert.throws(()=>validateEducationAttemptEnvelope(input),/invalid or unsupported/);
});
test("11 valid server start timestamps survive round trip without client-generated replacement",()=>{
 const a=validateEducationAttemptEnvelope({...attempt,start_time:"2026-11-23T03:05:07.432+03:00"});
 assert.equal(a.start_time,"2026-11-23T03:05:07.432+03:00");
 assert.equal(a.id,aid);
});
test("12 unexpected private fields are removed from the attempt projection",()=>{
 const a=validateEducationAttemptEnvelope({...attempt,score:99,answer_key:"SECRET",user_id:uid,grade:"pass"});
 assert.deepEqual(Object.keys(a),["id","start_time","status"]);
 assert(!JSON.stringify(a).includes("SECRET"));
 assert(!JSON.stringify(a).includes("pass"));
});
test("13 validated attempt objects are immutable browser hints",()=>{
 assert(Object.isFrozen(validateEducationAttemptEnvelope(attempt)));
});
test("14 legacy mode bypasses only the atomic saved-answer hydration gate",()=>{
 assert.equal(educationExamRestoreGate({atomicEnabled:false}),true);
 assert.equal(educationExamRestoreGate({atomicEnabled:undefined}),true);
});
test("15 a fully hydrated owner/attempt/save-queue scope opens atomic editor",()=>{
 assert.equal(educationExamRestoreGate(goodGate()),true);
});
test("16 downloaded answers alone are not yet hydration",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),restoredScope:null}),false);
});
test("17 pending restored-answers query blocks atomic edits",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),restoredSuccess:false}),false);
});
test("18 cached old account hydration cannot unlock this account",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),restoredScope:otherUid+":"+aid}),false);
});
test("19 cached old account queue cannot unlock the editor",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),queueScope:otherUid+":"+aid}),false);
});
test("20 queued answers from another attempt cannot unlock this attempt",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),queueScope:uid+":"+id(99)}),false);
});
test("21 a missing, disposed or not-yet-created queue blocks edits",()=>{
 for(const queueReady of [false,null,undefined])
  assert.equal(educationExamRestoreGate({...goodGate(),queueReady}),false);
});
test("22 blank owner identity cannot become a hydrated student",()=>{
 for(const ownerId of ["bad",null,undefined,""])
  assert.equal(educationExamRestoreGate({...goodGate(),ownerId}),false);
});
test("23 missing attempt identity cannot become a hydrated exam",()=>{
 for(const attemptId of ["bad",null,undefined,""])
  assert.equal(educationExamRestoreGate({...goodGate(),attemptId}),false);
});
test("24 validation won't accept a spoofed scope with identical suffix but different owner",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),restoredScope:otherUid+":"+aid}),false);
 assert.equal(educationExamRestoreGate({...goodGate(),queueScope:otherUid+":"+aid}),false);
});
test("25 the exact original account and exact attempt are both required",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),ownerId:otherUid}),false);
 assert.equal(educationExamRestoreGate({...goodGate(),attemptId:id(99)}),false);
});
test("26 a mismatched query success flag is not silently coerced to true",()=>{
 for(const restoredSuccess of ["true",1,null])
  assert.equal(educationExamRestoreGate({...goodGate(),restoredSuccess}),false);
});
test("27 exact queue availability is required, not a truthy value",()=>{
 assert.equal(educationExamRestoreGate({...goodGate(),queueReady:"true"}),false);
});
test("28 the queue scope must equal the actual restored account and attempt",()=>{
 const a=goodGate();a.queueScope=uid+":"+id(99);
 assert.equal(educationExamRestoreGate(a),false);
});
test("29 helper gracefully rejects an entirely absent gate object",()=>{
 assert.equal(educationExamRestoreGate(),true); // legacy mode only
});
test("30 saving and results navigation cache keys always include the owner",()=>{
 assert.deepEqual(educationExamAffectedQueryKeys(uid),[
  ["education-owned-attempt-list",uid],
  ["education-private-history",uid],
 ]);
});
test("31 invalid student identity cannot be used to invalidate account data",()=>{
 for(const invalid of [undefined,null,"bad","",true])
  assert.throws(()=>educationExamAffectedQueryKeys(invalid),/authenticated student/);
});
test("32 query key sets are frozen against accidental shared mutation",()=>{
 const keys=educationExamAffectedQueryKeys(uid);
 assert(Object.isFrozen(keys));
 assert(Object.isFrozen(keys[0]));
 assert(Object.isFrozen(keys[1]));
});
test("33 cross-account query keys must not coincide",()=>{
 assert.notDeepEqual(educationExamAffectedQueryKeys(uid),educationExamAffectedQueryKeys(otherUid));
});
test("34 a genuine valid question sequence is accepted before any attempt starts",()=>{
 assert.deepEqual(validateEducationExamQuestions(questions,tid),questions);
});
test("35 repeated order_index makes exam navigation ambiguous and is rejected",()=>{
 assert.throws(()=>validateEducationExamQuestions([
  questions[0],{...questions[1],order_index:0},
 ],tid),/invalid or duplicated/);
});
test("36 missing, negative or fractional order_index fails closed",()=>{
 for(const v of [undefined,null,-1,2.7])
  assert.throws(()=>validateEducationExamQuestions([{...questions[0],order_index:v}],tid),/invalid or duplicated/);
});
test("37 sparse but unique question indices are valid authoring data",()=>{
 const rows=validateEducationExamQuestions([
  {...questions[0],order_index:2},{...questions[1],order_index:10}
 ],tid);
 assert.deepEqual(rows.map(x=>x.order_index),[2,10]);
});
test("38 duplicate question IDs are separately rejected even with distinct order",()=>{
 assert.throws(()=>validateEducationExamQuestions([
  questions[0],{...questions[0],order_index:1}
 ],tid),/invalid or duplicated/);
});
test("39 a real saved answer restores against its exact published question",()=>{
 const saved=restoreEducationExamAnswers([
  {question_id:qid,selected_option_id:id(100),short_answer_text:null},
  {question_id:qid2,selected_option_id:null,short_answer_text:"Anode current flows through electrolyte."},
 ],questions);
 assert.equal(saved.length,2);
 assert.equal(saved[0].selectedOptionId,id(100));
 assert.equal(saved[1].shortAnswer,"Anode current flows through electrolyte.");
});
test("40 restored answers generate an honest local review count, not a grade",()=>{
 const saved=restoreEducationExamAnswers([
  {question_id:qid,selected_option_id:id(100),short_answer_text:null},
 ],questions);
 const review=createEducationExamReview(questions,new Map(saved.map(a=>[a.questionId,a])),new Set());
 assert.equal(review.answered,1);
 assert.equal(review.unanswered,1);
 assert.equal(review.total,2);
 assert(!("grade" in review));
});
test("41 submitted attempt can be identified independently of numeric result",()=>{
 const a=validateEducationAttemptEnvelope({...attempt,status:"submitted"});
 assert.equal(isEducationTerminalAttempt(a.status),true);
 const summary=summarizeAttempt({...a,score:null,max_score:null});
 assert.equal(summary.completed,true);
 assert.equal(summary.graded,false);
});
test("42 a flagged terminal attempt must not be automatically assigned a score",()=>{
 const a=validateEducationAttemptEnvelope({...attempt,status:"cheated"});
 const summary=summarizeAttempt({...a,score:null,max_score:null});
 assert.equal(summary.completed,true);
 assert.equal(summary.graded,false);
});
test("43 deadline safety continues to block edits even if restored answers are ready",()=>{
 const safety=educationDeadlineSafety("in_progress",Date.parse(start),Date.parse(start)+1);
 assert.equal(safety.editAllowed,false);
 assert.equal(educationExamRestoreGate(goodGate()),true);
});
test("44 exam query now validates both atomic and legacy returned attempts",()=>{
 assert.match(page,/validateEducationAttemptEnvelope\(await startCbtAttempt\(testId!\)\)/);
 assert.match(page,/validateEducationAttemptEnvelope\(previous\)/);
 assert.match(page,/validateEducationAttemptEnvelope\(created\)/);
});
test("45 question validation happens before starting a new server attempt",()=>{
 assert.match(page,/validateEducationExamDetails\(test, questions \?\? \[\], testId!\)/);
 assert.match(page,/enabled: enabled && !!testQuery\.data && testQuery\.data\.questions\.length > 0/);
});
test("46 restored answers now hydrate in a pre-paint layout effect",()=>{
 assert.match(page,/useLayoutEffect\(\(\) => \{\s*const scope = user\?\.id \+ ":" \+ attemptQuery\.data\?\.id/);
 assert.match(page,/restoredAttemptRef\.current = scope/);
 assert.match(page,/setAnswers\(new Map\(restoredAnswersQuery\.data\.map/);
});
test("47 actual editor gating checks restored scope before edits or submission",()=>{
 assert.match(page,/const restoreReady = educationExamRestoreGate\(\{/);
 assert.match(page,/restoredScope:restoredAttemptRef\.current/);
 assert.match(page,/queueScope:saveQueueScopeRef\.current/);
 assert.match(page,/restoreReady &&/);
 assert.match(page,/if \(atomicCbtEnabled && !restoreReady && !deadlinePassed\)/);
});
test("48 progress and privacy are account-scoped through query keys and clear-on-switch",()=>{
 assert.match(page,/queryKey: \["education-saved-answers", user\?\.id, attemptQuery\.data\?\.id\]/);
 assert.match(page,/saveQueueRef\.current\?\.dispose\(\)/);
 assert.match(page,/setAnswers\(new Map\(\)\)/);
});
test("49 all terminal statuses route to real results and cannot reopen editing",()=>{
 assert.match(page,/if \(isEducationTerminalAttempt\(attemptQuery\.data\.status\)\)/);
 assert.match(page,/const complete = isEducationTerminalAttempt\(attemptQuery\.data\.status\)/);
 assert.match(page,/navigate\("\/test-results\/" \+ attemptQuery\.data\.id/);
});
test("50 flagged terminal exams are not declared academically guilty by the editor",()=>{
 assert.match(page,/A recorded flag is not, by itself, a determination of wrongdoing/);
});
test("51 both owned catalog and private history queries refresh after true confirmation",()=>{
 assert.match(page,/educationExamAffectedQueryKeys\(ownerId\)/);
 assert.match(page,/refreshOwnedExamViews\(user\.id\)/);
 assert.match(catalog,/queryKey: \["education-owned-attempt-list", user\?\.id\]/);
 assert.match(history,/queryKey:\["education-private-history",user\?\.id,page,status\]/);
});
test("52 a regular submission is blocked until the exact latest answer snapshot is hydrated",()=>{
 assert.match(page,/if \(atomicCbtEnabled && !restoreReady && !deadlinePassed\)/);
 assert.match(page,/Do not submit until the server has restored the attempt/);
});
test("53 expiry can still request server finalization without sending late answer edits",()=>{
 assert.match(page,/const deadlinePassed = deadline !== null && Date\.now\(\) >= deadline/);
 assert.match(page,/if \(restoreReady && Date\.now\(\) < deadline!\)/);
 assert.match(page,/await flushPendingAnswers\(\)/);
 assert.match(page,/await submitCbtAttempt\(attemptId\)/);
});
test("54 a failed private restoration never triggers new exam enrollment or start in the expiry path",()=>{
 const start=page.indexOf("const submitExam =");
 const end=page.indexOf("submitRef.current = submitExam;",start);
 const code=page.slice(start,end);
 assert.doesNotMatch(code,/startCbtAttempt\(|\.insert\(\{/);
 assert.match(code,/submitCbtAttempt\(attemptId\)/);
});
test("55 the expired-attempt notice explains server-only finalize behavior",()=>{
 assert.match(page,/If saved-answer restoration was unavailable, the attempt can still be finalized without resending answers/);
});
test("56 a real verified result never invents a pass mark or certificate",()=>{
 assert.match(results,/A pass or fail result is not shown because a verified passing threshold is not available/);
 assert.match(results,/Reports are downloaded locally and are not certificates/);
});
test("57 all published exam navigation still goes through actual authenticated pages",()=>{
 assert.match(catalog,/educationAttemptNavigation\(test\.id, previous, attemptCheckReady, user\?\.id\)/);
 assert.match(history,/The assessment service rechecks ownership and deadlines when opening an exam/);
 assert.match(results,/\.eq\("id", attemptId!\)\.eq\("user_id", user!\.id\)/);
});
test("58 no staging or production backend action was added to pure lifecycle helpers",()=>{
 const helper=read("src/lib/educationExamLifecycle.mjs");
 assert.doesNotMatch(helper,/supabase\.|fetch\(|localStorage\.|sessionStorage\.|service_role/);
 assert.match(doc,/NOT DEPLOYED/);
 assert.match(doc,/server-side/);
 assert.match(doc,/production/);
});
test("59 exam remains syntactically valid TSX with holistic lifecycle changes",()=>{
 const ast=ts.createSourceFile("TestInterface.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
