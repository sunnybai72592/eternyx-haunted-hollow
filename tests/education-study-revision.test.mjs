import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  authorStudyPath,emptyStudyRecords,changeStudyRecord,
  buildStudySessionJson,
} from "../src/lib/educationStudyPaths.mjs";
import {
  STUDY_REVISION_SESSION_VERSION,STUDY_REVISION_INTERVALS,
  blankStudyRevision,validateStudyRevision,setStudyRevisionInterval,
  recordStudyManualReview,reconcileStudyRevisions,studyRevisionInsights,
  revisionStatus,parseStudyJourneyFile,buildStudyJourneySessionJson,
  buildStudySharePathJson,buildStudyShareOutline,buildStudyRevisionCalendarCsv,
} from "../src/lib/educationStudyRevision.mjs";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const sample=()=>authorStudyPath({
  title:"=Corrosion essentials",description:"A self-authored course",
  lessons:[
   {number:1,title:"@Electrochemistry",objective:"Describe charge transfer",
    reading:"Electrochemistry covers oxidation and reduction in a wet metal environment.",
    activity_prompt:"Write a practical observation from a safe example.",
    reflection_prompt:"What changed in the electrochemical cell?",estimated_minutes:30},
   {number:2,title:"Reference electrode",objective:"Interpret potential readings",
    reading:"Reference electrodes establish comparative measurement potentials in the field.",
    activity_prompt:"Sketch a reference connection in a safe offline diagram.",
    reflection_prompt:"What might affect the measured potential?",estimated_minutes:25},
   {number:3,title:"Coating inspection",objective:"Review inspection records",
    reading:"Visual coating inspection checks continuity and surface conditions with care.",
    activity_prompt:"Review sample coating defect notes without accessing a real asset.",
    reflection_prompt:"Which evidence would be needed for follow-up?",estimated_minutes:20},
  ],
});
const completedRecords=(p=sample())=>{
 let records=emptyStudyRecords(p);
 records=changeStudyRecord(p,records,1,"activity","Practical observation =WEBSERVICE(1)");
 records=changeStudyRecord(p,records,1,"reflection","Reflection @SUM(1,2)");
 records=changeStudyRecord(p,records,1,"completed",true);
 records=changeStudyRecord(p,records,2,"activity","Second practice completed");
 records=changeStudyRecord(p,records,2,"reflection","Second reflection completed");
 records=changeStudyRecord(p,records,2,"completed",true);
 return records;
};
const denied=action=>assert.throws(action,
 /Invalid Education revision plan or shared study file|Invalid or unsafe local Education study path or session/);

test("existing v1 path and v1 sessions remain importable with empty manual review plan",()=>{
 const p=sample(),records=completedRecords(p);
 for(const file of [buildStudySharePathJson(p),buildStudySessionJson(p,records)]){
  const parsed=parseStudyJourneyFile(file);
  assert.deepEqual(parsed.path,p);
  assert.deepEqual(parsed.revision,blankStudyRevision(p));
  assert.equal(parsed.records.length,3);
 }
 const old=parseStudyJourneyFile(buildStudySessionJson(p,records));
 assert.equal(old.records[0].completed,true);
 assert.equal(old.revision[0].review_count,0);
 assert.equal(old.revision[0].next_due_on,null);
 assert.deepEqual(STUDY_REVISION_INTERVALS,[1,3,7,14,30]);
 assert.equal(STUDY_REVISION_SESSION_VERSION,2);
});

test("manual review requires actual completed learner work, selected cadence and confidence",()=>{
 const p=sample(),records=completedRecords(p);
 let plan=blankStudyRevision(p);
 assert.equal(plan[0].interval_days,3);
 denied(()=>recordStudyManualReview(p,records,plan,3,"2026-11-23","developing"));
 denied(()=>recordStudyManualReview(p,records,plan,1,"2026-11-23","unrated"));
 denied(()=>recordStudyManualReview(p,records,plan,1,"2026-11-23","excellent"));
 denied(()=>recordStudyManualReview(p,records,plan,1,"not a date","developing"));
 plan=setStudyRevisionInterval(p,records,plan,1,7);
 plan=recordStudyManualReview(p,records,plan,1,"2026-11-23","developing");
 assert.deepEqual(plan[0],{
  number:1,interval_days:7,review_count:1,
  last_reviewed_on:"2026-11-23",next_due_on:"2026-11-30",
  confidence:"developing",
 });
 plan=recordStudyManualReview(p,records,plan,1,"2026-11-24","needs_practice");
 assert.equal(plan[0].review_count,2);
 assert.equal(plan[0].next_due_on,"2026-12-01");
 assert.equal(plan[0].confidence,"needs_practice");
 denied(()=>recordStudyManualReview(p,records,plan,1,"2026-11-22","developing"));
 plan=setStudyRevisionInterval(p,records,plan,1,14);
 assert.equal(plan[0].next_due_on,"2026-12-08");
 assert.equal(plan[0].review_count,2);
 denied(()=>setStudyRevisionInterval(p,records,plan,1,2));
 denied(()=>setStudyRevisionInterval(p,records,plan,4,7));
});

