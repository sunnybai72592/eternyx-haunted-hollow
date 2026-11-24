import test from "node:test";
import assert from "node:assert/strict";
import {authorStudyPath,emptyStudyRecords,changeStudyRecord} from "../src/lib/educationStudyPaths.mjs";
import {blankStudyRevision,recordStudyManualReview} from "../src/lib/educationStudyRevision.mjs";
import {planStudyFocusSession,buildStudyFocusChecklist,STUDY_FOCUS_BUDGETS} from "../src/lib/educationFocusSession.mjs";

function fixture(){
 const path=authorStudyPath({title:"Private curriculum",description:"Course description",
  lessons:[1,2,3,4].map(n=>({number:n,title:"Lesson "+n,objective:"Review",reading:"Study the lesson material and review the practical example.",
   activity_prompt:"Practice",reflection_prompt:"Reflection",estimated_minutes:n===4?60:20}))});
 let records=emptyStudyRecords(path);
 for(const n of [1,2,3]){
  records=changeStudyRecord(path,records,n,"activity","SECRET_ACT");
  records=changeStudyRecord(path,records,n,"reflection","SECRET_REFLECTION");
  records=changeStudyRecord(path,records,n,"note","SECRET_NOTE");
  records=changeStudyRecord(path,records,n,"completed",true);
 }
 let revision=blankStudyRevision(path);
 revision=recordStudyManualReview(path,records,revision,1,"2026-11-20","needs_practice");
 return {path,records,revision};
}
test("focus session uses actual revision priority and never exceeds minutes",()=>{
 const {path,records,revision}=fixture();
 const plan=planStudyFocusSession(path,records,revision,"2026-11-24",30);
 assert.deepEqual(plan.items.map(x=>x.number),[1,2,3]);
 assert.deepEqual(plan.items.map(x=>x.kind),["due","unscheduled","unscheduled"]);
 assert.equal(plan.estimated_minutes,30);
 assert.equal(plan.remaining_minutes,0);
 assert.equal(plan.excluded_count,1);
});
test("unfinished lesson appears when time allows, without falsely marking it complete",()=>{
 const {path,records,revision}=fixture();
 const plan=planStudyFocusSession(path,records,revision,"2026-11-24",120);
 assert.deepEqual(plan.items.map(x=>x.number),[1,2,3,4]);
 assert.equal(plan.estimated_minutes,90);
 assert.equal(records[3].completed,false);
});
test("strict time budgets reject unknown durations and never round up a budget",()=>{
 const {path,records,revision}=fixture();
 assert.deepEqual(STUDY_FOCUS_BUDGETS,[15,30,60,120]);
 for(const bad of [-1,0,2,45,"30",null,Infinity]){
  assert.throws(()=>planStudyFocusSession(path,records,revision,"2026-11-24",bad),/focus budget/);
 }
 const short=planStudyFocusSession(path,records,revision,"2026-11-24",15);
 assert.ok(short.estimated_minutes<=15);
});
test("exported focus checklist contains no private learner answers, notes or confidence",()=>{
 const {path,records,revision}=fixture();
 const checklist=buildStudyFocusChecklist(path,records,revision,"2026-11-24",60);
 assert.match(checklist,/\[ \] Lesson 1: Lesson 1/);
 assert.match(checklist,/2026-11-23 UTC/);
 for(const term of ["SECRET_ACT","SECRET_REFLECTION","SECRET_NOTE","needs_practice"]){
  assert.equal(checklist.includes(term),false,term);
 }
 assert.equal(checklist,buildStudyFocusChecklist(path,records,revision,"2026-11-24",60));
});
test("focus plan validates the saved session and rejects fake review dates",()=>{
 const {path,records,revision}=fixture();
 assert.throws(()=>planStudyFocusSession(path,records,revision,"2026-02-30",30),/Invalid Education agenda date/);
 const changed=changeStudyRecord(path,records,1,"completed",false);
 assert.throws(()=>planStudyFocusSession(path,changed,revision,"2026-11-24",30),/Invalid Education/);
});
