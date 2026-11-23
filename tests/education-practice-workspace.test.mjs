import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  PRACTICE_WORKSHEET_FORMAT,PRACTICE_SESSION_FORMAT,PRACTICE_FILE_MAX_BYTES,
  validatePracticeWorksheet,parseEducationPracticeFile,blankPracticeResponses,
  updatePracticeResponse,togglePracticeFlag,summarizePractice,
  buildPracticeSessionJson,buildPracticeAnswerCsv,
} from "../src/lib/educationPracticeWorkspace.mjs";
import {buildEducationLearnerWorksheetJson} from "../src/lib/educationQuestionQuality.mjs";

const worksheet=()=>({
  format:PRACTICE_WORKSHEET_FORMAT,version:1,
  title:"Local corrosion practice",
  description:"Instructor-exported learner-only material",
  suggested_duration_minutes:30,
  questions:[
    {number:1,type:"multiple_choice",text:"Which anode suits high-resistivity soil?",points:4,
     choices:["Magnesium","Zinc","Aluminum"]},
    {number:2,type:"true_false",text:"Cathodic protection reduces corrosion.",points:2,
     choices:["True","False"]},
    {number:3,type:"short_answer",text:"Explain IR drop in your own words.",points:5,
     choices:[]},
  ],
  notice:"Practice worksheet only. This is not a timed or graded exam.",
});
const originalBank=()=>({
  version:1,title:"Local corrosion practice",
  description:"Instructor-exported learner-only material",
  duration_minutes:30,
  questions:[
    {id:"q1",type:"multiple_choice",text:"Which anode suits high-resistivity soil?",points:4,
      options:[{id:"q1-a",text:"Magnesium",correct:true},{id:"q1-b",text:"Zinc",correct:false},
               {id:"q1-c",text:"Aluminum",correct:false}]},
    {id:"q2",type:"true_false",text:"Cathodic protection reduces corrosion.",points:2,
      options:[{id:"q2-t",text:"True",correct:true},{id:"q2-f",text:"False",correct:false}]},
    {id:"q3",type:"short_answer",text:"Explain IR drop in your own words.",points:5,
      options:[]},
  ],
});
const rejects=raw=>assert.throws(
  ()=>parseEducationPracticeFile(JSON.stringify(raw)),/learner-safe/);

test("real instructor worksheet JSON imports directly into a learner-only session",()=>{
 const text=buildEducationLearnerWorksheetJson(originalBank());
 const data=parseEducationPracticeFile(text);
 assert.deepEqual(data.worksheet,validatePracticeWorksheet(worksheet()));
 assert.equal(data.worksheet.questions.length,3);
 assert.equal(data.responses.length,3);
 assert.deepEqual(data.flags,[]);
 assert.deepEqual(data.responses[0],{number:1,choice_index:null,written_text:""});
 assert.equal(text.includes('"correct"'),false);
 assert.equal(text.includes('"options"'),false);
 assert.equal(text.includes('"id"'),false);
});

test("one response per question, nonnumeric completion, and review flags all work",()=>{
 const w=worksheet();
 let rows=blankPracticeResponses(w);
 let flags=[];
 assert.deepEqual(summarizePractice(w,rows,flags),{
  total:3,answered:0,unanswered:3,flagged:0,percentage:0,next_unanswered:1,
 });
 rows=updatePracticeResponse(w,rows,1,0,"");
 rows=updatePracticeResponse(w,rows,2,1,"");
 rows=updatePracticeResponse(w,rows,3,null,"  Our example: voltage offset due to I×R.  ");
 flags=togglePracticeFlag(w,flags,2);
 flags=togglePracticeFlag(w,flags,1);
 assert.deepEqual(flags,[1,2]);
 assert.deepEqual(summarizePractice(w,rows,flags),{
  total:3,answered:3,unanswered:0,flagged:2,percentage:100,next_unanswered:null,
 });
 assert.equal(rows[0].choice_index,0);
 assert.equal(rows[1].choice_index,1);
 assert.match(rows[2].written_text,/voltage offset/);
 assert.equal(Object.hasOwn(rows[2],"score"),false);
 flags=togglePracticeFlag(w,flags,1);
 rows=updatePracticeResponse(w,rows,1,null,"");
 rows=updatePracticeResponse(w,rows,3,null," \n  ");
 assert.deepEqual(flags,[2]);
 assert.deepEqual(summarizePractice(w,rows,flags),{
  total:3,answered:1,unanswered:2,flagged:1,percentage:33,next_unanswered:1,
 });
});

