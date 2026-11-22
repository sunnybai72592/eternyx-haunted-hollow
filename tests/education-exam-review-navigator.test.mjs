import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  createEducationExamReview,isEducationQuestionAnswered,
  nextEducationReviewIndex,toggleEducationReviewFlag,
  educationReviewSummaryMessage,
} from "../src/lib/educationExamReview.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/pages/TestInterface.tsx");
const guide=read("docs/EDUCATION_EXAM_REVIEW_NAVIGATOR.md");
const questions=[
  {id:"q1",question_text:"Corrosion question"},
  {id:"q2",question_text:"Another question"},
  {id:"q3",question_text:"Third question"},
  {id:"q4",question_text:"Explain polarization"},
];
const answers=new Map([
  ["q1",{questionId:"q1",selectedOptionId:"option1"}],
  ["q2",{questionId:"q2",shortAnswer:"  "}],
  ["q4",{questionId:"q4",shortAnswer:"  Polarization  "}],
  ["ghost",{questionId:"ghost",selectedOptionId:"do-not-count"}],
]);
const flags=new Set(["q2","q4","ghost"]);

test("01 objective answer with selected option counts as answered",()=>{
 assert.equal(isEducationQuestionAnswered({selectedOptionId:"abc"}),true);
});
test("02 meaningful written text counts as answered",()=>{
 assert.equal(isEducationQuestionAnswered({shortAnswer:"  corrosion  "}),true);
});
test("03 whitespace written text remains unanswered",()=>{
 assert.equal(isEducationQuestionAnswered({shortAnswer:"  \t\n "}),false);
});
test("04 blank and missing option selection remain unanswered",()=>{
 for(const item of [null,undefined,{}, {selectedOptionId:""}, {selectedOptionId:"   "},
  {selectedOptionId:null,shortAnswer:0}])
  assert.equal(isEducationQuestionAnswered(item),false);
});
test("05 review counts only listed exam question IDs, never restored unknown ones",()=>{
 const review=createEducationExamReview(questions,answers,flags);
 assert.equal(review.total,4);
 assert.equal(review.answered,2);
 assert.equal(review.unanswered,2);
 assert.equal(review.flagged,2);
});
test("06 review entries contain no answer text, option IDs, correctness or grades",()=>{
 const review=createEducationExamReview(questions,answers,flags);
 assert.deepEqual(review.entries[0],{
  id:"q1",index:0,number:1,answered:true,flagged:false,
 });
 assert(!JSON.stringify(review).includes("Polarization"));
 assert(!JSON.stringify(review).includes("option1"));
});
test("07 review snapshots are read-only",()=>{
 const review=createEducationExamReview(questions,answers,flags);
 assert(Object.isFrozen(review));
 assert(Object.isFrozen(review.entries));
 assert(Object.isFrozen(review.entries[0]));
});
test("08 flags can coexist with answered response without changing submission",()=>{
 const review=createEducationExamReview(questions,answers,flags);
 assert.equal(review.entries[3].answered,true);
 assert.equal(review.entries[3].flagged,true);
});
test("09 a fully answered exam has zero unanswered and is ready for review",()=>{
 const full=new Map(questions.map(q=>[q.id,{selectedOptionId:"s"}]));
 const review=createEducationExamReview(questions,full,new Set());
 assert.equal(review.unanswered,0);
 assert.equal(review.readyToReview,true);
});
test("10 an unanswered exam remains reviewable but not falsely complete",()=>{
 const review=createEducationExamReview(questions,new Map(),new Set());
 assert.equal(review.unanswered,4);
 assert.equal(review.readyToReview,false);
});
test("11 duplicated/blank question identifiers fail closed",()=>{
 assert.throws(()=>createEducationExamReview([{id:"q1"},{id:"q1"}],new Map(),new Set()),/unique IDs/);
 assert.throws(()=>createEducationExamReview([{id:""}],new Map(),new Set()),/unique IDs/);
});
test("12 malformed review arguments never fabricate counts",()=>{
 assert.throws(()=>createEducationExamReview({},new Map(),new Set()),/Invalid/);
 assert.throws(()=>createEducationExamReview(questions,{},new Set()),/Invalid/);
 assert.throws(()=>createEducationExamReview(questions,new Map(),[]),/Invalid/);
});
test("13 flag toggle adds a valid existing question without mutating prior flags",()=>{
 const current=new Set(["q1"]);
 const next=toggleEducationReviewFlag(current,"q2",questions);
 assert.deepEqual([...next],["q1","q2"]);
 assert.deepEqual([...current],["q1"]);
});
test("14 clicking an existing review flag removes it",()=>{
 const next=toggleEducationReviewFlag(new Set(["q2","q4"]),"q2",questions);
 assert.deepEqual([...next],["q4"]);
});
test("15 flagging unknown IDs cannot be used to leak or impersonate another exam",()=>{
 assert.throws(()=>toggleEducationReviewFlag(new Set(),"ghost",questions),/unrecognized/);
 assert.throws(()=>toggleEducationReviewFlag(new Set(),"q1",[]),/unrecognized/);
});
test("16 navigation to next unanswered returns genuine original question index",()=>{
 const r=createEducationExamReview(questions,answers,flags);
 assert.equal(nextEducationReviewIndex(r.entries,0,"unanswered"),1);
 assert.equal(nextEducationReviewIndex(r.entries,1,"unanswered"),2);
});
test("17 next unanswered wraps after last question",()=>{
 const r=createEducationExamReview(questions,answers,flags);
 assert.equal(nextEducationReviewIndex(r.entries,3,"unanswered"),1);
});
test("18 next flagged uses marks even on already answered questions",()=>{
 const r=createEducationExamReview(questions,answers,flags);
 assert.equal(nextEducationReviewIndex(r.entries,1,"flagged"),3);
 assert.equal(nextEducationReviewIndex(r.entries,3,"flagged"),1);
});
test("19 absent unanswered or flagged target returns -1",()=>{
 const r=createEducationExamReview(questions,new Map(questions.map(q=>[q.id,{shortAnswer:"done"}])),new Set());
 assert.equal(nextEducationReviewIndex(r.entries,0,"unanswered"),-1);
 assert.equal(nextEducationReviewIndex(r.entries,2,"flagged"),-1);
});
test("20 zero-question navigation and invalid modes fail safe",()=>{
 assert.equal(nextEducationReviewIndex([],0,"flagged"),-1);
 assert.equal(nextEducationReviewIndex([],0,"unanswered"),-1);
 assert.equal(nextEducationReviewIndex([{answered:false,flagged:true}],NaN,"flagged"),-1);
 assert.equal(nextEducationReviewIndex([{answered:false,flagged:true}],0,"incorrect"),-1);
});
test("21 review summary is truthful and has clear singular/plural counts",()=>{
 assert.equal(educationReviewSummaryMessage(createEducationExamReview(questions,answers,flags)),
  "2 unanswered questions · 2 flagged for review.");
 assert.equal(educationReviewSummaryMessage({total:1,unanswered:1,flagged:1}),
  "1 unanswered question · 1 flagged for review.");
 assert.equal(educationReviewSummaryMessage(null),"Exam review unavailable.");
});
test("22 learner UI derives answer completion from active question IDs",()=>{
 assert.match(ui,/createEducationExamReview\(\s*testQuery\.data\?\.questions \?\? \[\], answers, flaggedQuestions/);
 assert.match(ui,/const answered = review\.answered/);
 assert.match(ui,/const progress = count > 0 \? answered \/ count \* 100 : 0/);
 assert.doesNotMatch(ui,/const answered = answeredExamCount\(answers\)/);
});
test("23 UI provides overview buttons for all real questions with accessible text",()=>{
 assert.match(ui,/aria-label="Exam question overview"/);
 assert.match(ui,/review\.entries\.map\(item =>/);
 assert.match(ui,/aria-label=\{"Question " \+ item\.number/);
 assert.match(ui,/aria-current=\{item\.index === questionIndex \? "step" : undefined\}/);
});
test("24 flagged and unanswered navigation does not accidentally submit",()=>{
 assert.match(ui,/jumpToNextReview\("unanswered"\)/);
 assert.match(ui,/jumpToNextReview\("flagged"\)/);
 assert.match(ui,/onClick=\{\(\) => jumpToReviewQuestion\(item\.index\)\}/);
 assert.match(ui,/setQuestionIndex\(index\)/);
});
test("25 review flags are explicitly local and reset on account/attempt changes",()=>{
 assert.match(ui,/setFlaggedQuestions\(new Set\(\)\)/);
 assert.match(ui,/setAnswers\(new Map\(\)\)/);
 assert.match(ui,/useLayoutEffect\(\(\) => \{/);
 assert.match(ui,/Review flags stay in this tab only/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage/);
});
test("26 reviewing a flagged answered item does not mislabel it unfinished",()=>{
 assert.match(ui,/item\.answered \? "answered" : "unanswered"/);
 assert.match(ui,/item\.flagged \? ", flagged for review" : ""/);
});
test("27 submit dialog displays authentic pending count and selectable question links",()=>{
 assert.match(ui,/educationReviewSummaryMessage\(review\)/);
 assert.match(ui,/Revisit before submitting/);
 assert.match(ui,/review\.entries\.filter\(item => !item\.answered \|\| item\.flagged\)/);
 assert.match(ui,/Your answers cannot be changed after a confirmed submission/);
});
test("28 atomic unsaved answers are still server-flushed before confirmed submit",()=>{
 assert.match(ui,/await flushPendingAnswers\(\)/);
 assert.match(ui,/await submitCbtAttempt\(attemptId\)/);
 assert.match(ui,/Save answers now/);
 assert.match(ui,/Retry saving/);
});
test("29 browser close warning activates only for actual unsaved atomic answers",()=>{
 assert.match(ui,/window\.addEventListener\("beforeunload", warnUnconfirmedSave\)/);
 assert.match(ui,/saveQueueRef\.current\?\.hasUnsaved\(\)/);
 assert.match(ui,/window\.removeEventListener\("beforeunload", warnUnconfirmedSave\)/);
 assert.match(ui,/event\.returnValue = ""/);
});
test("30 atomic and legacy exam answers are now cleared on user or attempt switch",()=>{
 assert.match(ui,/const scope = enabled && attemptQuery\.data\?\.id/);
 assert.match(ui,/saveQueueScopeRef\.current = scope/);
 assert.match(ui,/setAnswers\(new Map\(\)\)/);
 assert.match(ui,/setFlaggedQuestions\(new Set\(\)\)/);
});
test("31 an already-submitted attempt never accepts another answer from editor",()=>{
 assert.match(ui,/const canEdit = attemptQuery\.data\?\.status === "in_progress"/);
 assert.match(ui,/if \(attemptQuery\.data\.status !== "in_progress"\)/);
 assert.match(ui,/This attempt is no longer editable/);
});
test("32 automatic submission timer only runs on in-progress server attempts",()=>{
 assert.match(ui,/attemptQuery\.data\.status !== "in_progress"\) return;/);
 assert.match(ui,/void submitRef\.current\(true\)/);
 assert.match(ui,/Final deadlines and grading require server-side enforcement/);
});
test("33 server-confirmed submitted attempts navigate to existing results",()=>{
 assert.match(ui,/navigate\("\/test-results\/" \+ attemptQuery\.data\.id, \{ replace: true \}\)/);
 assert.match(ui,/This attempt cannot be submitted from the exam editor/);
});
test("34 no invented correctness, score, XP or certificate in new review helper",()=>{
 const helper=read("src/lib/educationExamReview.mjs");
 // Comments document forbidden storage APIs; check executable source only.
 const executable=helper.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*\/\/.*$/gm,"");
 assert.doesNotMatch(executable,/is_correct|points_awarded|score:|xp:|localStorage\.|sessionStorage\.|createClient\(|from\("user_answers"\)/);
 assert.match(helper,/NOT persisted to the assessment backend/);
});
test("35 training docs preserve real server authorization and do not claim deployment",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/server-side/);
 assert.match(guide,/flagged.*local/i);
 assert.match(guide,/production/i);
});
