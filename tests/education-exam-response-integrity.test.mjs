import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  EDUCATION_EXAM_MAX_ANSWER_CHARS,EDUCATION_EXAM_MAX_CHOICES,
  EDUCATION_EXAM_MAX_QUESTIONS,validateEducationExamQuestions,
  validateEducationExamDetails,validateEducationExamOptions,
  restoreEducationExamAnswers,educationChoiceSelectionStatus,
  projectEducationExamReviewAnswers,createEducationExamAnswer,
} from "../src/lib/educationExamResponseIntegrity.mjs";
import {createEducationExamReview} from "../src/lib/educationExamReview.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=read("src/pages/TestInterface.tsx");
const guide=read("docs/EDUCATION_EXAM_RESPONSE_INTEGRITY.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const tid=id(1);
const objective={id:id(11),question_text:"Which anode is recommended?",question_type:"multiple_choice",points:5,order_index:0};
const truth={id:id(12),question_text:"CP can reduce corrosion.",question_type:"true_false",points:2,order_index:1};
const written={id:id(13),question_text:"Explain polarization.",question_type:"short_answer",points:6,order_index:2};
const questions=[objective,truth,written];
const options=[
 {id:id(101),option_text:"Magnesium"},
 {id:id(102),option_text:"Zinc"},
 {id:id(103),option_text:"Aluminum"},
];
const saved=[
 {question_id:objective.id,selected_option_id:options[0].id,short_answer_text:null},
 {question_id:truth.id,selected_option_id:id(111),short_answer_text:null},
 {question_id:written.id,selected_option_id:null,short_answer_text:"  Instant-off excludes much of IR drop. "},
];
const details={id:tid,title:"Corrosion Assessment",is_active:true,duration_minutes:45};
test("01 hard CBT authoring limits are explicit and bounded",()=>{
 assert.equal(EDUCATION_EXAM_MAX_ANSWER_CHARS,5000);
 assert.equal(EDUCATION_EXAM_MAX_QUESTIONS,100);
 assert.equal(EDUCATION_EXAM_MAX_CHOICES,8);
});
test("02 legitimate real question metadata is preserved in order",()=>{
 const result=validateEducationExamQuestions(questions,tid);
 assert.equal(result.length,3);
 assert.deepEqual(result[0],objective);
 assert.deepEqual(result[2],written);
});
test("03 unknown extra server question properties are dropped",()=>{
 const result=validateEducationExamQuestions([{
  ...objective,is_correct:true,correct_option_id:id(101),admin_note:"PRIVATE",
 }],tid);
 assert.deepEqual(result,[objective]);
 assert(!JSON.stringify(result).includes("PRIVATE"));
});
test("04 invalid test identifier is rejected before attempt creation",()=>{
 assert.throws(()=>validateEducationExamQuestions(questions,"not-uuid"),/Invalid assessment/);
});
test("05 question metadata requires 1 through 100 actual records",()=>{
 assert.throws(()=>validateEducationExamQuestions([],tid),/missing/);
 assert.throws(()=>validateEducationExamQuestions(null,tid),/missing/);
 const tooMany=Array.from({length:101},(_,i)=>({...objective,id:id(400+i),order_index:i}));
 assert.throws(()=>validateEducationExamQuestions(tooMany,tid),/limit/);
});
test("06 duplicate question IDs are denied before a timer starts",()=>{
 assert.throws(()=>validateEducationExamQuestions([objective,{...objective}],tid),/duplicated/);
});
test("07 malformed question UUID is not treated as a new valid question",()=>{
 assert.throws(()=>validateEducationExamQuestions([{...objective,id:"bad"}],tid),/invalid/);
});
test("08 unsupported question type cannot generate an apparently complete exam",()=>{
 assert.throws(()=>validateEducationExamQuestions([{...objective,question_type:"essay_autograded"}],tid),/invalid/);
});
test("09 question stems must be actual readable text with bounded length",()=>{
 for(const value of ["","  ","A".repeat(4001),null])
  assert.throws(()=>validateEducationExamQuestions([{...objective,question_text:value}],tid),/invalid/);
});
test("10 points must be positive, whole and no more than 1000",()=>{
 for(const value of [0,-1,1001,2.4,NaN,null])
  assert.throws(()=>validateEducationExamQuestions([{...objective,points:value}],tid),/invalid/);
});
test("11 impossible order indices are rejected",()=>{
 for(const value of [-1,1.4,null,NaN])
  assert.throws(()=>validateEducationExamQuestions([{...objective,order_index:value}],tid),/invalid/);
});
test("12 trusted test metadata requires exact returned test ID and active status",()=>{
 assert.deepEqual(validateEducationExamDetails(details,questions,tid),{
  ...details,questions,
 });
 assert.throws(()=>validateEducationExamDetails({...details,id:id(2)},questions,tid),/metadata/);
 assert.throws(()=>validateEducationExamDetails({...details,is_active:false},questions,tid),/metadata/);
});
test("13 bad timer duration and empty test title block attempt start",()=>{
 for(const duration of [0,-1,1441,1.5])
  assert.throws(()=>validateEducationExamDetails({...details,duration_minutes:duration},questions,tid),/metadata/);
 assert.throws(()=>validateEducationExamDetails({...details,title:" "},questions,tid),/metadata/);
});
test("14 valid choices are stripped to learner-facing ID and text only",()=>{
 const result=validateEducationExamOptions([
  {...options[0],is_correct:true,secret:"DO_NOT_LEAK"},options[1]
 ],objective);
 assert.deepEqual(result,[options[0],options[1]]);
 assert(!JSON.stringify(result).includes("DO_NOT_LEAK"));
});
test("15 objective question needs at least two choices and no more than eight",()=>{
 assert.throws(()=>validateEducationExamOptions([],objective),/valid set/);
 assert.throws(()=>validateEducationExamOptions(options.slice(0,1),objective),/valid set/);
 const nine=Array.from({length:9},(_,i)=>({id:id(500+i),option_text:"Option "+i}));
 assert.throws(()=>validateEducationExamOptions(nine,objective),/valid set/);
});
test("16 true/false needs precisely two current options",()=>{
 assert.deepEqual(validateEducationExamOptions(options.slice(0,2),truth),options.slice(0,2));
 assert.throws(()=>validateEducationExamOptions(options,truth),/valid set/);
});
test("17 written questions never accept an objective options collection",()=>{
 assert.throws(()=>validateEducationExamOptions(options,written),/valid set/);
});
test("18 duplicate option UUIDs block ambiguous selection",()=>{
 assert.throws(()=>validateEducationExamOptions([options[0],{...options[0],option_text:"Other"}],objective),/duplicated/);
});
test("19 repeated choice text ignoring whitespace and case is ambiguous",()=>{
 assert.throws(()=>validateEducationExamOptions([options[0],{...options[1],option_text:" MAGnesium  "}],objective),/duplicated/);
});
test("20 invalid/blank choice text and UUIDs fail closed",()=>{
 for(const invalid of [{...options[1],id:"bad"},{...options[1],option_text:"  "},
  {...options[1],option_text:"a".repeat(1001)}])
  assert.throws(()=>validateEducationExamOptions([options[0],invalid],objective),/incomplete|duplicated/);
});
test("21 malformed options query result is not treated as valid",()=>{
 assert.throws(()=>validateEducationExamOptions({},objective),/valid set/);
 assert.throws(()=>validateEducationExamOptions(null,objective),/valid set/);
});
test("22 actual restored option and written answers are reconstructed by question ID",()=>{
 assert.deepEqual(restoreEducationExamAnswers(saved,questions),[
  {questionId:objective.id,selectedOptionId:options[0].id,shortAnswer:undefined},
  {questionId:truth.id,selectedOptionId:id(111),shortAnswer:undefined},
  {questionId:written.id,selectedOptionId:undefined,shortAnswer:"  Instant-off excludes much of IR drop. "},
 ]);
});
test("23 empty saved answers restore to a genuine empty collection",()=>{
 assert.deepEqual(restoreEducationExamAnswers([],questions),[]);
});
test("24 restored answers never serialize source truth/correctness/admin notes",()=>{
 const result=restoreEducationExamAnswers([{
  ...saved[0],is_correct:true,points_awarded:10,secret:"ADMIN",
 }],questions);
 assert(!JSON.stringify(result).includes("ADMIN"));
 assert(!JSON.stringify(result).includes("is_correct"));
 assert(!JSON.stringify(result).includes("points_awarded"));
});
test("25 a saved option can be a well-formed UUID without presently loaded choices",()=>{
 assert.equal(restoreEducationExamAnswers([saved[0]],questions)[0].selectedOptionId,options[0].id);
});
test("26 foreign or deleted question IDs cause explicit restore failure",()=>{
 assert.throws(()=>restoreEducationExamAnswers([{...saved[0],question_id:id(900)}],questions),/unknown/);
});
test("27 duplicate server answer rows cannot silently overwrite the last one",()=>{
 assert.throws(()=>restoreEducationExamAnswers([saved[0],saved[0]],questions),/duplicate/);
});
test("28 malformed answer question/option UUIDs are never accepted",()=>{
 assert.throws(()=>restoreEducationExamAnswers([{...saved[0],question_id:"bad"}],questions),/unknown/);
 assert.throws(()=>restoreEducationExamAnswers([{...saved[0],selected_option_id:"bad"}],questions),/malformed/);
});
test("29 too many returned rows fail closed instead of inventing partial restore",()=>{
 assert.throws(()=>restoreEducationExamAnswers([...saved,saved[0]],questions),/collection/);
});
test("30 a written question cannot silently carry a multiple choice option",()=>{
 assert.throws(()=>restoreEducationExamAnswers([{...saved[2],selected_option_id:options[0].id}],questions),/unrelated choice/);
});
test("31 objective answer cannot carry unexpected nonblank written text",()=>{
 assert.throws(()=>restoreEducationExamAnswers([{...saved[0],short_answer_text:"injected"}],questions),/unrelated written/);
});
test("32 saved written response cannot exceed the editor's 5000 character limit",()=>{
 assert.throws(()=>restoreEducationExamAnswers([{...saved[2],short_answer_text:"x".repeat(5001)}],questions),/too long/);
});
test("33 existing legitimate zero-length written response is ungraded but restorable",()=>{
 const result=restoreEducationExamAnswers([{...saved[2],short_answer_text:""}],questions);
 assert.equal(result[0].shortAnswer,undefined);
});
test("34 option selection without one is explicitly none",()=>{
 assert.equal(educationChoiceSelectionStatus(null,options),"none");
 assert.equal(educationChoiceSelectionStatus({},options),"none");
});
test("35 selected saved choice is pending until choices load",()=>{
 assert.equal(educationChoiceSelectionStatus({selectedOptionId:options[0].id},null),"pending");
});
test("36 current loaded choice is valid without consulting answer correctness",()=>{
 assert.equal(educationChoiceSelectionStatus({selectedOptionId:options[0].id},options),"valid");
});
test("37 removed saved choice is unavailable rather than silently accepted",()=>{
 assert.equal(educationChoiceSelectionStatus({selectedOptionId:id(777)},options),"unavailable");
});
test("38 no loaded match never erases raw current saved answer",()=>{
 const initial=new Map([[objective.id,{questionId:objective.id,selectedOptionId:id(777)}]]);
 const projected=projectEducationExamReviewAnswers(initial,objective,options);
 assert.notEqual(projected,initial);
 assert.equal(initial.get(objective.id).selectedOptionId,id(777));
 assert.deepEqual(projected.get(objective.id),{questionId:objective.id});
});
test("39 removed saved option does not count as genuinely answered in current question overview",()=>{
 const initial=new Map([[objective.id,{questionId:objective.id,selectedOptionId:id(777)}]]);
 const projected=projectEducationExamReviewAnswers(initial,objective,options);
 const review=createEducationExamReview(questions,projected,new Set());
 assert.equal(review.answered,0);
 assert.equal(review.unanswered,3);
});
test("40 valid selection and unloaded choices leave original answer map unmodified",()=>{
 const current=new Map([[objective.id,{questionId:objective.id,selectedOptionId:options[0].id}]]);
 assert.strictEqual(projectEducationExamReviewAnswers(current,objective,options),current);
 assert.strictEqual(projectEducationExamReviewAnswers(current,objective,null),current);
});
test("41 check of one current choice never hides another previously saved question",()=>{
 const original=new Map([
  [objective.id,{questionId:objective.id,selectedOptionId:id(777)}],
  [truth.id,{questionId:truth.id,selectedOptionId:id(111)}],
 ]);
 const r=projectEducationExamReviewAnswers(original,objective,options);
 assert.equal(r.get(truth.id).selectedOptionId,id(111));
});
test("42 a real selected option gets a new normal browser response",()=>{
 assert.deepEqual(createEducationExamAnswer(objective,options[0].id,options),{
  questionId:objective.id,selectedOptionId:options[0].id,
 });
});
test("43 arbitrary fabricated option UUID is rejected by the browser",()=>{
 assert.throws(()=>createEducationExamAnswer(objective,id(777),options),/currently available/);
});
test("44 changing to a choice still requires the loaded options",()=>{
 assert.throws(()=>createEducationExamAnswer(objective,options[0].id,null),/currently available/);
});
test("45 written response preserves whitespace and original text",()=>{
 const writtenText="  CP shifts electrode potential.  ";
 assert.deepEqual(createEducationExamAnswer(written,writtenText,null),{
  questionId:written.id,shortAnswer:writtenText,
 });
});
test("46 too-long written answer is rejected even with UI maxLength",()=>{
 assert.throws(()=>createEducationExamAnswer(written,"x".repeat(5001),null),/5,000/);
});
test("47 5000 characters and empty response remain valid edit inputs",()=>{
 assert.equal(createEducationExamAnswer(written,"a".repeat(5000),null).shortAnswer.length,5000);
 assert.deepEqual(createEducationExamAnswer(written,"",null),{questionId:written.id,shortAnswer:""});
});
test("48 invalid question type, answer value or UUID cannot bypass front-end validation",()=>{
 assert.throws(()=>createEducationExamAnswer({...objective,id:"bad"},options[0].id,options),/Invalid/);
 assert.throws(()=>createEducationExamAnswer({...objective,question_type:"graded_essay"},options[0].id,options),/Invalid/);
 assert.throws(()=>createEducationExamAnswer(objective,null,options),/Invalid/);
});
test("49 exam query validates returned questions BEFORE starting a timed attempt",()=>{
 assert.match(page,/validateEducationExamDetails\(test, questions \?\? \[\], testId!\)/);
 assert.match(page,/enabled: enabled && !!testQuery\.data && testQuery\.data\.questions\.length > 0/);
 assert.match(page,/startCbtAttempt\(testId!\)/);
});
test("50 the server query never requests correctness or an instructor answer key",()=>{
 assert.match(page,/\.from\("questions"\)/);
 assert.match(page,/\.select\("id,question_text,question_type,points,order_index"\)/);
 assert.match(page,/\.from\("options"\)\.select\("id,option_text"\)/);
 assert.doesNotMatch(page,/\.select\(".*is_correct.*"\)|\.select\(".*correct_option.*"\)/);
});
test("51 owner-restored answers query performs strict verification, no fake zero reset",()=>{
 assert.match(page,/\.eq\("attempt_id", attemptQuery\.data!\.id\)/);
 assert.match(page,/restoreEducationExamAnswers\(data \?\? \[\], testQuery\.data\?\.questions \?\? \[\]\)/);
 assert.match(page,/setAnswers\(new Map\(restoredAnswersQuery\.data\.map/);
});
test("52 invalid restored data shows a manual retry and server-access uncertainty",()=>{
 assert.match(page,/Retry assessment loading/);
 assert.match(page,/restoredAnswersQuery\.refetch\(\)/);
 assert.match(page,/No new exam will be started when question metadata is invalid/);
});
test("53 options query validates returned choice list and exposes a retry path",()=>{
 assert.match(page,/validateEducationExamOptions\(data \?\? \[\], question!\)/);
 assert.match(page,/Retry loading choices/);
 assert.match(page,/optionsQuery\.refetch\(\)/);
});
test("54 no correctness counts a stale selected option as answered after choices load",()=>{
 assert.match(page,/projectEducationExamReviewAnswers\(/);
 assert.match(page,/testQuery\.data\?\.questions \?\? \[\], reviewedAnswers, flaggedQuestions/);
 assert.match(page,/choiceStatus === "unavailable"/);
 assert.match(page,/It is not counted as a valid current answer/);
});
test("55 a new option selection still goes through true server save queue",()=>{
 assert.match(page,/createEducationExamAnswer\(/);
 assert.match(page,/saveQueueRef\.current\.enqueue\(nextAnswer\)/);
 assert.match(page,/await flushPendingAnswers\(\)/);
 assert.match(page,/await submitCbtAttempt\(attemptId\)/);
});
test("56 short answer UX shows actual current character count and bounded textarea",()=>{
 assert.match(page,/maxLength=\{5000\}/);
 assert.match(page,/\.length\} of 5,000 characters used/);
});
test("57 option and answer rows are scoped to this exam and attempt",()=>{
 assert.match(page,/\.eq\("test_id", testId!\)/);
 assert.match(page,/\.eq\("question_id", question!\.id\)/);
 assert.match(page,/\.eq\("attempt_id", attemptQuery\.data!\.id\)/);
});
test("58 a completed exam cannot regain option editing",()=>{
 assert.match(page,/attemptQuery\.data\?\.status === "in_progress"/);
 assert.match(page,/const canEdit = attemptQuery\.data\?\.status === "in_progress"/);
});
test("59 the helper does not create local storage, an API endpoint or fake grades",()=>{
 const helper=read("src/lib/educationExamResponseIntegrity.mjs");
 assert.doesNotMatch(helper,/supabase\.|fetch\(|localStorage\.|sessionStorage\.|createClient\(/);
 assert.doesNotMatch(helper,/points_awarded|award_certificate/);
});
test("60 production authority and source rollout remain explicitly separate",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/server-side/);
 assert.match(guide,/production/);
 assert.match(guide,/not automatically overwrite/i);
});
test("61 exam TSX remains valid after choice warning and retry additions",()=>{
 const parsed=ts.createSourceFile("TestInterface.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