test("resume JSON explicitly saves worksheet + responses + flags and restores the entire practice",()=>{
 const w=worksheet();
 let rows=blankPracticeResponses(w);
 rows=updatePracticeResponse(w,rows,1,2,"");
 rows=updatePracticeResponse(w,rows,3,null,"A saved learner response");
 const flags=togglePracticeFlag(w,[],3);
 const json=buildPracticeSessionJson(w,rows,flags);
 const saved=JSON.parse(json);
 assert.equal(saved.format,PRACTICE_SESSION_FORMAT);
 assert.equal(saved.version,1);
 assert.deepEqual(Object.keys(saved).sort(),
  ["format","version","worksheet","responses","flagged_numbers"].sort());
 assert.deepEqual(parseEducationPracticeFile(json).responses,rows);
 assert.deepEqual(parseEducationPracticeFile(json).flags,[3]);
 assert.equal(json.includes('"correct"'),false);
 assert.equal(json.includes('"answer_key"'),false);
 assert.equal(json.includes('"grade"'),false);
});

test("all imported worksheet shape extensions and hidden instructor answer keys are rejected",()=>{
 for(const mutate of [
  x=>{x.correct_answer_index=1;},
  x=>{x.answer_key="Magnesium";},
  x=>{x.questions[0].correct=true;},
  x=>{x.questions[0].answer="Magnesium";},
  x=>{x.questions[0].options=[{text:"Magnesium",correct:true}];},
  x=>{x.questions[0].choices[0]={text:"Magnesium",correct:true};},
  x=>{x.questions[0].number=2;},
  x=>{x.questions[1].number=1;},
  x=>{x.questions[2].type="multiple_choice";},
  x=>{x.questions[1].choices=["True"];},
  x=>{x.questions[0].choices=["Magnesium","magnesium "];},
  x=>{x.questions[0].choices[0]="";},
  x=>{x.questions[0].points=1001;},
  x=>{x.questions[0].text="";},
  x=>{x.questions[2].choices=["secret"];},
  x=>{x.version=2;},
  x=>{x.format="eternyx-instructor-private-bank";},
  x=>{x.notice="This is officially graded";},
  x=>{x.suggested_duration_minutes=0;},
  x=>{x.title="";},
  x=>{x.questions=[];},
  x=>{x.questions=Array.from({length:101},()=>structuredClone(x.questions[0]));},
 ]){
  const w=worksheet();mutate(w);rejects(w);
 }
 rejects(originalBank());
 assert.throws(()=>parseEducationPracticeFile("{broken json"),/learner-safe/);
 assert.throws(()=>parseEducationPracticeFile(""),/learner-safe/);
 assert.throws(()=>parseEducationPracticeFile(" ".repeat(PRACTICE_FILE_MAX_BYTES+1)),/learner-safe/);
});

test("answers are tightly scoped, bounded and cannot add another question or fake marks",()=>{
 const w=worksheet(),rows=blankPracticeResponses(w);
 for(const bad of [
  ()=>updatePracticeResponse(w,rows,0,0,""),
  ()=>updatePracticeResponse(w,rows,4,0,""),
  ()=>updatePracticeResponse(w,rows,1,99,""),
  ()=>updatePracticeResponse(w,rows,1,"0",""),
  ()=>updatePracticeResponse(w,rows,1,1,"hacked written answer"),
  ()=>updatePracticeResponse(w,rows,2,null,"not a written question"),
  ()=>updatePracticeResponse(w,rows,3,0,"written answer"),
  ()=>updatePracticeResponse(w,rows,3,null,"z".repeat(5001)),
  ()=>togglePracticeFlag(w,[],0),
  ()=>togglePracticeFlag(w,[2,1],3),
  ()=>summarizePractice(w,[...rows,{number:4,choice_index:0,written_text:""}],[]),
 ])assert.throws(bad,/learner-safe/);
});

