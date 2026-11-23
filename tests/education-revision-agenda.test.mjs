import test from "node:test";
import assert from "node:assert/strict";
import {authorStudyPath,emptyStudyRecords,changeStudyRecord} from "../src/lib/educationStudyPaths.mjs";
import {blankStudyRevision,recordStudyManualReview,setStudyRevisionInterval,
  buildStudyJourneySessionJson,parseStudyJourneyFile} from "../src/lib/educationStudyRevision.mjs";
import {buildStudyRevisionAgenda,buildStudyRevisionWeek,
  buildStudyRevisionCalendarIcs} from "../src/lib/educationRevisionAgenda.mjs";

const path=()=>authorStudyPath({title:"Sensitive title",description:"description",
 lessons:[1,2,3].map(n=>({number:n,title:n===1?"Voltage, field; checks":"Lesson "+n,
 objective:"Practice",reading:"Read the exercise text",activity_prompt:"Record activity",
 reflection_prompt:"Reflect on practice",estimated_minutes:10}))});
function fixture(){
 const p=path();let rows=emptyStudyRecords(p);
 for(const n of [1,2,3]){
  rows=changeStudyRecord(p,rows,n,"activity","PRIVATE_ACTIVITY");
  rows=changeStudyRecord(p,rows,n,"reflection","PRIVATE_REFLECTION");
  rows=changeStudyRecord(p,rows,n,"completed",true);
  rows=changeStudyRecord(p,rows,n,"note","PRIVATE_NOTE");
 }
 let rev=blankStudyRevision(p);
 rev=recordStudyManualReview(p,rows,rev,1,"2026-11-19","developing");
 rev=setStudyRevisionInterval(p,rows,rev,2,7);
 rev=recordStudyManualReview(p,rows,rev,2,"2026-11-21","comfortable");
 return {p,rows,rev};
}
test("agenda sorts due before unscheduled and future; excludes incomplete",()=>{
 const {p,rows,rev}=fixture();
 assert.deepEqual(buildStudyRevisionAgenda(p,rows,rev,"2026-11-23").map(x=>x.number),[1,3,2]);
 assert.equal(buildStudyRevisionAgenda(p,rows,rev,"2026-11-23")[0].status,"Overdue");
 const reopened=changeStudyRecord(p,rows,3,"completed",false);
 // An unreviewed lesson may legitimately be reopened without invalid revision history.
 assert.deepEqual(buildStudyRevisionAgenda(p,reopened,rev,"2026-11-23").map(x=>x.number),[1,2]);
 // A reviewed lesson cannot keep its old revision history after reopening.
 const reviewedReopened=changeStudyRecord(p,rows,1,"completed",false);
 assert.throws(()=>buildStudyRevisionAgenda(p,reviewedReopened,rev,"2026-11-23"),
   /Invalid Education/);
});
test("seven-day UTC window includes today and ends at day six",()=>{
 const {p,rows,rev}=fixture();
 const week=buildStudyRevisionWeek(p,rows,rev,"2026-11-23");
 assert.equal(week.length,7);
 assert.equal(week[0].date,"2026-11-23");
 assert.equal(week[6].date,"2026-11-29");
 assert.deepEqual(week[5].lessons.map(x=>x.number),[2]);
 assert.equal(week[0].lessons.length,0);
});
test("ICS calendar is private-data-free, escaped, CRLF-folded and deterministic",()=>{
 const {p,rows,rev}=fixture();
 const first=buildStudyRevisionCalendarIcs(p,rows,rev,"2026-11-23");
 assert.equal(first,buildStudyRevisionCalendarIcs(p,rows,rev,"2026-11-23"));
 assert.match(first,/BEGIN:VCALENDAR\r\nVERSION:2.0/);
 assert.match(first,/DTSTART;VALUE=DATE:20261122/);
 assert.match(first,/DTEND;VALUE=DATE:20261123/);
 assert.match(first,/SUMMARY:Study review: Voltage\\, field\\; checks/);
 assert.equal((first.match(/BEGIN:VEVENT/g)||[]).length,2);
 for(const secret of ["PRIVATE_ACTIVITY","PRIVATE_REFLECTION","PRIVATE_NOTE","developing","comfortable","Sensitive title"]){
  assert.equal(first.includes(secret),false,secret);
 }
 assert.ok(first.split("\r\n").every(line=>new TextEncoder().encode(line).length<=75));
});
test("roundtrip remains v2 and rejects invalid selected dates",()=>{
 const {p,rows,rev}=fixture();
 const data=parseStudyJourneyFile(buildStudyJourneySessionJson(p,rows,rev));
 assert.deepEqual(buildStudyRevisionAgenda(data.path,data.records,data.revision,"2026-11-23"),
  buildStudyRevisionAgenda(p,rows,rev,"2026-11-23"));
 for(const bad of ["2026-02-30","tomorrow","2026-2-3",""]){
  assert.throws(()=>buildStudyRevisionWeek(p,rows,rev,bad),/Invalid Education agenda date/);
 }
});
