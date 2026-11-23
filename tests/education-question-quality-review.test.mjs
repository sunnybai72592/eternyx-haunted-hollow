import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
 auditEducationQuestionBank,filterEducationBankAudit,
 nextEducationBankQualityIndex,buildEducationLearnerWorksheetJson,
 buildEducationLearnerWorksheetText,buildEducationBankAuditCsv,
 EDUCATION_BANK_QUALITY_FILTERS,
} from "../src/lib/educationQuestionQuality.mjs";
import {validateQuestionBank} from "../src/lib/educationQuestionBank.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/pages/EducationInstructorStudio.tsx");
const doc=read("docs/EDUCATION_QUESTION_QUALITY_REVIEW.md");
const mcq=(id="q1",text="Which anode suits high resistivity soil?")=>({
 id,type:"multiple_choice",text,points:4,options:[
  {id:id+"a",text:"Magnesium",correct:true},
  {id:id+"b",text:"Zinc",correct:false},
  {id:id+"c",text:"Aluminum",correct:false},
 ],
});
const tf=(id="q2")=>({
 id,type:"true_false",text:"True or false: CP reduces corrosion.",points:2,
 options:[{id:id+"t",text:"True",correct:true},{id:id+"f",text:"False",correct:false}],
});
const written=(id="q3")=>({
 id,type:"short_answer",text:"Describe the instant-off potential.",points:6,options:[],
});
const bank=(questions=[mcq(),tf(),written()])=>({
 version:1,title:"Corrosion inspection",description:"Independent practice",
 duration_minutes:45,questions,
});
const summarize=(questions)=>auditEducationQuestionBank(bank(questions));