test("calendar arithmetic handles month and leap-year boundaries exactly in UTC",()=>{
 const p=sample(),records=completedRecords(p);
 let plan=blankStudyRevision(p);
 plan=setStudyRevisionInterval(p,records,plan,1,1);
 plan=recordStudyManualReview(p,records,plan,1,"2028-02-28","comfortable");
 assert.equal(plan[0].next_due_on,"2028-02-29");
 plan=setStudyRevisionInterval(p,records,plan,1,3);
 assert.equal(plan[0].next_due_on,"2028-03-02");
 denied(()=>recordStudyManualReview(p,records,plan,1,"2028-02-30","comfortable"));
 denied(()=>recordStudyManualReview(p,records,plan,1,"2028-02-27","comfortable"));
 plan=recordStudyManualReview(p,records,plan,1,"2028-02-29","comfortable");
 assert.equal(plan[0].next_due_on,"2028-03-03");
});

test("reopening a lesson explicitly clears stale revision history without changing cadence",()=>{
 const p=sample();
 let rows=completedRecords(p),rev=blankStudyRevision(p);
 rev=setStudyRevisionInterval(p,rows,rev,1,30);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-23","comfortable");
 rows=changeStudyRecord(p,rows,1,"reflection","");
 assert.equal(rows[0].completed,false);
 denied(()=>validateStudyRevision(p,rows,rev));
 rev=reconcileStudyRevisions(p,rows,rev);
 assert.deepEqual(rev[0],{
  number:1,interval_days:30,review_count:0,
  last_reviewed_on:null,next_due_on:null,confidence:"unrated",
 });
 assert.equal(rev[1].review_count,0);
 assert.equal(revisionStatus(rev[0],rows[0],"2026-11-23"),"Lesson incomplete");
});

test("revision overview derives due, overdue, upcoming, unscheduled and remaining minutes",()=>{
 const p=sample(),rows=completedRecords(p);
 let rev=blankStudyRevision(p);
 let x=studyRevisionInsights(p,rows,rev,"2026-11-23");
 assert.deepEqual(x,{
  asOf:"2026-11-23",completed:2,started:2,due:0,overdue:0,
  upcomingWeek:0,readyToSchedule:2,reviewed:0,
  remainingEstimatedMinutes:20,nextReviewLesson:1,
 });
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-20","comfortable");
 x=studyRevisionInsights(p,rows,rev,"2026-11-23");
 assert.equal(x.due,1);assert.equal(x.overdue,0);
 assert.equal(x.readyToSchedule,1);assert.equal(x.nextReviewLesson,1);
 assert.equal(revisionStatus(rev[0],rows[0],"2026-11-23"),"Due today");
 rev=setStudyRevisionInterval(p,rows,rev,2,7);
 rev=recordStudyManualReview(p,rows,rev,2,"2026-11-22","developing");
 x=studyRevisionInsights(p,rows,rev,"2026-11-24");
 assert.equal(x.due,1);assert.equal(x.overdue,1);
 assert.equal(x.upcomingWeek,1);assert.equal(x.readyToSchedule,0);
 assert.equal(x.reviewed,2);assert.equal(x.nextReviewLesson,1);
 assert.equal(revisionStatus(rev[0],rows[0],"2026-11-24"),"Overdue");
 assert.equal(revisionStatus(rev[1],rows[1],"2026-11-24"),"Scheduled");
 denied(()=>studyRevisionInsights(p,rows,rev,"2026-02-30"));
});

test("version 2 saved session round-trips real private notes and exact manual review data",()=>{
 const p=sample();
 const rows=completedRecords(p);
 let rev=blankStudyRevision(p);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-23","needs_practice");
 const json=buildStudyJourneySessionJson(p,rows,rev);
 const parsed=JSON.parse(json);
 assert.deepEqual(Object.keys(parsed).sort(),["format","version","path","records","revision"].sort());
 assert.equal(parsed.version,2);
 const actual=parseStudyJourneyFile(json);
 assert.deepEqual(actual.path,p);
 assert.deepEqual(actual.records,rows);
 assert.deepEqual(actual.revision,rev);
 assert.equal(actual.revision[0].next_due_on,"2026-11-26");
 assert.equal(actual.records[0].activity.includes("WEBSERVICE"),true);
 assert.equal(json.includes('"score"'),false);
 assert.equal(json.includes('"certificate"'),false);
});

