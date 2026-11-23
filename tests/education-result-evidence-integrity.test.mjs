import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
 EDUCATION_RESULT_MAX_ROWS,EDUCATION_RESULT_SORTS,
 normalizeEducationResultEvidence,summarizeEducationResultEvidence,
 sortEducationResultEvidence,buildEducationVisibleResultCsv,
} from "../src/lib/educationResultEvidence.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=read("src/pages/TestResults.tsx");
const guide=read("docs/EDUCATION_RESULT_EVIDENCE_INTEGRITY.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const tid=id(1),attemptId=id(2),qid=id(11),qid2=id(12),qid3=id(13);
const q=(questionId=qid,testId=tid,question_text="How does cathodic protection work?")=>
 ({id:questionId,test_id:testId,question_text,points:5,secret_key:"NOT_FOR_LEARNERS"});
const first=()=>({
 question_id:qid,selected_option_id:id(101),short_answer_text:null,
 questions:q(),is_correct:true,points_awarded:5,staffNote:"PRIVATE",
});
const second=()=>({
 question_id:qid2,selected_option_id:null,short_answer_text:"Polarization shifts potential.",
 questions:q(qid2,tid,"Explain polarization"),is_correct:null,points_awarded:3,
});
const third=()=>({
 question_id:qid3,selected_option_id:null,short_answer_text:null,
 questions:q(qid3,tid,"Explain stray current"),is_correct:null,points_awarded:null,
});
const normal=(rows=[first(),second(),third()],show=true)=>
 normalizeEducationResultEvidence(rows,tid,show);
const attempt={id:attemptId,status:"submitted",end_time:"2026-11-23T10:00:00Z",score:8,max_score:10};
const receipt={attempt_id:attemptId,grade_status:"finalized",score:8,max_score:10,
 finalized_at:"2026-11-23T10:01:00Z"};
const exportCsv=(answers=normal(),options={})=>buildEducationVisibleResultCsv({
 attempt,answers,receipt,verifiedMode:true,gradeRevealed:true,
 scope:"Returned visible answers",...options,
});
test("01 result collection is limited to 100 authorized rows",()=>{
 assert.equal(EDUCATION_RESULT_MAX_ROWS,100);
 assert.throws(()=>normal(Array.from({length:101},(_,i)=>({...first(),question_id:id(300+i),questions:q(id(300+i))}))),/could not be verified/);
});
test("02 all three real returned answer rows preserve distinct source order",()=>{
 assert.deepEqual(normal().map(row=>row.response_number),[1,2,3]);
 assert.deepEqual(normal().map(row=>row.id),[qid,qid2,qid3]);
});
test("03 empty authenticated result list is an honest empty array",()=>{
 assert.deepEqual(normal([]),[]);
});
test("04 malformed or missing collection/assessment ID fail closed",()=>{
 assert.throws(()=>normalizeEducationResultEvidence(null,tid),/could not be verified/);
 assert.throws(()=>normalizeEducationResultEvidence([],"bad"),/could not be verified/);
});
test("05 duplicate question ID rows are rejected rather than counted twice",()=>{
 assert.throws(()=>normal([first(),first()]),/duplicate question references/);
});
test("06 malformed question UUID is rejected even when question join is omitted",()=>{
 assert.throws(()=>normal([{...first(),question_id:"not-uuid",questions:null}]),/invalid or duplicate/);
});
test("07 missing question ID is rejected, not displayed as a fabricated response",()=>{
 const a=first();delete a.question_id;
 assert.throws(()=>normal([a]),/invalid or duplicate/);
});
test("08 null, array and primitive raw answer rows are invalid",()=>{
 for(const value of [null,[],7,"text"])assert.throws(()=>normal([value]),/invalid or duplicate/);
});
test("09 valid joined question must belong to this exact test",()=>{
 assert.throws(()=>normal([{...first(),questions:q(qid,id(99))}]),/does not belong/);
});
test("10 joined question ID must equal the response question ID",()=>{
 assert.throws(()=>normal([{...first(),questions:q(qid2)}]),/does not belong/);
});
test("11 one-element joined relation arrays are supported",()=>{
 const answer=normal([{...first(),questions:[q()]}]);
 assert.equal(answer[0].metadata_available,true);
});
test("12 ambiguous multiple joined question records fail closed",()=>{
 assert.throws(()=>normal([{...first(),questions:[q(),q()]}]),/ambiguous/);
});
test("13 unreadable joined metadata is honestly marked restricted",()=>{
 for(const joined of [null,undefined,[]]){
  const a=normal([{...first(),questions:joined}])[0];
  assert.equal(a.metadata_available,false);
  assert.equal(a.question_text,"Question metadata restricted");
  assert.equal(a.points,null);
  assert.equal(a.points_awarded,null);
  assert.equal(a.is_correct,null);
 }
});
test("14 malformed question relation is never trusted",()=>{
 assert.throws(()=>normal([{...first(),questions:"wrong"}]),/invalid question metadata/);
});
test("15 empty or whitespace-only question wording is rejected",()=>{
 for(const label of ["","  ",null])
  assert.throws(()=>normal([{...first(),questions:q(qid,tid,label)}]),/wording or possible points/);
});
test("16 abnormally long returned question wording is rejected",()=>{
 assert.throws(()=>normal([{...first(),questions:q(qid,tid,"A".repeat(4001))}]),/wording/);
});
test("17 possible question points require 1..1000 whole numbers",()=>{
 for(const value of [0,-1,1001,2.4,Infinity,null]){
  assert.throws(()=>normal([{...first(),questions:{...q(),points:value}}]),/possible points/);
 }
});
test("18 impossible selected-option ID is blocked before any display",()=>{
 assert.throws(()=>normal([{...first(),selected_option_id:"bad"}]),/selected-choice/);
});
test("19 written answer may be up to 5000 characters without truncation",()=>{
 const text="x".repeat(5000);
 const a=normal([{...second(),short_answer_text:text}])[0];
 assert.equal(a.user_answer.length,5000);
});
test("20 overlong written answer fails closed before rendering or export",()=>{
 assert.throws(()=>normal([{...second(),short_answer_text:"x".repeat(5001)}]),/permitted length/);
});
test("21 malformed non-string written response cannot be treated as blank",()=>{
 assert.throws(()=>normal([{...second(),short_answer_text:42}]),/written answer/);
});
test("22 conflicting written text and selected option are rejected",()=>{
 assert.throws(()=>normal([{...second(),selected_option_id:id(101)}]),/conflicting/);
});
test("23 valid objective choice displays text label, never raw database ID",()=>{
 const a=normal([first()])[0];
 assert.equal(a.user_answer,"Selected option recorded");
 assert(!a.user_answer.includes(id(101)));
});
test("24 blank returned answer is explicitly blank, not failed grading",()=>{
 const a=normal([third()])[0];
 assert.equal(a.user_answer,"No answer");
 assert.equal(a.response_kind,"blank");
 assert.equal(a.is_correct,null);
});
test("25 student-written text preserves leading and trailing whitespace",()=>{
 const a=normal([{...second(),short_answer_text:"  polarized  "}])[0];
 assert.equal(a.user_answer,"  polarized  ");
});
test("26 malformed verdict is rejected only if marks are authorized to show",()=>{
 assert.throws(()=>normal([{...first(),is_correct:"true"}],true),/malformed correctness/);
 const a=normal([{...first(),is_correct:"true"}],false)[0];
 assert.equal(a.is_correct,null);
});
test("27 awarded points cannot be fractional, negative or above actual possible points",()=>{
 for(const score of [-1,1.5,6,Infinity]){
  assert.throws(()=>normal([{...first(),points_awarded:score}]),/inconsistent awarded/);
 }
});
test("28 zero awarded points is real, not mistaken for missing result",()=>{
 const a=normal([{...first(),is_correct:false,points_awarded:0}])[0];
 assert.equal(a.points_awarded,0);
 assert.equal(a.is_correct,false);
});
test("29 unverified-mode response never reveals correctness or numeric marks",()=>{
 const data=normal([first(),second()],false);
 for(const row of data){
  assert.equal(row.is_correct,null);
  assert.equal(row.points_awarded,null);
 }
});
test("30 unexpected server private properties are removed from the presentation",()=>{
 const rows=normal([{...first(),secretAnswerKey:"KEY",gradeAudit:"HIDDEN"}]);
 const text=JSON.stringify(rows);
 for(const part of ["NOT_FOR_LEARNERS","KEY","HIDDEN","staffNote"])assert(!text.includes(part));
});
test("31 normalized evidence snapshots cannot be mutated",()=>{
 assert(Object.isFrozen(normal()[0]));
});
test("32 returned-row coverage counts actual records and metadata availability",()=>{
 assert.deepEqual(summarizeEducationResultEvidence(normal()),{
  returned:3,verifiedQuestionMetadata:3,restrictedQuestionMetadata:0,
  writtenResponses:1,selectedOptions:1,blankResponses:1,
 });
});
test("33 restricted question metadata is counted separately, never counted as verified",()=>{
 const a=normal([{...first(),questions:null}]);
 const c=summarizeEducationResultEvidence(a);
 assert.equal(c.restrictedQuestionMetadata,1);
 assert.equal(c.verifiedQuestionMetadata,0);
});
test("34 response-kind counters cannot be tricked by text that says No answer",()=>{
 const a=normal([{...second(),short_answer_text:"No answer"}]);
 const c=summarizeEducationResultEvidence(a);
 assert.equal(c.writtenResponses,1);
 assert.equal(c.blankResponses,0);
});
test("35 response-kind counters cannot be tricked by text that says Selected option recorded",()=>{
 const a=normal([{...second(),short_answer_text:"Selected option recorded"}]);
 const c=summarizeEducationResultEvidence(a);
 assert.equal(c.writtenResponses,1);
 assert.equal(c.selectedOptions,0);
});
test("36 malformed result count input fails closed",()=>{
 assert.throws(()=>summarizeEducationResultEvidence(null),/Invalid/);
 assert.throws(()=>summarizeEducationResultEvidence([{id:"bad",response_number:1}]),/Invalid/);
});
test("37 evidence count is immutable and safe for UI rendering",()=>{
 assert(Object.isFrozen(summarizeEducationResultEvidence(normal())));
});
test("38 results sorting options are explicitly allowlisted",()=>{
 assert.deepEqual(EDUCATION_RESULT_SORTS,["recorded","reverse","question"]);
 assert.throws(()=>sortEducationResultEvidence(normal(),"score"),/Invalid/);
});
test("39 original source order is preserved by the default sort",()=>{
 assert.deepEqual(sortEducationResultEvidence(normal()).map(x=>x.response_number),[1,2,3]);
});
test("40 reverse sort never changes original record numbers",()=>{
 assert.deepEqual(sortEducationResultEvidence(normal(),"reverse").map(x=>x.response_number),[3,2,1]);
});
test("41 alphabetic question sort really sorts returned wording",()=>{
 assert.deepEqual(sortEducationResultEvidence(normal(),"question").map(x=>x.id),[qid2,qid3,qid]);
});
test("42 sorting does not mutate the canonical returned answer list",()=>{
 const a=normal();
 const old=a.map(x=>x.id);
 sortEducationResultEvidence(a,"reverse");
 assert.deepEqual(a.map(x=>x.id),old);
});
test("43 filtered CSV includes exact displayed subset and original response ordinals",()=>{
 const a=normal();
 const csv=exportCsv([a[2],a[0]],{scope:"Search results"});
 assert(csv.startsWith("\uFEFF"));
 assert(csv.includes('"Search results"'));
 assert(csv.includes('"3"'));
 assert(csv.includes('"1"'));
 assert(!csv.includes("Explain polarization"));
 assert(csv.includes("Original response number"));
});
test("44 private filtered export releases numeric marks only with matching valid finalized receipt",()=>{
 const csv=exportCsv([normal()[0]]);
 assert(csv.includes('"5","5"'));
 assert(csv.includes("Final grade verified against the official assessment ledger"));
});
test("45 filtered export never reveals marks without trusted final ledger",()=>{
 const csv=exportCsv([normal()[0]],{gradeRevealed:false});
 assert(csv.includes("Marks not independently verified"));
 assert(!csv.includes('"5","5"'));
 assert(!csv.includes("Marked correct"));
});
test("46 mismatched finalized receipt does not release recorded marks",()=>{
 const csv=exportCsv([normal()[0]],{receipt:{...receipt,attempt_id:id(55)}});
 assert(!csv.includes('"5","5"'));
});
test("47 non-final receipt does not release recorded marks",()=>{
 const csv=exportCsv([normal()[0]],{receipt:{...receipt,grade_status:"pending_review"}});
 assert(!csv.includes('"5","5"'));
});
test("48 incomplete or malformed finalized receipt cannot certify marks",()=>{
 for(const patch of [{score:-1},{max_score:0},{finalized_at:"not-date"}]){
  const csv=exportCsv([normal()[0]],{receipt:{...receipt,...patch}});
  assert(!csv.includes('"5","5"'));
 }
});
test("49 legacy filtered export labels legacy provenance but never certifies numeric marks",()=>{
 const csv=exportCsv([normal()[0]],{verifiedMode:false,gradeRevealed:true});
 assert(csv.includes("Legacy recorded grade (not independently verified)"));
 assert(!csv.includes('"5","5"'));
});
test("50 hidden question metadata cannot become certified CSV evidence",()=>{
 assert.throws(()=>exportCsv(normal([{...first(),questions:null}])),/cannot be safely exported/);
});
test("51 duplicates in source response numbers cannot be exported",()=>{
 const a=normal();
 assert.throws(()=>exportCsv([{...a[0]},{...a[1],response_number:1}]),/duplicate source/);
});
test("52 invalid, unfinished attempts or oversized scope cannot generate a private export",()=>{
 assert.throws(()=>exportCsv(normal(),{attempt:{...attempt,status:"in_progress"}}),/cannot be safely exported/);
 assert.throws(()=>exportCsv(normal(),{scope:"x".repeat(161)}),/cannot be safely exported/);
});
test("53 spreadsheet formula-like personal text is neutralized",()=>{
 const a=normal([{...second(),short_answer_text:'=HYPERLINK("evil")'}]);
 const csv=exportCsv(a);
 assert(csv.includes("'=HYPERLINK"));
 assert(!csv.includes('"=HYPERLINK'));
});
test("54 exported CSV excludes raw selected-option IDs and private notes",()=>{
 const csv=exportCsv();
 assert(!csv.includes(id(101)));
 assert(!csv.includes("NOT_FOR_LEARNERS"));
 assert(!csv.includes("PRIVATE"));
});
test("55 existing trusted authenticated attempt and matching ledger reads remain unchanged",()=>{
 assert.match(page,/\.eq\("id", attemptId!\)\.eq\("user_id", user!\.id\)/);
 assert.match(page,/readVerifiedStudentGrade\(attemptId!\)/);
 assert.match(page,/projectVerifiedAttempt\(attemptQuery\.data, verifiedQuery\.data, verifiedStudentResultsEnabled\)/);
});
test("56 result query validates membership without requesting instructor answer keys",()=>{
 assert.match(page,/questions\(id,question_text,points,test_id\)/);
 assert.match(page,/normalizeEducationResultEvidence\(/);
 assert.match(page,/\.eq\("attempt_id", attemptId!\)/);
 assert.doesNotMatch(page,/\.from\("options"\)|\.select\(".*correct_option_id.*"\)/);
});
test("57 question list uses stable original response numbers after filtering",()=>{
 assert.match(page,/Response \{answer\.response_number\}/);
 assert.match(page,/sortEducationResultEvidence\(/);
 assert.match(page,/filterEducationAnswerReview\(/);
 assert.match(page,/id="education-answer-sort"/);
});
test("58 restricted metadata is visible but blocks full and filtered downloads",()=>{
 assert.match(page,/evidenceCounts\.restrictedQuestionMetadata === 0/);
 assert.match(page,/!evidenceReady/);
 assert.match(page,/Some returned answers have restricted question metadata/);
 assert.match(page,/Question metadata restricted/);
});
test("59 filtered CSV is a real local download, not an admin network call",()=>{
 assert.match(page,/buildEducationVisibleResultCsv\(\{/);
 assert.match(page,/downloadAnswerCsv\(csv, displayedAttempt\.id, "-displayed"\)/);
 assert.match(page,/Download displayed answers \(\.csv\)/);
});
test("60 original legacy grade warning and private answer controls remain visible",()=>{
 assert.match(page,/Legacy grading mode: this recorded score has not been independently verified/);
 assert.match(page,/Only server-returned attempt details are displayed/);
 assert.match(page,/Check latest result/);
 assert.match(page,/No score will be shown/);
});
test("61 results page reset retains privacy of previous account review filters",()=>{
 assert.match(page,/useLayoutEffect\(\(\) => \{/);
 assert.match(page,/setAnswerSort\("recorded"\)/);
 assert.match(page,/setAnswerFilter\("all"\)/);
});
test("62 the helper remains entirely local and source-only",()=>{
 const helper=read("src/lib/educationResultEvidence.mjs");
 assert.doesNotMatch(helper,/supabase\.|fetch\(|localStorage\.|sessionStorage\.|service_role/);
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/server-side/);
});
test("63 TSX results page still parses with integrity review features",()=>{
 const ast=ts.createSourceFile("TestResults.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
