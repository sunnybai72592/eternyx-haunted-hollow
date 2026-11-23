import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  WRITTEN_REVIEW_FILTERS,WRITTEN_REVIEW_SORTS,writtenReviewState,
  summarizeWrittenReviewQueue,writtenReviewAssessments,filterWrittenReviewQueue,
  checkWrittenReviewDraft,isWrittenReviewDraftChanged,pendingWrittenReviewChanges,
  sanitizeWrittenReviewDrafts,writtenReviewDate,
} from "../src/lib/educationWrittenReviewWorkbench.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/components/education/EducationWrittenReviewPanel.tsx");
const guide=read("docs/EDUCATION_WRITTEN_REVIEW_WORKBENCH.md");
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const rows=[
 {answer_id:uuid(1),test_id:uuid(10),test_title:"Cathodic Protection",question_text:"Explain polarization",response_text:"Current reduces the potential",points_possible:5,reviewed_points:null,reviewed_at:null},
 {answer_id:uuid(2),test_id:uuid(20),test_title:"Coating Inspection",question_text:"Describe DFT",response_text:"Film thickness when dry",points_possible:3,reviewed_points:2,reviewed_at:"2026-11-22T10:00:00Z"},
 {answer_id:uuid(3),test_id:uuid(10),test_title:"Cathodic Protection",question_text:"Define corrosion",response_text:"Electrochemical reaction",points_possible:4,reviewed_points:0,reviewed_at:"2026-11-22T09:00:00Z"},
 {answer_id:uuid(4),test_id:uuid(20),test_title:"Coating Inspection",question_text:"Holiday detection",response_text:"Detect discontinuities",points_possible:3,reviewed_points:null,reviewed_at:null},
];
test("01 real pending points are recognized as pending",()=>{
 assert.equal(writtenReviewState(rows[0]),"pending");
});
test("02 integer zero is a genuinely reviewed mark, never pending",()=>{
 assert.equal(writtenReviewState(rows[2]),"reviewed");
});
test("03 partial points reviewed is recognized",()=>{
 assert.equal(writtenReviewState(rows[1]),"reviewed");
});
test("04 invalid/out-of-range rows fail closed",()=>{
 for(const x of [null,{}, {reviewed_points:-1,points_possible:5},
  {reviewed_points:6,points_possible:5},
  {reviewed_points:1.5,points_possible:5}])assert.equal(writtenReviewState(x),"unavailable");
});
test("05 counts represent only the server-returned queue",()=>{
 assert.deepEqual(summarizeWrittenReviewQueue(rows),{returned:4,pending:2,reviewed:2,unavailable:0});
});
test("06 unavailable records never silently become reviewed",()=>{
 assert.deepEqual(summarizeWrittenReviewQueue([{reviewed_points:11,points_possible:5}]),
  {returned:1,pending:0,reviewed:0,unavailable:1});
});
test("07 empty/unavailable count is real zero",()=>{
 assert.deepEqual(summarizeWrittenReviewQueue(null),
  {returned:0,pending:0,reviewed:0,unavailable:0});
});
test("08 summaries cannot be mutated by UI",()=>{
 assert(Object.isFrozen(summarizeWrittenReviewQueue(rows)));
});
test("09 assessment selector deduplicates real test IDs",()=>{
 assert.deepEqual(writtenReviewAssessments(rows),[
  {id:uuid(10),title:"Cathodic Protection"},
  {id:uuid(20),title:"Coating Inspection"},
 ]);
});
test("10 missing title is not fabricated as an assessment",()=>{
 assert.deepEqual(writtenReviewAssessments([{}]),[]);
});
test("11 pending filter shows exactly real unmarked rows",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows).map(x=>x.answer_id),[uuid(1),uuid(4)]);
});
test("12 reviewed filter includes zero-point scores",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"reviewed"}).map(x=>x.answer_id),
  [uuid(2),uuid(3)]);
});
test("13 all filter returns all authorized, valid rows",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all"}),rows);
});
test("14 title search is case-insensitive and trims whitespace",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",search:"  coaTING "}).map(x=>x.answer_id),
  [uuid(2),uuid(4)]);
});
test("15 question search operates only on returned questions",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",search:"holiday"}),[rows[3]]);
});
test("16 written-response content search stays local to returned row collection",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",search:"current reduces"}),[rows[0]]);
});
test("17 an unknown search term yields empty without fake matches",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",search:"nonexistent"}),[]);
});
test("18 assessment ID filtering uses actual exact ID, not display title",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",assessment:uuid(10)}),
  [rows[0],rows[2]]);
});
test("19 combining pending, assessment and text preserves all constraints",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{
  filter:"pending",assessment:uuid(20),search:"holiday",
 }),[rows[3]]);
});
test("20 original server ordering remains default",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",sort:"returned"}),rows);
});
test("21 alphabetical sort groups returned assessments without altering source rows",()=>{
 const source=[...rows];
 const result=filterWrittenReviewQueue(rows,{filter:"all",sort:"assessment"});
 assert.deepEqual(result.map(x=>x.answer_id),[uuid(3),uuid(1),uuid(2),uuid(4)]);
 assert.deepEqual(rows,source);
});
test("22 most recently reviewed sorts by actual timestamps, unmarked last",()=>{
 assert.deepEqual(filterWrittenReviewQueue(rows,{filter:"all",sort:"reviewed_recent"})
  .map(x=>x.answer_id),[uuid(2),uuid(3),uuid(1),uuid(4)]);
});
test("23 invalid queue filter and sort mode cannot trigger invented selection",()=>{
 assert.deepEqual(WRITTEN_REVIEW_FILTERS,["pending","reviewed","all"]);
 assert.deepEqual(WRITTEN_REVIEW_SORTS,["returned","assessment","reviewed_recent"]);
 for(const options of [{filter:"graded"},{sort:"byMark"},{assessment:5},{search:null}])
  assert.throws(()=>filterWrittenReviewQueue(rows,options),/Invalid/);
});
test("24 malformed queue is rejected before counting or navigation",()=>{
 assert.throws(()=>filterWrittenReviewQueue(null),/Invalid/);
});
test("25 zero is valid provisional mark within permitted bounds",()=>{
 assert.deepEqual(checkWrittenReviewDraft("0",5,null),{
  valid:true,points:0,changed:true,error:null,
 });
});
test("26 an unchanged recorded mark cannot produce another remote write",()=>{
 assert.deepEqual(checkWrittenReviewDraft("2",5,2),{
  valid:true,points:2,changed:false,error:null,
 });
});
test("27 changed reviewed mark is valid only within the question maximum",()=>{
 assert.equal(checkWrittenReviewDraft("4",5,2).valid,true);
 assert.equal(checkWrittenReviewDraft("6",5,2).valid,false);
});
test("28 negatives, decimals, whitespace and exponents never become whole marks",()=>{
 for(const value of ["-1","+1","2.4"," 2","2 ","2e0","",null,undefined,"0002"]){
  assert.equal(checkWrittenReviewDraft(value,5,null).valid,false,String(value));
 }
});
test("29 mark rules reject invalid server ranges and previous values",()=>{
 for(const args of [["1",0,null],["2",1001,null],["2",5,7],["2",5,-1]]){
  assert.equal(checkWrittenReviewDraft(...args).valid,false);
 }
});
test("30 maximum official provisional whole mark 1000 remains allowed",()=>{
 assert.equal(checkWrittenReviewDraft("1000",1000,null).points,1000);
});
test("31 untyped and unchanged draft markers are not called unsaved changes",()=>{
 assert.equal(isWrittenReviewDraftChanged(undefined,null),false);
 assert.equal(isWrittenReviewDraftChanged("2",2),false);
 assert.equal(isWrittenReviewDraftChanged("",null),false);
 assert.equal(isWrittenReviewDraftChanged("0",null),true);
});
test("32 dirty state reports only returned answer IDs",()=>{
 const drafts={[uuid(1)]:"3",[uuid(2)]:"2",[uuid(3)]:"0",[uuid(4)]:"1",
  [uuid(99)]:"4"};
 assert.equal(pendingWrittenReviewChanges(rows,drafts),2);
});
test("33 draft cleanup drops deleted/foreign and already saved records",()=>{
 const drafts={[uuid(1)]:"3",[uuid(2)]:"2",[uuid(3)]:"0",[uuid(99)]:"4"};
 const result=sanitizeWrittenReviewDrafts(rows,drafts);
 assert.deepEqual(Object.keys(result),[uuid(1)]);
 assert.equal(result[uuid(1)],"3");
});
test("34 draft cleanup preserves a still unsaved locally typed mark",()=>{
 const result=sanitizeWrittenReviewDrafts(rows,{[uuid(4)]:"0"});
 assert.equal(result[uuid(4)],"0");
});
test("35 oversized values are not retained as local drafts",()=>{
 assert.deepEqual(Object.keys(sanitizeWrittenReviewDrafts(rows,{[uuid(1)]:"123456"})),[]);
});
test("36 real review timestamps format, invalid date never fabricated",()=>{
 assert.notEqual(writtenReviewDate(rows[1].reviewed_at),"Not recorded");
 assert.equal(writtenReviewDate("not a date"),"Not recorded");
 assert.equal(writtenReviewDate(null),"Not recorded");
});
test("37 UI keeps trusted RPC queue and server-confirmed provisional write",()=>{
 assert.match(ui,/queryFn: getWrittenReviewQueue/);
 assert.match(ui,/await saveWrittenReview\(answerId, checked\.points!\)/);
 assert.match(ui,/Official grade remains pending/);
});
test("38 UI shows truthful count of returned records and zero score reviews",()=>{
 assert.match(ui,/summarizeWrittenReviewQueue\(query\.data \?\? \[\]\)/);
 assert.match(ui,/pendingCount = totals\.pending/);
 assert.match(ui,/reviewedCount = totals\.reviewed/);
});
test("39 UI search and live assessment filter never request a new service",()=>{
 assert.match(ui,/id="written-review-search"/);
 assert.match(ui,/id="written-review-assessment"/);
 assert.match(ui,/filterWrittenReviewQueue\(query\.data \?\? \[\], \{/);
 assert.match(ui,/Search returned responses/);
});
test("40 UI allows authored queue sort and manual refresh",()=>{
 assert.match(ui,/id="written-review-sort"/);
 assert.match(ui,/Recently reviewed first/);
 assert.match(ui,/Refresh reviews/);
 assert.match(ui,/query\.refetch\(\)/);
});
test("41 mark inputs are constrained by real returned question maximum",()=>{
 assert.match(ui,/checkWrittenReviewDraft\(raw, entry\.points_possible, entry\.reviewed_points\)/);
 assert.match(ui,/max=\{entry\.points_possible\}/);
 assert.match(ui,/Discard local mark/);
});
test("42 saving an unchanged already-reviewed answer is disabled",()=>{
 assert.match(ui,/!validation\.changed \|\| !changed/);
 assert.match(ui,/This provisional mark is unchanged/);
});
test("43 edited reviewed marks require explicit replacement confirmation",()=>{
 assert.match(ui,/window\.confirm\("Replace this provisional written-review mark\?/);
 assert.match(ui,/finalized assessment cannot be regraded/);
});
test("44 stale account RPC completion cannot modify the next user's review UI",()=>{
 assert.match(ui,/useLayoutEffect\(\(\) => \{/);
 assert.match(ui,/requestScopeRef\.current \+= 1/);
 assert.match(ui,/requestScope !== requestScopeRef\.current/);
 assert.match(ui,/setDrafts\(\{\}\)/);
});
test("45 a confirmed review save remains successful despite queue refresh failure",()=>{
 assert.match(ui,/void queryClient\.invalidateQueries\(/);
 assert.match(ui,/Review recorded, but refreshing the queue failed/);
 assert.match(ui,/toast\.success\("Written response review recorded/);
});
test("46 refreshing the queue prunes drafts for no-longer-authorized rows",()=>{
 assert.match(ui,/sanitizeWrittenReviewDrafts\(query\.data, previous\)/);
 assert.match(ui,/Object\.keys\(sanitized\)/);
});
test("47 queue cap is accurately explained and not treated as complete backlog",()=>{
 assert.match(ui,/query\.data\.length === 100/);
 assert.match(ui,/not the full historical backlog/);
 assert.match(guide,/100-response limit/);
});
test("48 authenticated reviewer panel remains gated by existing setting",()=>{
 assert.match(ui,/if \(!writtenReviewEnabled\) return null/);
 assert.doesNotMatch(ui,/service_role|is_correct|award_certificate/);
});
test("49 full panel TSX still parses",()=>{
 const parsed=ts.createSourceFile("EducationWrittenReviewPanel.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
test("50 documentation excludes deployment and fake official grade",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/server-side/);
 assert.match(guide,/production/);
 assert.match(guide,/provisional/);
});