test("01 valid bank's real questions are all ready",()=>{
 const a=auditEducationQuestionBank(bank());
 assert.equal(a.validForExport,true);
 assert.deepEqual(a.items.map(x=>x.state),["ready","ready","ready"]);
});
test("02 real max points and type distribution are computed from authored questions",()=>{
 assert.deepEqual(auditEducationQuestionBank(bank()).counts,{
  total:3,fix:0,review:0,ready:3,maxPoints:12,
  multipleChoice:1,trueFalse:1,written:1,
 });
});
test("03 summary and individual issues cannot be mutated",()=>{
 const a=auditEducationQuestionBank(bank());
 assert(Object.isFrozen(a)&&Object.isFrozen(a.counts));
 assert(Object.isFrozen(a.items)&&Object.isFrozen(a.items[0]));
 assert(Object.isFrozen(a.items[0].issues)&&Object.isFrozen(a.items[0].warnings));
});
test("04 empty bank truthfully reports no ready questions and invalid export",()=>{
 const a=auditEducationQuestionBank(bank([]));
 assert.equal(a.validForExport,false);
 assert.deepEqual(a.counts,{total:0,fix:0,review:0,ready:0,maxPoints:0,
  multipleChoice:0,trueFalse:0,written:0});
});
test("05 incomplete prompt is flagged using the original strict validator",()=>{
 const q=mcq();q.text=" ";
 const a=summarize([q]);
 assert.equal(a.items[0].state,"fix");
 assert.match(a.items[0].issues.join(" "),/enter a question/);
});
test("06 missing MCQ correct answer is real validation failure",()=>{
 const q=mcq();q.options.forEach(choice=>{choice.correct=false;});
 const a=summarize([q]);
 assert.equal(a.items[0].state,"fix");
 assert.match(a.items[0].issues.join(" "),/select exactly one correct answer/);
});
test("07 two marked MCQ answers fail validation, no fabricated correctness",()=>{
 const q=mcq();q.options[1].correct=true;
 assert.equal(summarize([q]).items[0].state,"fix");
});
test("08 incomplete options are question-level validation issues",()=>{
 const q=mcq();q.options[1].text="";
 assert.match(summarize([q]).items[0].issues.join(" "),/fill in every option/);
});
test("09 temporary malformed editor points remain visible as a fix rather than crash",()=>{
 const q=mcq();q.points=0;
 const a=summarize([q]);
 assert.equal(a.items[0].state,"fix");
 assert.equal(a.counts.maxPoints,0);
});
test("10 malformed question structure is reviewed safely",()=>{
 const a=auditEducationQuestionBank({version:1,title:"foo",description:"",
  duration_minutes:30,questions:[{id:"x",type:"nonsense",text:"text",points:3,options:[]}]});
 assert.equal(a.items[0].state,"fix");
 assert.equal(a.validForExport,false);
});
test("11 bank of over 100 questions fails safely before showing a false review",()=>{
 assert.throws(()=>summarize(Array.from({length:101},(_,i)=>written("w"+i))),/bounded/);
});
test("12 duplicate choice wording is detected even with casing and whitespace changes",()=>{
 const q=mcq();q.options[2].text="  MAGnesium ";
 const a=summarize([q]);
 assert.equal(a.items[0].state,"review");
 assert.match(a.items[0].warnings.join(" "),/choice 3 repeats the wording of choice 1/);
});
test("13 duplicate choice warning doesn't alter the authored correct choice",()=>{
 const q=mcq();q.options[1].text="magnesium";
 const before=JSON.stringify(q);
 const a=summarize([q]);
 assert.equal(a.validForExport,true);
 assert.equal(a.items[0].state,"review");
 assert.equal(JSON.stringify(q),before);
});
test("14 distinct MCQ options are not guessed ambiguous",()=>{
 assert.deepEqual(summarize([mcq()]).items[0].warnings,[]);
});
test("15 incomplete empty choices are validation issues rather than duplicate wording",()=>{
 const q=mcq();q.options[1].text="";q.options[2].text=" ";
 const a=summarize([q]);assert.equal(a.items[0].state,"fix");
 assert.equal(a.items[0].warnings.length,0);
});
test("16 true/false answer choices are not mislabeled duplicate MCQ options",()=>{
 const q=tf();q.options[1].text="True";
 const a=summarize([q]);
 assert.equal(a.items[0].state,"fix");
 assert.equal(a.items[0].warnings.length,0);
});
test("17 exact repeated question prompt is an editorial warning for the repeated item",()=>{
 const a=summarize([mcq("first"),mcq("again")]);
 assert.equal(a.items[1].state,"review");
 assert.match(a.items[1].warnings.join(" "),/prompt repeats question 1/);
});
test("18 normalization catches repeated prompts separated by extra spaces",()=>{
 const a=summarize([mcq("first","Why use a magnesium anode?"),
  mcq("later","  WHY   USE a magnesium ANODE? ")]);
 assert.equal(a.items[1].state,"review");
});
test("19 non-repeated questions never become artificial duplicates",()=>{
 assert.equal(auditEducationQuestionBank(bank()).counts.review,0);
});
test("20 a validation issue takes priority over a cosmetic warning",()=>{
 const a=mcq("a");const b=mcq("b");b.points=0;
 const audit=summarize([a,b]);
 assert.equal(audit.items[1].state,"fix");
 assert(audit.items[1].warnings.length>0);
 assert(audit.items[1].issues.length>0);
});
test("21 global invalid bank title prevents export even when all questions are ready",()=>{
 const b=bank();b.title="x";
 const a=auditEducationQuestionBank(b);
 assert.equal(a.items.every(item=>item.state==="ready"),true);
 assert.equal(a.validForExport,false);
 assert.match(a.bankIssues.join(" "),/bank title/);
});
test("22 audit doesn't change raw instructor validation contract",()=>{
 const b=bank([mcq()]);
 assert.equal(validateQuestionBank(b).valid,true);
 assert.equal(auditEducationQuestionBank(b).validForExport,true);
});
test("23 all/fix/review/ready filters are allowlisted",()=>{
 assert.deepEqual(EDUCATION_BANK_QUALITY_FILTERS,["all","fix","review","ready"]);
 const a=summarize([mcq(),{...written(),text:" "},mcq("duplicate")]).items;
 assert.equal(filterEducationBankAudit(a,"all").length,3);
 assert.equal(filterEducationBankAudit(a,"fix").length,1);
 assert.equal(filterEducationBankAudit(a,"review").length,1);
 assert.equal(filterEducationBankAudit(a,"ready").length,1);
});
test("24 filters reject invalid metadata instead of hiding all questions",()=>{
 assert.throws(()=>filterEducationBankAudit(null),/Invalid/);
 assert.throws(()=>filterEducationBankAudit([], "passed"),/Invalid/);
});
test("25 next issue returns original index, not filtered list index",()=>{
 const a=summarize([mcq(),{...written(),text:" "},mcq("another")]).items;
 assert.equal(nextEducationBankQualityIndex(a,0,"fix"),1);
});
test("26 next issue wraps when the current question is at the end",()=>{
 const a=summarize([mcq(),{...written(),text:" "},mcq("another")]).items;
 assert.equal(nextEducationBankQualityIndex(a,2,"fix"),1);
});
test("27 next wording warning traverses genuine duplicate items",()=>{
 const a=summarize([mcq("first"),tf(),mcq("second")]).items;
 assert.equal(nextEducationBankQualityIndex(a,0,"review"),2);
 assert.equal(nextEducationBankQualityIndex(a,2,"review"),2);
});
test("28 no eligible questions or unknown types don't invent a target",()=>{
 const a=auditEducationQuestionBank(bank()).items;
 assert.equal(nextEducationBankQualityIndex(a,0,"fix"),-1);
 assert.equal(nextEducationBankQualityIndex(a,0,"review"),-1);
 assert.equal(nextEducationBankQualityIndex([],0,"fix"),-1);
 assert.equal(nextEducationBankQualityIndex(a,0,"ready"),-1);
});
test("29 unfinished bank cannot produce a student worksheet",()=>{
 const b=bank();b.title="";
 assert.throws(()=>buildEducationLearnerWorksheetJson(b),/Complete validation/);
 assert.throws(()=>buildEducationLearnerWorksheetText(b),/Complete validation/);
});
test("30 student JSON worksheet explicitly identifies practice rather than an exam",()=>{
 const exported=JSON.parse(buildEducationLearnerWorksheetJson(bank()));
 assert.equal(exported.format,"eternyx-learner-practice-worksheet");
 assert.equal(exported.notice,"Practice worksheet only. This is not a timed or graded exam.");
 assert.equal(exported.suggested_duration_minutes,45);
});
test("31 JSON learner worksheet contains only permitted top-level fields",()=>{
 const exported=JSON.parse(buildEducationLearnerWorksheetJson(bank()));
 assert.deepEqual(Object.keys(exported),["format","version","title","description",
  "suggested_duration_minutes","questions","notice"]);
});
test("32 learner worksheet excludes answer-key flags and internal option/question IDs",()=>{
 const exported=JSON.parse(buildEducationLearnerWorksheetJson(bank()));
 const text=JSON.stringify(exported);
 assert(!text.includes('"correct"'),text);
 assert(!text.includes('"is_correct"'),text);
 assert(!text.includes('"id"'),text);
 assert.equal(exported.questions[0].choices[0],"Magnesium");
});
test("33 learner worksheet doesn't leak unexpected private source properties",()=>{
 const b=bank();
 b.secret="DO_NOT_EXPOSE";
 b.questions[0].teacherMemo="HIDDEN_INSTRUCTOR_NOTE";
 b.questions[0].options[0].privateKey="SECRET_KEY_HERE";
 const text=buildEducationLearnerWorksheetJson(b);
 for(const forbidden of ["DO_NOT_EXPOSE","HIDDEN_INSTRUCTOR_NOTE","SECRET_KEY_HERE"])
   assert(!text.includes(forbidden));
});
test("34 learner worksheet preserves real student-facing question order and points",()=>{
 const data=JSON.parse(buildEducationLearnerWorksheetJson(bank()));
 assert.deepEqual(data.questions.map(x=>({number:x.number,points:x.points,type:x.type})),[
 {number:1,points:4,type:"multiple_choice"},
 {number:2,points:2,type:"true_false"},
 {number:3,points:6,type:"short_answer"},
 ]);
});
test("35 learner choices are plain text, not objects carrying answer flags",()=>{
 const data=JSON.parse(buildEducationLearnerWorksheetJson(bank()));
 assert.deepEqual(data.questions[1].choices,["True","False"]);
 assert.deepEqual(data.questions[2].choices,[]);
});
test("36 TXT worksheet contains readable options, no explicit marked correct choice",()=>{
 const text=buildEducationLearnerWorksheetText(bank());
 assert.match(text,/Learner practice worksheet/);
 assert.match(text,/A\. Magnesium/);
 assert.match(text,/B\. Zinc/);
 assert.match(text,/Written response: _+/);
 assert(!text.includes("correct:true"));
 assert(!text.includes("correct:false"));
});
test("37 worksheets never promise a score, certificate or timed exam",()=>{
 const json=buildEducationLearnerWorksheetJson(bank());
 const txt=buildEducationLearnerWorksheetText(bank());
 assert.match(json,/not a timed or graded exam/);
 assert.match(txt,/Not a timed or graded exam/);
 assert(!txt.includes("Certificate awarded"));
});
test("38 student worksheet can handle valid new lines and unicode question wording",()=>{
 const b=bank();b.questions[0].text="What is corrosion?\nExplain it in Urdu: زنگ";
 const json=JSON.parse(buildEducationLearnerWorksheetJson(b));
 assert(json.questions[0].text.includes("زنگ"));
 assert(buildEducationLearnerWorksheetText(b).includes("زنگ"));
});
test("39 validated worksheet JSON export has trailing newline, no arbitrary source serialization",()=>{
 const txt=buildEducationLearnerWorksheetJson(bank());
 assert(txt.endsWith("\n"));
 assert(txt.startsWith("{\n"));
});
test("40 audit CSV counts actual question rows, not invented school performance",()=>{
 const text=buildEducationBankAuditCsv(bank());
 assert.equal(text.split("\r\n").length,5);
 assert(text.includes('"Review status"'));
 assert(!text.includes("Pass percentage"));
});
test("41 audit CSV is formula-escaped and doesn't contain correct-option keys",()=>{
 const b=bank([mcq(),written()]);
 const text=buildEducationBankAuditCsv(b);
 assert(text.startsWith("\uFEFF"));
 assert(!text.includes('"correct":true'));
 assert(!text.includes('"correct":false'));
 assert(!text.includes('"Magnesium"'));
 assert(text.includes('"Question number"'));
});
test("42 changed editorial warnings show in quality audit CSV without fake grade",()=>{
 const b=bank([mcq("one"),mcq("two")]);
 const text=buildEducationBankAuditCsv(b);
 assert(text.includes("prompt repeats question 1"));
 assert(text.includes('"review"'));
 assert(!text.includes("Learner score"));
});
test("43 all three exports remain pure and don't mutate instructor's bank",()=>{
 const b=bank();const before=JSON.stringify(b);
 buildEducationLearnerWorksheetJson(b);
 buildEducationLearnerWorksheetText(b);
 buildEducationBankAuditCsv(b);
 assert.equal(JSON.stringify(b),before);
});
test("44 UI uses actual read-only audit counts rather than fake proficiency",()=>{
 assert.match(ui,/auditEducationQuestionBank\(bank\)/);
 assert.match(ui,/qualityAudit\.counts\.fix/);
 assert.match(ui,/qualityAudit\.counts\.review/);
 assert.match(ui,/qualityAudit\.counts\.maxPoints/);
});
test("45 UI exposes a real navigable review filter combined with search and question type",()=>{
 assert.match(ui,/id="authoring-question-quality"/);
 assert.match(ui,/qualityFilter === "all"/);
 assert.match(ui,/qualityAudit\.items\[item\.index\]\?\.state === qualityFilter/);
 assert.match(ui,/searchBankQuestions\(bank, questionSearch, questionTypeFilter\)/);
});
test("46 UI jumps to real question ID and opens private editor, not a fake modal",()=>{
 assert.match(ui,/nextEducationBankQualityIndex\(qualityAudit\.items, activeIndex, type\)/);
 assert.match(ui,/setActiveId\(bank\.questions\[index\]\.id\)/);
 assert.match(ui,/Next question to fix/);
 assert.match(ui,/Next wording to review/);
});
test("47 UI shows actual validation issues and duplicate warnings in the authoring card",()=>{
 assert.match(ui,/qualityAudit\.items\[activeIndex\]\.issues\.map/);
 assert.match(ui,/qualityAudit\.items\[activeIndex\]\.warnings\.map/);
 assert.match(ui,/Editorial wording warnings/);
});
test("48 student worksheets are disabled until full validation",()=>{
 assert.match(ui,/disabled=\{!readiness\.valid\}/);
 assert.match(ui,/buildEducationLearnerWorksheetJson\(bank\)/);
 assert.match(ui,/buildEducationLearnerWorksheetText\(bank\)/);
 assert.match(ui,/question wording can still reveal hints or answers/);
});
test("49 spreadsheet checklist is a real CSV and stays separate from student materials",()=>{
 assert.match(ui,/buildEducationBankAuditCsv\(bank\)/);
 assert.match(ui,/eternyx-question-bank-quality-review\.csv/);
 assert.match(ui,/downloadText\(/);
});
test("50 original answer-key authoring and bounded undo remain in place",()=>{
 assert.match(ui,/createBankUndoHistory\(emptyQuestionBank\(\) as Bank\)/);
 assert.match(ui,/chooseCorrect\(/);
 assert.match(ui,/historyController\.reset\(next\)/);
 assert.match(ui,/exportQuestionBankJson\(bank, ready\)/);
});
test("51 account changes clear quality filters and private answer-key snapshots",()=>{
 assert.match(ui,/setQualityFilter\("all"\)/);
 assert.match(ui,/resetEditor\(emptyQuestionBank\(\) as Bank\)/);
 assert.match(ui,/accountGenerationRef\.current \+= 1/);
});
test("52 no new hosted or persistent writes in pure reviewer helpers",()=>{
 const helper=read("src/lib/educationQuestionQuality.mjs");
 assert.doesNotMatch(helper,/supabase\.|fetch\(|localStorage\.|sessionStorage\.|createClient\(/);
 assert.match(doc,/NOT DEPLOYED/);
 assert.match(doc,/production/i);
});
test("53 instructor authoring TSX still parses",()=>{
 const ast=ts.createSourceFile("EducationInstructorStudio.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
