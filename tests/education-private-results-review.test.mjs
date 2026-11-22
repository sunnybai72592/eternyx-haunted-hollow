import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 EDUCATION_ANSWER_REVIEW_FILTERS, educationAnswerReviewStatus,
 educationAnswerReviewLabel, summarizeEducationAnswerReview,
 filterEducationAnswerReview, educationResultProvenance,
 educationSafeCsvCell, buildEducationPrivateAnswerCsv,
 annotateEducationTextReport,
} from "../src/lib/educationPrivateAnswerReview.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const page=read("src/pages/TestResults.tsx");
const guide=read("docs/EDUCATION_PRIVATE_RESULTS_REVIEW.md");
const id="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002";
const attempt={id,status:"submitted",score:9,max_score:10,
  user_id:"10000000-0000-4000-8000-000000000003"};
const receipt={attempt_id:id,grade_status:"finalized",score:9,max_score:10,
  finalized_at:"2026-11-22T11:00:00Z"};
const rows=[
 {question_text:"Which cathodic protection anode?",user_answer:"Selected option recorded",
  is_correct:true,points_awarded:5,points:5},
 {question_text:"What is the safe range?",user_answer:"Selected option recorded",
  is_correct:false,points_awarded:0,points:2},
 {question_text:"Explain polarization",user_answer:"Reduction of potential",
  is_correct:null,points_awarded:2,points:3},
 {question_text:"Explain stray current",user_answer:"Not yet reviewed",
  is_correct:null,points_awarded:null,points:2},
];
function csv(params={}) {
 return buildEducationPrivateAnswerCsv({
  attempt,test:{title:"Corrosion Basics"},answers:rows,
  verifiedMode:true,receipt,gradeRevealed:true,
  ...params,
 });
}
test("01 actual correct and incorrect statuses are distinct",()=>{
 assert.equal(educationAnswerReviewStatus(rows[0],true),"correct");
 assert.equal(educationAnswerReviewStatus(rows[1],true),"incorrect");
});
test("02 written reviewed is never incorrectly classified as correct",()=>{
 assert.equal(educationAnswerReviewStatus(rows[2],true),"reviewed");
 assert.equal(educationAnswerReviewLabel(rows[2],true),"Written answer reviewed");
});
test("03 written not marked remains pending",()=>{
 assert.equal(educationAnswerReviewStatus(rows[3],true),"pending");
});
test("04 pending receipt hides every correctness state and mark",()=>{
 for(const row of rows)assert.equal(educationAnswerReviewStatus(row,false),"pending");
});
test("05 invalid awarded points cannot count as reviewed",()=>{
 for(const points of [-1,3.14,8,NaN,Infinity,null]){
  assert.equal(educationAnswerReviewStatus({
    is_correct:null,points_awarded:points,points:3,
  },true),"pending");
 }
});
test("06 null, invalid and missing answers stay pending",()=>{
 for(const x of [null,undefined,{}, {is_correct:"true"},{is_correct:0}])
  assert.equal(educationAnswerReviewStatus(x,true),"pending");
});
test("07 readable grading labels never assert pass/fail",()=>{
 assert.equal(educationAnswerReviewLabel(rows[0],true),"Marked correct");
 assert.equal(educationAnswerReviewLabel(rows[1],true),"Marked incorrect");
 assert.equal(educationAnswerReviewLabel(rows[3],true),"Grading pending");
});
test("08 returned count is not invented from test question totals",()=>{
 assert.deepEqual(summarizeEducationAnswerReview(rows,true),{
  returned:4,pending:1,reviewed:1,correct:1,incorrect:1,
 });
});
test("09 unverified counts never disclose recorded grading",()=>{
 assert.deepEqual(summarizeEducationAnswerReview(rows,false),{
  returned:4,pending:4,reviewed:0,correct:0,incorrect:0,
 });
});
test("10 invalid review collection yields a safe zero count",()=>{
 assert.deepEqual(summarizeEducationAnswerReview(null,true),{
  returned:0,pending:0,reviewed:0,correct:0,incorrect:0,
 });
});
test("11 review summary result is frozen",()=>{
 assert(Object.isFrozen(summarizeEducationAnswerReview(rows,true)));
});
test("12 search is case-insensitive for real question prompts",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"  ANODE  "),[rows[0]]);
});
test("13 search matches the signed-in student's own returned written text",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"reduction"),[rows[2]]);
});
test("14 search never needs backend and doesn't fabricate missing rows",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"nonexistent"),[]);
});
test("15 pending filter hides reviewed and marked answer rows",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"","pending",true),[rows[3]]);
});
test("16 reviewed filter includes correct, incorrect and written-reviewed, not pending",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"","reviewed",true),rows.slice(0,3));
});
test("17 direct correct and incorrect filters match real recorded verdicts",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"","correct",true),[rows[0]]);
 assert.deepEqual(filterEducationAnswerReview(rows,"","incorrect",true),[rows[1]]);
});
test("18 filter cannot reveal correctness when trusted receipt is pending",()=>{
 assert.deepEqual(filterEducationAnswerReview(rows,"","correct",false),[]);
 assert.deepEqual(filterEducationAnswerReview(rows,"","reviewed",false),[]);
 assert.deepEqual(filterEducationAnswerReview(rows,"","pending",false),rows);
});
test("19 no other injected filter states are accepted",()=>{
 assert.deepEqual(EDUCATION_ANSWER_REVIEW_FILTERS,[
  "all","pending","reviewed","correct","incorrect",
 ]);
 for(const filter of ["passed","graded","all;DROP",null])
  assert.throws(()=>filterEducationAnswerReview(rows,"",filter),/Invalid/);
});
test("20 malformed collection and non-text search fail early",()=>{
 assert.throws(()=>filterEducationAnswerReview(null),/Invalid/);
 assert.throws(()=>filterEducationAnswerReview(rows,{}),/Invalid/);
});
test("21 provenance explicitly distinguishes legacy and ledger-verified scores",()=>{
 assert.match(educationResultProvenance(false,null,true),/Legacy recorded grade/);
 assert.match(educationResultProvenance(true,receipt,true),/verified against/);
});
test("22 pending/unfinished/unavailable ledger receipts never claim a final grade",()=>{
 for(const record of [
  {grade_status:"pending_review"},{grade_status:"in_progress"},
  {grade_status:"finalized"},null,
 ])assert.doesNotMatch(educationResultProvenance(true,record,false),/Final grade verified/);
});
test("23 CSV formula guard escapes equals sign and preserves cell text",()=>{
 assert.equal(educationSafeCsvCell("=HYPERLINK(\"evil\")"),"\"'=HYPERLINK(\"\"evil\"\")\"");
});
test("24 CSV formula guard escapes plus/minus/at and prefixed whitespace",()=>{
 for(const value of ["+1","-1","@SUM(A1)","  =SUM(A1)","\t@evil","\n=bad","\r+bad"])
  assert(educationSafeCsvCell(value).startsWith("\"'"),value);
});
test("25 ordinary natural-language answers do not get a false apostrophe",()=>{
 assert.equal(educationSafeCsvCell("Magnesium anode"),'"Magnesium anode"');
});
test("26 CSV cell escapes quotes, comma, CRLF and neutral nulls",()=>{
 assert.equal(educationSafeCsvCell('say "hello", friend'),'"say ""hello"", friend"');
 assert.equal(educationSafeCsvCell(null),'""');
 assert.equal(educationSafeCsvCell("a\r\nb"),'"a\r\nb"');
});
test("27 local CSV includes only an authenticated attempt's result fields",()=>{
 const text=csv();
 assert(text.startsWith("\uFEFF"));
 assert(text.includes("Corrosion Basics"));
 assert(text.includes(id));
 assert(!text.includes("10000000-0000-4000-8000-000000000003"));
 assert(!text.includes("service_role"));
});
test("28 official matching finalized receipt releases valid, factual answer marks",()=>{
 const text=csv();
 assert(text.includes('"5","5"'));
 assert(text.includes('"0","2"'));
 assert(text.includes('"2","3"'));
 assert(text.includes("Final grade verified against the official assessment ledger"));
});
test("29 CSV pending verified receipt redacts every numeric mark and correct flag",()=>{
 const text=csv({receipt:{attempt_id:id,grade_status:"pending_review"},
  gradeRevealed:false});
 assert(text.includes("Marks not independently verified"));
 assert(!text.includes("Final grade verified"));
 assert(!text.includes('"5","5"'));
 assert(!text.includes('"2","3"'));
 assert(!text.includes("Marked correct"));
});
test("30 mismatched finalized receipt cannot certify a private export",()=>{
 const text=csv({receipt:{...receipt,attempt_id:other}});
 assert(!text.includes("Final grade verified"));
 assert(!text.includes('"5","5"'));
});
test("31 legacy CSV never embeds unverified scores as certified marks",()=>{
 const text=csv({verifiedMode:false,receipt:null,gradeRevealed:true});
 assert(text.includes("Legacy recorded grade (not independently verified)"));
 assert(!text.includes('"5","5"'));
 assert(!text.includes("Marked correct"));
});
test("32 private CSV excludes unrelated server-generated grade content",()=>{
 const text=csv({answers:[{...rows[0],secretAnswerKey:"not for learners",
  reviewer_notes:"private examiner note"}]});
 assert(!text.includes("not for learners"));
 assert(!text.includes("private examiner note"));
});
test("33 CSV header is fixed and not a developer-created certificate",()=>{
 const text=csv();
 assert(text.includes('"Grade provenance"'));
 assert(text.includes('"Submitted answer"'));
 assert(!text.includes("Certificate ID"));
 assert(!text.includes("Passing threshold"));
});
test("34 own formula-like written answer is exported as inert spreadsheet text",()=>{
 const text=csv({answers:[{...rows[2],user_answer:"=IMPORTXML(\"https://evil\")"}]});
 assert(text.includes("'=IMPORTXML"));
 assert(!text.includes('"=IMPORTXML'));
});
test("35 cannot export an unfinished or unknown-status assessment",()=>{
 for(const status of ["in_progress","expired","graded","unknown",null]){
  assert.throws(()=>csv({attempt:{...attempt,status}}),/submitted owned assessment/);
 }
});
test("36 malformed input rows cannot create partial CSV exports",()=>{
 assert.throws(()=>csv({answers:[{question_text:null,user_answer:"hi"}]}),/Invalid student answer/);
 assert.throws(()=>csv({answers:null}),/submitted owned assessment/);
});
test("37 zero returned answers is an empty factual CSV, not fabricated results",()=>{
 const text=csv({answers:[]});
 assert.equal(text.trim().split("\r\n").length,1);
});
test("38 TXT grade provenance is inserted after the existing authentic report title",()=>{
 const report="ETERNYX Education · Assessment report\nAssessment: Real exam\n";
 const enhanced=annotateEducationTextReport(report,"Legacy recorded grade (not independently verified)");
 assert.match(enhanced,/^ETERNYX Education · Assessment report\nGrade provenance: Legacy recorded grade/);
});
test("39 TXT provenance refuses arbitrary malformed report and untruthful empty values",()=>{
 assert.throws(()=>annotateEducationTextReport("not a report","verified"),/authenticated/);
 assert.throws(()=>annotateEducationTextReport(
  "ETERNYX Education · Assessment report\n",""),/authenticated/);
});
test("40 learner results keep owner filter and independent trusted receipt RPC",()=>{
 assert.match(page,/\.eq\("id", attemptId!\)\.eq\("user_id", user!\.id\)/);
 assert.match(page,/readVerifiedStudentGrade\(attemptId!\)/);
 assert.match(page,/projectVerifiedAttempt\(attemptQuery\.data, verifiedQuery\.data, verifiedStudentResultsEnabled\)/);
});
test("41 no server answer key query or option correctness leak added",()=>{
 assert.doesNotMatch(page,/\.from\("options"\)|\.select\(".*is_correct.*"\)/);
 assert.match(page,/Selected option recorded/);
});
test("42 search and review status filters are wired to actual returned answers",()=>{
 assert.match(page,/id="education-answer-search"/);
 assert.match(page,/id="education-answer-filter"/);
 assert.match(page,/filterEducationAnswerReview\(answersQuery\.data \?\? \[\], answerSearch, effectiveFilter, gradeRevealed\)/);
 assert.match(page,/Clear answer filters/);
});
test("43 UI defaults to pending-only filter while grade verification is unavailable",()=>{
 assert.match(page,/const effectiveFilter = gradeRevealed \? answerFilter/);
 assert.match(page,/gradeRevealed && <option value="reviewed">/);
 assert.match(page,/gradeRevealed && <option value="correct">/);
});
test("44 UI counts are explicitly limited to server-returned answers",()=>{
 assert.match(page,/summarizeEducationAnswerReview\(answersQuery\.data \?\? \[\], gradeRevealed\)/);
 assert.match(page,/returned answers displayed/);
 assert.match(page,/counts here are not the total number of exam questions/);
});
test("45 local CSV requires loaded private answers and completed owned exam",()=>{
 assert.match(page,/!answersQuery\.isSuccess \|\| !Array\.isArray\(answersQuery\.data\)/);
 assert.match(page,/buildEducationPrivateAnswerCsv\(\{/);
 assert.match(page,/downloadAnswerCsv\(csv, displayedAttempt\.id\)/);
});
test("46 report TXT discloses true provenance, CSV numeric marks require trusted final receipt",()=>{
 assert.match(page,/annotateEducationTextReport\(text, provenance\)/);
 assert.match(page,/CSV marks are included only for a matching verified final-grade receipt/);
});
test("47 account changes reset private search and report state before paint",()=>{
 assert.match(page,/useLayoutEffect\(\(\) => \{/);
 assert.match(page,/if \(viewerRef\.current === user\?\.id\) return/);
 assert.match(page,/setAnswerSearch\(""\)/);
 assert.match(page,/setExportError\(""\)/);
});
test("48 no new subscription, network, database migration, or unapproved backend rollout",()=>{
 const helper=read("src/lib/educationPrivateAnswerReview.mjs");
 assert.doesNotMatch(helper,/supabase\.from|fetch\(|localStorage\.|service_role|createCheckout/);
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/production/i);
});