test("v2 sessions reject injected grade, altered review dates and forged completion",()=>{
 const p=sample(),rows=completedRecords(p);
 let rev=blankStudyRevision(p);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-23","developing");
 const base=JSON.parse(buildStudyJourneySessionJson(p,rows,rev));
 const attacks=[
   s=>{s.score=100;},
   s=>{s.correct_answers=["secret"];},
   s=>{s.version=3;},
   s=>{s.revision.pop();},
   s=>{s.revision.reverse();},
   s=>{s.revision[0].review_count=0;},
   s=>{s.revision[0].review_count=10001;},
   s=>{s.revision[0].next_due_on="2026-12-25";},
   s=>{s.revision[0].last_reviewed_on="2026-02-30";},
   s=>{s.revision[0].confidence="officially_correct";},
   s=>{s.revision[0].confidence="unrated";},
   s=>{s.revision[0].interval_days=2;},
   s=>{s.revision[0].points_awarded=100;},
   s=>{s.revision[1].last_reviewed_on="2026-11-23";},
   s=>{s.records[0].completed=false;},
   s=>{s.records[1].user_id="aDifferentStudent";},
   s=>{s.path.lessons[0].answer_key="hidden";},
 ];
 for(const edit of attacks){
  const invalid=structuredClone(base);edit(invalid);
  denied(()=>parseStudyJourneyFile(JSON.stringify(invalid)));
 }
 denied(()=>parseStudyJourneyFile("{invalid json"));
 denied(()=>parseStudyJourneyFile(" ".repeat(1000001)));
});

test("course-only sharing never emits learner answers, review dates, confidence or completion",()=>{
 const p=sample(),rows=completedRecords(p);
 let rev=blankStudyRevision(p);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-23","needs_practice");
 const share=buildStudySharePathJson(p);
 const outline=buildStudyShareOutline(p);
 const ownSession=buildStudyJourneySessionJson(p,rows,rev);
 for(const word of ["Practical observation =WEBSERVICE","2026-11-26","needs_practice"]){
  assert.ok(ownSession.includes(word));
  assert.ok(!share.includes(word));
  assert.ok(!outline.includes(word));
 }
 assert.deepEqual(parseStudyJourneyFile(share).path,p);
 assert.match(outline,/Shareable study path outline/i);
 assert.match(outline,/Suggested total study minutes: 75/);
 assert.match(outline,/Practical activity:/);
 assert.match(outline,/Reflection:/);
 assert.doesNotMatch(outline,/Private observation|lesson graded|certificate issued/i);
});

test("revision schedule CSV uses formula-safe encoding and has no private reflections",()=>{
 const p=sample(),rows=completedRecords(p);
 let rev=blankStudyRevision(p);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-20","comfortable");
 const csv=buildStudyRevisionCalendarCsv(p,rows,rev,"2026-11-24");
 assert.ok(csv.startsWith("\uFEFF"));
 assert.ok(csv.includes("'=Corrosion essentials"));
 assert.ok(csv.includes("'@Electrochemistry"));
 assert.match(csv,/Overdue/);
 assert.match(csv,/2026-11-23/);
 assert.match(csv,/Manual review count/);
 assert.ok(!csv.includes("Practical observation =WEBSERVICE"));
 assert.ok(!csv.includes("Reflection @SUM"));
 assert.ok(csv.includes('"Self-reported confidence"'));
 assert.equal(csv.split("\r\n").length,5);
});

const ui=source("src/pages/EducationStudyPaths.tsx");
test("real Study Paths UI offers manual revision controls and distinct private versus shareable export",()=>{
 for(const word of [
  "parseStudyJourneyFile","buildStudyJourneySessionJson","blankStudyRevision",
  "recordStudyManualReview","setStudyRevisionInterval","reconcileStudyRevisions",
  "studyRevisionInsights","revisionStatus","buildStudyRevisionCalendarCsv",
  "buildStudySharePathJson","buildStudyShareOutline",
  "Revision and progress insights","Manual revision planner",
  "Reviewed today — schedule next review","Share course only (.json)",
  "Share course outline (.txt)","Export private revision plan (.csv)",
  "Due for revision","Completed, needs schedule","Open next revision",
  "revisionRow.next_due_on","Self-reported confidence",
 ])assert.ok(ui.includes(word),word);
 assert.doesNotMatch(ui,/\bsupabase\b|fetch\(|axios|localStorage|sessionStorage|indexedDB|service_role/);
 const result=ts.transpileModule(ui,{fileName:"EducationStudyPaths.tsx",reportDiagnostics:true,
   compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.deepEqual((result.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>d.messageText),[]);
});
