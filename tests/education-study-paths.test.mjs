import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  STUDY_PATH_FORMAT,STUDY_SESSION_FORMAT,STUDY_FILE_LIMIT,STUDY_MAX_LESSONS,
  emptyStudyDraft,emptyStudyLesson,authorStudyPath,buildStudyPathJson,
  validateStudyPath,parseStudyFile,emptyStudyRecords,changeStudyRecord,
  summarizeStudyPath,buildStudySessionJson,buildStudyProgressCsv,
} from "../src/lib/educationStudyPaths.mjs";

const lesson=(n,title="Lesson "+n)=>({
  number:n,title,objective:"Describe a verifiable learning outcome",
  reading:"An actual, user-authored reading passage with enough explanation.",
  activity_prompt:"Carry out a practical observation and record the result.",
  reflection_prompt:"Explain what you learned from this activity.",
  estimated_minutes:25,
});
const draft=()=>({
  title:"Cathodic protection study path",
  description:"Local learner-authored guide only",
  lessons:[lesson(1,"Corrosion basics"),lesson(2,"Inspect a reference electrode")],
});
const path=()=>authorStudyPath(draft());
const denied=fn=>assert.throws(fn,/Invalid or unsafe local Education study path or session/);

test("empty authoring is truly empty, and a valid authored pack round-trips with no invented lessons",()=>{
 assert.deepEqual(emptyStudyDraft(),{title:"",description:"",lessons:[]});
 assert.deepEqual(emptyStudyLesson(1),{
   number:1,title:"",objective:"",reading:"",
   activity_prompt:"",reflection_prompt:"",estimated_minutes:20,
 });
 denied(()=>authorStudyPath(emptyStudyDraft()));
 const json=buildStudyPathJson(draft());
 const imported=parseStudyFile(json);
 assert.equal(imported.path.format,STUDY_PATH_FORMAT);
 assert.equal(imported.path.version,1);
 assert.equal(imported.path.title,"Cathodic protection study path");
 assert.equal(imported.path.lessons[0].title,"Corrosion basics");
 assert.deepEqual(imported.records,emptyStudyRecords(imported.path));
 assert.equal(json.includes('"correct"'),false);
 assert.equal(json.includes('"score"'),false);
 assert.equal(json.includes('"grade"'),false);
 assert.equal(json.includes('"answer_key"'),false);
});
test("strict lesson structure rejects forged scores, hidden keys and unknown properties",()=>{
 for(const mutate of [
   x=>{x.secret="private";},x=>{x.answer_key="choiceA";},
   x=>{x.score=100;},x=>{x.version=2;},
   x=>{x.format="eternyx-instructor-question-bank";},
   x=>{x.title="  ";},x=>{x.lessons=[];},
   x=>{x.lessons[0].correct=true;},x=>{x.lessons[0].answer_key="hidden";},
   x=>{x.lessons[0].number=2;},x=>{x.lessons[1].number=1;},
   x=>{x.lessons[0].title="";},x=>{x.lessons[1].title="CORROSION BASICS";},
   x=>{x.lessons[0].objective="";},x=>{x.lessons[0].reading="too short";},
   x=>{x.lessons[0].activity_prompt="";},x=>{x.lessons[1].reflection_prompt="bad";},
   x=>{x.lessons[0].estimated_minutes=0;},x=>{x.lessons[0].estimated_minutes=241;},
   x=>{x.lessons=Array.from({length:31},(_,i)=>lesson(i+1));},
 ]){
   const p=structuredClone(path());mutate(p);
   denied(()=>validateStudyPath(p));
   denied(()=>parseStudyFile(JSON.stringify(p)));
 }
 denied(()=>emptyStudyLesson(0));
 denied(()=>emptyStudyLesson(STUDY_MAX_LESSONS+1));
 denied(()=>parseStudyFile("{json"));
 denied(()=>parseStudyFile(" ".repeat(STUDY_FILE_LIMIT+1)));
 denied(()=>parseStudyFile(""));
});
test("real study progress counts only manual completions; notes and starts are never scores",()=>{
 const p=path();
 let records=emptyStudyRecords(p);
 assert.deepEqual(summarizeStudyPath(p,records),{
   lessons:2,completed:0,remaining:2,started:0,flagged:0,percentage:0,nextLesson:1,
 });
 denied(()=>changeStudyRecord(p,records,1,"completed",true));
 records=changeStudyRecord(p,records,1,"activity","Measured potential in a test fixture.");
 records=changeStudyRecord(p,records,1,"note","Optional private observations.");
 records=changeStudyRecord(p,records,2,"flagged",true);
 assert.deepEqual(summarizeStudyPath(p,records),{
   lessons:2,completed:0,remaining:2,started:1,flagged:1,percentage:0,nextLesson:1,
 });
 denied(()=>changeStudyRecord(p,records,1,"completed",true));
 records=changeStudyRecord(p,records,1,"reflection","The instrument reference matters.");
 records=changeStudyRecord(p,records,1,"completed",true);
 assert.deepEqual(summarizeStudyPath(p,records),{
   lessons:2,completed:1,remaining:1,started:1,flagged:1,percentage:50,nextLesson:2,
 });
 records=changeStudyRecord(p,records,2,"activity","Practical 2");
 records=changeStudyRecord(p,records,2,"reflection","Reflection 2");
 records=changeStudyRecord(p,records,2,"completed",true);
 assert.equal(summarizeStudyPath(p,records).percentage,100);
 assert.equal(summarizeStudyPath(p,records).nextLesson,null);
 records=changeStudyRecord(p,records,1,"reflection","");
 assert.equal(records[0].completed,false);
 assert.equal(summarizeStudyPath(p,records).nextLesson,1);
 assert.equal(records[0].note,"Optional private observations.");
});
test("resume file contains exact safe path plus own activity, reflection and flags; no hidden grading",()=>{
 const p=path();
 let records=emptyStudyRecords(p);
 records=changeStudyRecord(p,records,1,"activity","Observed a test terminal voltage");
 records=changeStudyRecord(p,records,1,"reflection","Observe before deciding");
 records=changeStudyRecord(p,records,1,"completed",true);
 records=changeStudyRecord(p,records,2,"flagged",true);
 const saved=buildStudySessionJson(p,records);
 const raw=JSON.parse(saved);
 assert.equal(raw.format,STUDY_SESSION_FORMAT);
 assert.equal(raw.version,1);
 assert.deepEqual(Object.keys(raw).sort(),["format","version","path","records"].sort());
 const restored=parseStudyFile(saved);
 assert.deepEqual(restored.path,p);
 assert.deepEqual(restored.records,records);
 assert.equal(saved.includes('"score"'),false);
 assert.equal(saved.includes('"correct"'),false);
 assert.equal(saved.includes('"certificate"'),false);
});
test("tampered resume rows, forged completion or attempts to attach privileged state fail closed",()=>{
 const original=JSON.parse(buildStudySessionJson(path(),emptyStudyRecords(path())));
 for(const mutate of [
  x=>{x.signed_grade=100;},
  x=>{x.version=2;},
  x=>{x.format=STUDY_PATH_FORMAT;},
  x=>{x.records.pop();},
  x=>{x.records.reverse();},
  x=>{x.records[0].id="unowned";},
  x=>{x.records[0].is_correct=true;},
  x=>{x.records[0].number=2;},
  x=>{x.records[0].activity=42;},
  x=>{x.records[0].note="a".repeat(3001);},
  x=>{x.records[0].activity="a".repeat(4001);},
  x=>{x.records[0].reflection="a".repeat(4001);},
  x=>{x.records[0].completed=true;},
  x=>{x.records[0].flagged=1;},
  x=>{x.path.lessons[0].answer_key="secret";},
 ]){
  const bad=structuredClone(original);mutate(bad);
  denied(()=>parseStudyFile(JSON.stringify(bad)));
 }
 denied(()=>changeStudyRecord(path(),emptyStudyRecords(path()),0,"note","bad"));
 denied(()=>changeStudyRecord(path(),emptyStudyRecords(path()),3,"note","bad"));
 denied(()=>changeStudyRecord(path(),emptyStudyRecords(path()),1,"grade",100));
 denied(()=>changeStudyRecord(path(),emptyStudyRecords(path()),1,"flagged","true"));
 denied(()=>changeStudyRecord(path(),emptyStudyRecords(path()),1,"activity",null));
});
test("exported progress CSV formula-protects untrusted reading prompts, lesson text and responses",()=>{
 const d=draft();
 d.title="=HYPERLINK(\"https://example.invalid\")";
 d.lessons[0].title="@SUM(2,2)";
 d.lessons[0].activity_prompt="+cmd | thing";
 d.lessons[0].reflection_prompt="-secret";
 const p=authorStudyPath(d);
 let records=emptyStudyRecords(p);
 records=changeStudyRecord(p,records,1,"activity","=WEBSERVICE(\"https://example.invalid\")");
 records=changeStudyRecord(p,records,1,"reflection","@A1");
 records=changeStudyRecord(p,records,1,"note","-10");
 const csv=buildStudyProgressCsv(p,records);
 assert.ok(csv.startsWith("\uFEFF"));
 for(const value of ["'=HYPERLINK","'@SUM","'+cmd","'-secret",
  "'=WEBSERVICE","'@A1","'-10"])assert.ok(csv.includes(value),value);
 assert.ok(csv.includes('"Not graded"'));
 assert.equal(csv.includes('"Awarded grade"'),false);
 assert.equal(csv.split("\r\n").length,4);
});
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/pages/EducationStudyPaths.tsx");
const home=read("src/pages/Education.tsx");
const app=read("src/App.tsx");
const instructor=read("src/pages/EducationInstructorStudio.tsx");
test("study path route is a functioning public Education page, discoverable from two entry points",()=>{
 assert.match(app,/const EducationStudyPaths = lazy\(\(\) => import\("\.\/pages\/EducationStudyPaths"\)\)/);
 assert.match(app,/<Route path="\/education\/study-paths" element=\{<EducationStudyPaths \/>\} \/>/);
 assert.match(home,/<Link to="\/education\/study-paths">Open Study Paths/);
 assert.match(instructor,/<Link to="\/education\/study-paths">Create or follow study paths/);
 assert.doesNotMatch(app,/<Route path="\/education\/study-paths" element=\{<RequireAuth>/);
});
test("lesson authoring and learning controls are wired to actual data transformations",()=>{
 for(const token of [
  "authorStudyPath","buildStudyPathJson","parseStudyJourneyFile","changeStudyRecord",
  "summarizeStudyPath","buildStudyJourneySessionJson","buildStudyProgressCsv",
  "emptyStudyDraft","emptyStudyLesson","Add lesson","Move lesson up",
  "Move lesson down","Delete lesson","Export validated path",
  "Open this path for study","Lesson reading","Practical activity",
  "My activity response","My reflection","Private notes","Mark lesson complete",
  "Reopen lesson","Continue next unfinished lesson","Not completed",
  "Save study resume","Export private notes","window.confirm","file.text()",
  "role=\"progressbar\"",
 ])assert.ok(ui.includes(token),token);
 assert.doesNotMatch(ui,/supabase|fetch\(|axios|localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML|innerHTML|service_role|access_token/);
 assert.doesNotMatch(ui,/score[=:]|is_correct|points_awarded|createClient|setInterval/);
 const compiled=ts.transpileModule(ui,{fileName:"EducationStudyPaths.tsx",
  reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.deepEqual((compiled.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error)
   .map(x=>x.messageText),[]);
});


const workflow=read(".github/workflows/education-atomic-browser-ci.yml");
const browserSource=read("tests/browser/education_study_paths_local.py");
test("Study Paths has genuine desktop and mobile Chrome acceptance in existing offline Education CI",()=>{
 for(const key of ["src/pages/EducationStudyPaths.tsx","tests/browser/education_study_paths_local.py",
  "tests/education-study-paths.test.mjs","education-study-paths-local-browser.json"])
  assert.ok(workflow.includes(key),key);
 assert.match(workflow,/python" tests\/browser\/education_study_paths_local\.py/);
 for(const check of [
   "author_real_lesson_and_export_path",
   "unanswered_lesson_cannot_be_marked_complete",
   "activity_reflection_enables_manual_completion",
   "private_resume_roundtrip_restores_progress",
   "safe_csv_export_neutralizes_formulas",
   "privileged_key_import_fails_closed",
   "no_private_study_data_sent_to_external_hosts",
 ])assert.ok(browserSource.includes(check),check);
 assert.match(browserSource,/1440.*900/);
 assert.match(browserSource,/390.*844/);
 assert.match(browserSource,/route\.abort\(\)/);
 assert.doesNotMatch(browserSource,/staging_password|service_role|screenshot\(|storage_state\(/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets\./);
});