test("tampered resume files cannot restore foreign/malformed answer or review scope",()=>{
 const w=worksheet(),responses=blankPracticeResponses(w);
 const base=JSON.parse(buildPracticeSessionJson(w,responses,[]));
 for(const change of [
  x=>{x.results=[{score:100}];},
  x=>{x.score=100;},
  x=>{x.version=2;},
  x=>{x.responses.pop();},
  x=>{x.responses[1].number=1;},
  x=>{x.responses[1].correct=true;},
  x=>{x.responses[0].choice_index=8;},
  x=>{x.responses[0].written_text="unauthorized";},
  x=>{x.responses[2].choice_index=1;},
  x=>{x.responses[2].written_text=1;},
  x=>{x.flagged_numbers=[1,1];},
  x=>{x.flagged_numbers=[0];},
  x=>{x.flagged_numbers=[3,2];},
  x=>{x.flagged_numbers=[4];},
  x=>{x.worksheet.questions[0].correct_option_id="secret";},
 ]){
  const object=structuredClone(base);change(object);rejects(object);
 }
});

test("CSV is always ungraded and neutralizes hostile spreadsheet formula content",()=>{
 const w=worksheet();
 w.title="=HYPERLINK(\"https://malicious.invalid\")";
 w.questions[0].text="@SUM(1,2)";
 w.questions[0].choices[0]="-CMD|'/C calc'!A0";
 let rows=blankPracticeResponses(w);
 rows=updatePracticeResponse(w,rows,1,0,"");
 rows=updatePracticeResponse(w,rows,3,null,"=WEBSERVICE(\"https://malicious.invalid\")");
 const csv=buildPracticeAnswerCsv(w,rows);
 assert.ok(csv.startsWith("\uFEFF"));
 assert.ok(csv.includes("Unscored local practice"));
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(csv.includes("'@SUM(1,2)"));
 assert.ok(csv.includes("'-CMD"));
 assert.ok(csv.includes("'=WEBSERVICE"));
 assert.equal(csv.includes("Correct answer"),false);
 assert.equal(csv.includes("Final grade"),false);
 assert.equal(csv.split("\r\n").length,6);
});

const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=src("src/pages/EducationPractice.tsx");
const app=src("src/App.tsx");
const home=src("src/pages/Education.tsx");
const studio=src("src/pages/EducationInstructorStudio.tsx");
test("new practice route is real, public, lazy-loaded and discoverable in Education",()=>{
 assert.match(app,/const EducationPractice = lazy\(\(\) => import\("\.\/pages\/EducationPractice"\)\)/);
 assert.match(app,/<Route path="\/education\/practice" element=\{<EducationPractice \/>\} \/>/);
 assert.match(home,/<Link to="\/education\/practice">Open Practice Workspace/);
 assert.match(studio,/<Link to="\/education\/practice">Open learner practice workspace/);
 assert.doesNotMatch(app,/<Route path="\/education\/practice" element=\{<RequireAuth>/);
});

test("workspace has real controlled answers, review navigation, export and explicit reset",()=>{
 for(const key of [
  "parseEducationPracticeFile","updatePracticeResponse",
  "togglePracticeFlag","summarizePractice","buildPracticeSessionJson",
  "buildPracticeAnswerCsv","file.text()","Save resume (.json)",
  "Export my answers (.csv)","Next unanswered question",
  "Question navigator","Unanswered only","Flagged for review",
  "Clear practice","window.confirm","role=\"progressbar\"",
  "aria-pressed","aria-current","Your written response",
 ])assert.ok(ui.includes(key),key);
 assert.doesNotMatch(ui,/supabase|localStorage|sessionStorage|fetch\(|axios|service_role|createClient/);
 assert.doesNotMatch(ui,/setInterval|setTimeout\([^)]*exam|grade\s*=|is_correct|points_awarded/);
 const compiled=ts.transpileModule(ui,{fileName:"EducationPractice.tsx",
  reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.deepEqual((compiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error)
  .map(d=>d.messageText),[]);
});
