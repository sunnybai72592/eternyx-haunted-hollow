import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {
  EDUCATION_HISTORY_LOCAL_SORTS,EDUCATION_HISTORY_LOCAL_FOCUS,EDUCATION_HISTORY_EXPORT_LIMIT,
  validateEducationHistoryDates,organizeEducationHistoryPage,educationHistorySafeAction,
  educationHistoryResumeFocus,educationHistoryDisplayedSummary,
  buildEducationHistoryPageCsv,
} from "../src/lib/educationHistoryWorkbench.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/pages/EducationHistory.tsx");
const docs=read("docs/EDUCATION_PRIVATE_HISTORY_WORKBENCH.md");
const id=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const owner=id(1),other=id(2);
const rows=[
 {id:id(11),test_id:id(51),user_id:owner,status:"submitted",
  start_time:"2026-11-23T01:00:00Z",end_time:"2026-11-23T02:12:01Z"},
 {id:id(12),test_id:id(52),user_id:owner,status:"in_progress",
  start_time:"2026-11-22T23:55:00Z",end_time:null},
 {id:id(13),test_id:id(53),user_id:owner,status:"auto_submitted",
  start_time:"2026-11-20T12:00:00Z",end_time:"2026-11-20T12:07:00Z"},
 {id:id(14),test_id:id(54),user_id:owner,status:"cheated",
  start_time:null,end_time:null},
];
const titles={
 [id(51)]:"Coating inspection",
 [id(52)]:"Cathodic Protection",
 [id(53)]:"Pipeline survey",
};
const organize=(opts={},source=rows,titleMap=titles)=>organizeEducationHistoryPage(source,titleMap,opts,owner);
test("01 only bounded genuine local review orders exist",()=>{
 assert.deepEqual(EDUCATION_HISTORY_LOCAL_SORTS,["newest","oldest","title"]);
 assert.equal(EDUCATION_HISTORY_EXPORT_LIMIT,20);
});
test("02 local focus options are explicit, not invented grade states",()=>{
 assert.deepEqual(EDUCATION_HISTORY_LOCAL_FOCUS,["all","resume","submitted"]);
});
test("03 blank range is valid and frozen",()=>{
 const r=validateEducationHistoryDates();
 assert.deepEqual(r,{from:"",to:""});
 assert(Object.isFrozen(r));
});
test("04 valid inclusive UTC dates and leap day are accepted",()=>{
 assert.deepEqual(validateEducationHistoryDates("2024-02-29","2026-11-23"),
  {from:"2024-02-29",to:"2026-11-23"});
});
test("05 bad calendar dates are rejected, not silently normalized",()=>{
 for(const d of ["2026-02-29","2026-04-31","2026-00-15","2026-13-02","2026-11-32","2026-1-1","tomorrow"])
  assert.throws(()=>validateEducationHistoryDates(d,""),/Invalid UTC/);
});
test("06 backward UTC ranges fail closed",()=>{
 assert.throws(()=>validateEducationHistoryDates("2026-11-23","2026-11-22"),/Invalid UTC/);
});
test("07 non-UTC-format or non-string date filters cannot bypass validation",()=>{
 assert.throws(()=>validateEducationHistoryDates(null,""),/Invalid/);
 assert.throws(()=>validateEducationHistoryDates("","2026-11-22T00:00:00Z"),/Invalid/);
});
test("08 no filters preserve original server returned order when newest",()=>{
 assert.deepEqual(organize().map(r=>r.id),rows.map(r=>r.id));
});
test("09 single-day UTC range is inclusive of both ends",()=>{
 assert.deepEqual(organize({from:"2026-11-23",to:"2026-11-23"}).map(r=>r.id),[id(11)]);
});
test("10 UTC extraction respects the actual instant not the browser timezone",()=>{
 const input=[{...rows[0],start_time:"2026-11-23T02:30:00+03:00"}];
 assert.deepEqual(organize({from:"2026-11-22",to:"2026-11-22"},input).map(r=>r.id),[id(11)]);
});
test("11 open-ended date lower bound excludes genuinely older attempts",()=>{
 assert.deepEqual(organize({from:"2026-11-22"}).map(r=>r.id),[id(11),id(12)]);
});
test("12 open-ended date upper bound excludes genuinely newer attempts",()=>{
 assert.deepEqual(organize({to:"2026-11-22"}).map(r=>r.id),[id(12),id(13)]);
});
test("13 missing start timestamp cannot falsely match a date filter",()=>{
 assert(!organize({from:"2020-01-01"}).some(r=>r.id===id(14)));
});
test("14 oldest first orders real instants, missing timestamps last",()=>{
 assert.deepEqual(organize({sort:"oldest"}).map(r=>r.id),[id(13),id(12),id(11),id(14)]);
});
test("15 newest first places missing timestamps last",()=>{
 assert.deepEqual(organize({sort:"newest"}).map(r=>r.id),[id(11),id(12),id(13),id(14)]);
});
test("16 title sort orders authorized titles and unknown titles last",()=>{
 assert.deepEqual(organize({sort:"title"}).map(r=>r.id),[id(12),id(11),id(13),id(14)]);
});
test("17 title search remains scoped to titles returned by permitted query",()=>{
 assert.deepEqual(organize({search:" cAThOdic "}).map(r=>r.id),[id(12)]);
});
test("18 a restricted/unavailable title is not fabricated as a search match",()=>{
 assert.deepEqual(organize({search:"missing"}),[]);
});
test("19 local focus on resume displays genuine in-progress attempt only",()=>{
 assert.deepEqual(organize({focus:"resume"}).map(r=>r.id),[id(12)]);
});
test("20 local submitted focus includes auto-submitted and flagged submissions",()=>{
 assert.deepEqual(organize({focus:"submitted"}).map(r=>r.id),[id(11),id(13),id(14)]);
});
test("21 search, UTC day and focus combine without requesting new server data",()=>{
 assert.deepEqual(organize({search:"cathodic",from:"2026-11-22",to:"2026-11-22",focus:"resume"}).map(r=>r.id),[id(12)]);
});
test("22 invalid sort, focus and search cannot create unapproved filter states",()=>{
 for(const opts of [{sort:"score"},{focus:"passed"},{search:null}])
  assert.throws(()=>organize(opts),/Invalid/);
});
test("23 organizing never mutates order of original server-returned rows",()=>{
 const before=rows.map(r=>r.id);
 organize({sort:"oldest"});
 assert.deepEqual(rows.map(r=>r.id),before);
});
test("24 a foreign user's answer record causes a fail-closed projection error",()=>{
 assert.throws(()=>organize({},[{...rows[0],user_id:other}]),/outside the authenticated account/);
});
test("25 malformed owner/attempt IDs cannot be projected",()=>{
 assert.throws(()=>organize({},[{...rows[0],id:"invalid"}]),/outside/);
 assert.throws(()=>organizeEducationHistoryPage([],{}, {}, "invalid"),/authenticated history page/);
});
test("26 more than one 20-item server page cannot be accidentally processed at once",()=>{
 const tooMany=Array.from({length:21},(_,i)=>({...rows[0],id:id(100+i)}));
 assert.throws(()=>organize({},tooMany),/one authenticated history page/);
});
test("27 visible status counts include only filtered returned rows",()=>{
 assert.deepEqual(educationHistoryDisplayedSummary(organize({focus:"submitted"}),owner),
  {visible:3,inProgress:0,submitted:2,flagged:1});
});
test("28 in-progress visible counts are not re-labeled successful grades",()=>{
 assert.deepEqual(educationHistoryDisplayedSummary(organize({focus:"resume"}),owner),
  {visible:1,inProgress:1,submitted:0,flagged:0});
});
test("29 empty visible summary is genuine zero, not fabricated from history total",()=>{
 assert.deepEqual(educationHistoryDisplayedSummary([],owner),
  {visible:0,inProgress:0,submitted:0,flagged:0});
});
test("30 status summaries are immutable",()=>{
 assert(Object.isFrozen(educationHistoryDisplayedSummary(rows,owner)));
});
test("31 unique in-progress attempts get real secured resume links",()=>{
 assert.deepEqual(educationHistoryResumeFocus(rows,owner),[{
  attemptId:id(12),testId:id(52),path:"/test/"+id(52),
 }]);
});
test("32 submitted records do not become resumable",()=>{
 assert.deepEqual(educationHistoryResumeFocus(organize({focus:"submitted"}),owner),[]);
});
test("33 competing attempts for same test block resume even when one is submitted",()=>{
 const conflict=[rows[1],{...rows[0],test_id:rows[1].test_id}];
 assert.deepEqual(educationHistoryResumeFocus(conflict,owner),[]);
 assert.equal(educationHistorySafeAction(rows[1],conflict,owner).path,null);
});
test("34 duplicate in-progress attempts for one exam never pick a last-row winner",()=>{
 const conflict=[rows[1],{...rows[1],id:id(20)}];
 assert.deepEqual(educationHistoryResumeFocus(conflict,owner),[]);
 assert.equal(educationHistorySafeAction(rows[1],conflict,owner).status,"unavailable");
});
test("35 conflicting statuses for a single same-ID attempt fail closed",()=>{
 const conflict=[rows[1],{...rows[1],status:"submitted"}];
 assert.equal(educationHistorySafeAction(rows[1],conflict,owner).path,null);
});
test("36 completed attempt results still link specifically to its own ID",()=>{
 assert.equal(educationHistorySafeAction(rows[0],rows,owner).path,"/test-results/"+id(11));
});
test("37 unsafe or foreign focus records never generate navigation",()=>{
 assert.throws(()=>educationHistoryResumeFocus([{...rows[1],user_id:other}],owner),/outside/);
 for(const limit of [0,11,1.5,-1])
  assert.throws(()=>educationHistoryResumeFocus(rows,owner,limit),/limit/);
});
test("38 CSV exports only the shown records with a true source page label",()=>{
 const csv=buildEducationHistoryPageCsv(organize({search:"cathodic"}),titles,owner,{
  page:2,filters:"Only current page",
 });
 assert(csv.startsWith("\uFEFF"));
 assert(csv.includes("Cathodic Protection"));
 assert(csv.includes('"3"'));
 assert(!csv.includes(id(11)));
 assert(!csv.includes(id(13)));
});
test("39 CSV contains only approved fields and no scores or private answers",()=>{
 const privateRow={...rows[0],score:50,max_score:60,secretAnswerKey:"NEVER_EXPORT",
  reviewer_notes:"TEACHER_ONLY",user_email:"secret@example.com"};
 const csv=buildEducationHistoryPageCsv([privateRow],titles,owner);
 assert(!csv.includes("NEVER_EXPORT"));
 assert(!csv.includes("TEACHER_ONLY"));
 assert(!csv.includes("secret@example.com"));
 assert(!csv.includes('"50"'));
 assert(!csv.includes('"60"'));
 assert(csv.includes("Attempt status"));
});
test("40 CSV protects formulas and quotes in uncontrolled assessment titles",()=>{
 const csv=buildEducationHistoryPageCsv([rows[0]],{[id(51)]:'=HYPERLINK("evil")'},owner);
 assert(csv.includes("'=HYPERLINK"));
 assert(csv.includes('""evil""'));
 assert(!csv.includes('"=HYPERLINK'));
});
test("41 incomplete or RLS-hidden titles stay unavailable rather than guessed",()=>{
 const csv=buildEducationHistoryPageCsv([rows[3]],{},owner);
 assert(csv.includes("Assessment title unavailable"));
});
test("42 CSV duration uses genuine UTC start/end while missing times stay blank",()=>{
 const csv=buildEducationHistoryPageCsv([rows[0],rows[3]],titles,owner);
 assert(csv.includes('"4321"'));
 assert(csv.includes('"submitted"'));
 assert(csv.includes('"cheated"'));
 assert(csv.includes("Not recorded")===false);
});
test("43 invalid or reversed timestamps never invent elapsed duration",()=>{
 const csv=buildEducationHistoryPageCsv([{...rows[0],end_time:"2026-11-22T00:00:00Z"}],titles,owner);
 assert(!csv.includes('"4321"'));
 assert(csv.includes('""'));
});
test("44 CSV rejects mixed-owner attempts rather than producing a partial export",()=>{
 assert.throws(()=>buildEducationHistoryPageCsv([rows[0],{...rows[1],user_id:other}],titles,owner),/outside/);
});
test("45 CSV rejects more than one server page, invalid owner, or invalid pagination",()=>{
 const tooMany=Array.from({length:21},(_,i)=>({...rows[0],id:id(100+i)}));
 assert.throws(()=>buildEducationHistoryPageCsv(tooMany,titles,owner),/one authenticated/);
 assert.throws(()=>buildEducationHistoryPageCsv([rows[0]],titles,"bad"),/authenticated/);
 assert.throws(()=>buildEducationHistoryPageCsv([rows[0]],titles,owner,{page:-1}),/Invalid history export/);
});
test("46 CSV never silently exceeds the strict page and export-context bounds",()=>{
 assert.throws(()=>buildEducationHistoryPageCsv(rows,titles,owner,{filters:"x".repeat(181)}),/export context/);
});
test("47 page export is user-initiated, private, and no new backend call",()=>{
 assert.match(ui,/buildEducationHistoryPageCsv\(shown,titles\.data,user!\.id/);
 assert.match(ui,/downloadHistoryCsv\(csv,page\)/);
 assert.match(ui,/Download displayed \(\.csv\)/);
 assert.match(ui,/new Blob\(\[csv\]/);
});
test("48 original owner scoped pagination, counts and server status stay unchanged",()=>{
 assert.match(ui,/queryKey:\["education-private-history",user\?\.id,page,status\]/);
 assert.match(ui,/\.eq\("user_id",user\.id\)/);
 assert.match(ui,/educationHistoryRange\(page\)/);
 assert.match(ui,/educationHistoryFilter\(status\)/);
 assert.match(ui,/\.range\(start,end\)/);
 assert.match(ui,/\.select\("id,test_id,user_id,status,start_time,end_time",\{count:"exact"\}\)/);
});
test("49 title reads still use permitted tests RLS, not a fake answer lookup",()=>{
 assert.match(ui,/\.from\("tests"\)\.select\("id,title"\)\.in\("id",ids\)/);
 assert.doesNotMatch(ui,/\.from\("user_answers"\)|\\.from\("education_final_grades"\)/);
});
test("50 UI has accessible UTC dates, focus and page-bounded sorting",()=>{
 for(const input of ["history-from-utc","history-to-utc","history-local-sort","history-local-focus"])
  assert(ui.includes('id="'+input+'"'));
 assert.match(ui,/Date, title search, focus and sorting operate only/);
 assert.match(ui,/Dates use UTC/);
});
test("51 user-switch clears private filter and export state before paint",()=>{
 assert.match(ui,/useLayoutEffect\(\(\)=>\{/);
 assert.match(ui,/if\(accountScope!==\(user\?\.id\?\?null\)\)/);
 assert.match(ui,/setFromDate\(""\);setToDate\(""\);setSort\("newest"\);setFocus\("all"\);setExportError\(""\)/);
 assert.match(ui,/accountScope!==user\?\.id/);
});
test("52 no private page projection before authenticated owner scope exists",()=>{
 assert.match(ui,/!active\|\|accountScope!==user\?\.id\|\|!dateRangeValid\?\[\]/);
 assert.match(ui,/active&&accountScope===user\?\.id/);
});
test("53 missing title or invalid date yields explicit status instead of success",()=>{
 assert.match(ui,/Some assessment titles are restricted or unavailable/);
 assert.match(ui,/This UTC date range is invalid/);
 assert.match(ui,/No titles on this page match your search or other page filters/);
});
test("54 actual queued exam navigation still uses validated owner actions",()=>{
 assert.match(ui,/educationHistorySafeAction\(attempt,history\.data\.items,user!\.id\)/);
 assert.match(ui,/educationHistoryResumeFocus\(/);
 assert.match(ui,/The assessment service rechecks ownership and deadlines/);
});
test("55 CSV export never runs while page missing or title read is pending",()=>{
 assert.match(ui,/!history\.isSuccess/);
 assert.match(ui,/ids\.length>0&&titles\.isPending/);
 assert.match(ui,/!shown\.length/);
});
test("56 existing navigation retains exact paginated 20 items per page",()=>{
 assert.match(ui,/Up to \{EDUCATION_HISTORY_PAGE_SIZE\} attempts per page/);
 assert.match(ui,/educationHistoryHasNext\(page,history\.data\?\.count\?\?null,history\.data\?\.items\.length\?\?0\)/);
});
test("57 no new grade claims, invisible scoring or employer/instructor secrets",()=>{
 assert.doesNotMatch(ui,/passing_score|percentile|XP\s*\+|is_correct|points_awarded/);
 assert.match(ui,/No answers, scores, grades or certificates are included/);
 assert.match(docs,/NOT DEPLOYED/);
 assert.match(docs,/server-side/i);
});
test("58 page still parses cleanly as TSX with enhanced controls",()=>{
 const ast=ts.createSourceFile("EducationHistory.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
