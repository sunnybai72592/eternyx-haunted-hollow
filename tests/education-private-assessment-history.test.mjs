import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 EDUCATION_HISTORY_PAGE_SIZE,EDUCATION_HISTORY_STATUSES,
 educationHistoryAction,educationHistoryFilter,educationHistoryHasNext,
 educationHistoryPageSummary,educationHistoryRange,educationHistoryStatus,
 filterEducationHistoryPage,normalizeOwnedEducationAttempt,
} from "../src/lib/educationAttemptHistory.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const page=read("src/pages/EducationHistory.tsx");
const hub=read("src/pages/Education.tsx");
const app=read("src/App.tsx");
const results=read("src/pages/TestResults.tsx");
const guide=read("docs/EDUCATION_PRIVATE_ASSESSMENT_HISTORY.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const owner=id(1),other=id(2),testId=id(3),attemptId=id(4);
const attempt=(status="submitted")=>({
 id:attemptId,test_id:testId,user_id:owner,status,
 start_time:"2026-11-22T10:00:00Z",
 end_time:"2026-11-22T10:20:00Z",
 score:999,max_score:1000,secret:"must never appear",
});
test("1. history page size is capped at 20 records",()=>{
 assert.equal(EDUCATION_HISTORY_PAGE_SIZE,20);
 assert.equal(educationHistoryRange(0).start,0);
 assert.equal(educationHistoryRange(0).end,19);
});
test("2. advancing pages uses nonoverlapping exact server ranges",()=>{
 assert.deepEqual(educationHistoryRange(1),{start:20,end:39});
 assert.deepEqual(educationHistoryRange(12),{start:240,end:259});
});
test("3. invalid, huge and fractional server offsets are rejected",()=>{
 for(const value of [-1,1.5,NaN,Infinity,10001,null,"1",undefined]){
  assert.throws(()=>educationHistoryRange(value),/Invalid/);
 }
});
test("4. history filter supports only audited modes",()=>{
 assert.deepEqual(EDUCATION_HISTORY_STATUSES,["all","in_progress","completed"]);
 assert.equal(educationHistoryFilter("all"),null);
 assert.deepEqual(educationHistoryFilter("in_progress"),["in_progress"]);
 assert.deepEqual(educationHistoryFilter("completed"),["submitted","auto_submitted","cheated"]);
});
test("5. unknown API filter inputs are rejected before a query executes",()=>{
 for(const x of ["deleted","graded","score",null,{},undefined])
  assert.throws(()=>educationHistoryFilter(x),/Invalid/);
});
test("6. owned attempt normalization strips score, answers and all unknown fields",()=>{
 const a=normalizeOwnedEducationAttempt(attempt(),owner);
 assert.deepEqual(a,{
  id:attemptId,test_id:testId,user_id:owner,status:"submitted",
  start_time:"2026-11-22T10:00:00Z",end_time:"2026-11-22T10:20:00Z",
 });
 assert(!("score" in a)&&!("secret" in a)&&!("max_score" in a));
 assert(Object.isFrozen(a));
});
test("7. foreign-account attempt rows fail owner validation",()=>{
 assert.equal(normalizeOwnedEducationAttempt(attempt(),other),null);
});
test("8. malformed or absent account/attempt/test identifiers fail closed",()=>{
 for(const key of ["id","test_id","user_id"]){
  for(const value of ["bad",null,undefined]){
   assert.equal(normalizeOwnedEducationAttempt({...attempt(),[key]:value},owner),null);
  }
 }
 assert.equal(normalizeOwnedEducationAttempt(attempt(),"bad"),null);
 assert.equal(normalizeOwnedEducationAttempt(null,owner),null);
});
test("9. unknown states are not relabeled as completed",()=>{
 for(const state of ["graded","expired","unknown",null,undefined]){
  assert.equal(normalizeOwnedEducationAttempt(attempt(state),owner),null);
 }
});
test("10. nullable/invalid timestamps are not shown as fabricated dates",()=>{
 const a=normalizeOwnedEducationAttempt({...attempt(),start_time:"bad",end_time:null},owner);
 assert.equal(a.start_time,null);assert.equal(a.end_time,null);
});
test("11. all real submission states have truthful labels",()=>{
 assert.equal(educationHistoryStatus("in_progress"),"In progress");
 assert.equal(educationHistoryStatus("submitted"),"Submitted");
 assert.equal(educationHistoryStatus("auto_submitted"),"Automatically submitted");
 assert.equal(educationHistoryStatus("cheated"),"Submitted — flagged");
 assert.equal(educationHistoryStatus("future-state"),"Unavailable");
});
test("12. in-progress history action resumes existing exam",()=>{
 const row=normalizeOwnedEducationAttempt(attempt("in_progress"),owner);
 assert.deepEqual(educationHistoryAction(row,owner),{
  label:"Continue assessment",path:"/test/"+testId,status:"in_progress",
 });
});
test("13. completed/auto-submitted/flagged history opens owned results",()=>{
 for(const status of ["submitted","auto_submitted","cheated"]){
  const row=normalizeOwnedEducationAttempt(attempt(status),owner);
  assert.equal(educationHistoryAction(row,owner).path,"/test-results/"+attemptId);
 }
});
test("14. private attempt history cannot create foreign-account routes",()=>{
 const row=normalizeOwnedEducationAttempt(attempt(),owner);
 assert.equal(educationHistoryAction(row,other).path,null);
 assert.equal(educationHistoryAction(null,owner).path,null);
});
test("15. search operates only on titles returned by the read-permitted test query",()=>{
 const rows=[
  normalizeOwnedEducationAttempt(attempt(),owner),
  normalizeOwnedEducationAttempt({...attempt(),id:id(5),test_id:id(6)},owner),
 ];
 const titles={[testId]:"Corrosion Fundamentals",[id(6)]:"Cathodic Protection"};
 assert.deepEqual(filterEducationHistoryPage(rows,titles,"  corrosion  "),[rows[0]]);
 assert.deepEqual(filterEducationHistoryPage(rows,titles,"cAtHoDiC"),[rows[1]]);
});
test("16. missing or blocked titles do not become fabricated search results",()=>{
 const rows=[normalizeOwnedEducationAttempt(attempt(),owner)];
 assert.deepEqual(filterEducationHistoryPage(rows,{},"corrosion"),[]);
 assert.deepEqual(filterEducationHistoryPage(rows,null,"corrosion"),[]);
 assert.deepEqual(filterEducationHistoryPage(rows,{},""),rows);
});
test("17. page counters use actual returned statuses, not imaginary grades",()=>{
 assert.deepEqual(educationHistoryPageSummary([
  {status:"in_progress"},{status:"submitted"},{status:"auto_submitted"},
  {status:"cheated"},{status:"unknown"},
 ]),{inProgress:1,submitted:2,flagged:1});
});
test("18. exact count decides whether there is a next page",()=>{
 assert.equal(educationHistoryHasNext(0,20,20),false);
 assert.equal(educationHistoryHasNext(0,21,20),true);
 assert.equal(educationHistoryHasNext(1,40,20),false);
 assert.equal(educationHistoryHasNext(1,41,20),true);
 assert.equal(educationHistoryHasNext(0,0,0),false);
});
test("19. missing server count uses only a completely filled page as a hint",()=>{
 assert.equal(educationHistoryHasNext(0,null,20),true);
 assert.equal(educationHistoryHasNext(0,null,19),false);
 assert.equal(educationHistoryHasNext(-1,null,20),false);
});
test("20. protected route is wrapped in the established RequireAuth guard",()=>{
 assert.match(app,/const EducationHistory = lazy\(\(\) => import\("\.\/pages\/EducationHistory"\)\)/);
 assert.match(app,/path="\/education\/history" element=\{<RequireAuth><EducationHistory \/><\/RequireAuth>\}/);
});
test("21. history query is keyed and filtered by real authenticated owner",()=>{
 assert.match(page,/queryKey:\["education-private-history",user\?\.id,page,status\]/);
 assert.match(page,/\.eq\("user_id",user\.id\)/);
 assert.match(page,/normalizeOwnedEducationAttempt\(row,user\.id\)/);
 assert.match(page,/if\(valid\.some\(row=>row===null\)\)throw/);
});
test("22. server pagination and status allowlists prevent unbounded record load",()=>{
 assert.match(page,/educationHistoryRange\(page\)/);
 assert.match(page,/educationHistoryFilter\(status\)/);
 assert.match(page,/\.range\(start,end\)/);
 assert.match(page,/\.order\("start_time",\{ascending:false\}\)/);
 assert.match(page,/\.order\("id",\{ascending:false\}\)/);
});
test("23. record fetch never asks for score, answer text or private grade ledger",()=>{
 assert.match(page,/\.select\("id,test_id,user_id,status,start_time,end_time",\{count:"exact"\}\)/);
 assert.doesNotMatch(page,/\.from\("education_final_grades"\)|\.from\("user_answers"\)/);
 assert.match(page,/This page never displays unverified scores/);
});
test("24. titles are fetched separately under RLS and can remain unavailable",()=>{
 assert.match(page,/\.from\("tests"\)\.select\("id,title"\)\.in\("id",ids\)/);
 assert.match(page,/Assessment title unavailable/);
 assert.match(page,/Some assessment titles are restricted or unavailable/);
});
test("25. history supports manual retry and refresh with explicit error states",()=>{
 assert.match(page,/Retry history/);
 assert.match(page,/Refresh history/);
 assert.match(page,/void history\.refetch\(\)/);
 assert.match(page,/if\(ids\.length\)void titles\.refetch\(\)/);
});
test("26. history provides status and page-only title filters, never fake global search",()=>{
 assert.match(page,/Find a title on this page/);
 assert.match(page,/No titles on this page match your search/);
 assert.match(page,/Up to \{EDUCATION_HISTORY_PAGE_SIZE\} attempts per page/);
 assert.match(page,/educationHistoryHasNext\(page,history\.data\?\.count\?\?null,history\.data\?\.items\.length\?\?0\)/);
});
test("27. failed grade verification cannot invent a passed exam in the history",()=>{
 assert.doesNotMatch(page,/percentile|XP\s*\+|passing_score|score\s*\/\s*max_score|verifiedQuery/);
 assert.match(page,/History entries are not certificates/);
});
test("28. account change resets page, search and previous-user state",()=>{
 assert.match(page,/if\(accountScope!==\(user\?\.id\?\?null\)\)/);
 assert.match(page,/setAccountScope\(user\?\.id\?\?null\);setPage\(0\);setStatus\("all"\);setSearch\(""\)/);
 assert.match(page,/enabled:active&&accountScope===user\?\.id/);
});
test("29. Education hub and results page both link to the private history",()=>{
 assert.match(hub,/to="\/education\/history">Open my assessments/);
 assert.match(results,/to="\/education\/history">My assessments/);
});
test("30. documentation preserves staging, owner-only, server-authority boundaries",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/RLS/i);
 assert.match(guide,/production/i);
 assert.match(guide,/no numeric grades/i);
 assert.match(guide,/server-side/i);
});
