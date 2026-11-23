import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {educationAttemptNavigation} from "../src/lib/educationAttemptNavigation.mjs";
import {
  EDUCATION_CATALOG_PROGRESS_FILTERS,indexEducationOwnedAttempts,
  countEducationCatalogProgress,filterEducationCatalogProgress,
  prioritizeEducationCatalog,continueEducationCatalogItems,
} from "../src/lib/educationCatalogProgress.mjs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const ui=read("src/pages/Education.tsx");
const guide=read("docs/EDUCATION_LEARNER_ASSESSMENT_DASHBOARD.md");
const uuid=n=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const owner=uuid(1),other=uuid(2);
const testIds=[uuid(11),uuid(12),uuid(13),uuid(14)];
const attempts=[
 {id:uuid(21),test_id:testIds[0],user_id:owner,status:"in_progress"},
 {id:uuid(22),test_id:testIds[2],user_id:owner,status:"submitted"},
];
const tests=[
 {id:testIds[2],title:"Coating practical",duration_minutes:40},
 {id:testIds[1],title:"Cathodic protection",duration_minutes:30},
 {id:testIds[0],title:"Pipeline inspection",duration_minutes:20},
 {id:testIds[3],title:"Corrosion theory",duration_minutes:25},
];
const built=()=>indexEducationOwnedAttempts(attempts,owner).byTest;
test("01 the progress filters contain only four actionable states plus all",()=>{
 assert.deepEqual(EDUCATION_CATALOG_PROGRESS_FILTERS,
 ["all","in_progress","available","submitted","unavailable"]);
});
test("02 a genuine owner index preserves exact server-returned attempt records",()=>{
 const out=indexEducationOwnedAttempts(attempts,owner);
 assert.equal(out.byTest.size,2);
 assert.equal(out.byTest.get(testIds[0]).id,uuid(21));
 assert.deepEqual(out.conflictTests,[]);
});
test("03 an empty real attempt list leaves existing tests eligible for fresh start",()=>{
 const out=indexEducationOwnedAttempts([],owner);
 assert.equal(out.byTest.size,0);
 assert.equal(educationAttemptNavigation(testIds[0],out.byTest.get(testIds[0]),true,owner).status,"available");
});
test("04 a different learner's attempt cannot enter this owner index",()=>{
 assert.throws(()=>indexEducationOwnedAttempts([{...attempts[0],user_id:other}],owner),/scope/);
});
test("05 unknown malformed attempt IDs fail closed instead of authorizing a new test",()=>{
 assert.throws(()=>indexEducationOwnedAttempts([{...attempts[0],id:"bad"}],owner),/validation/);
});
test("06 a missing owner or collection never produces a valid index",()=>{
 assert.throws(()=>indexEducationOwnedAttempts(attempts,"bad"),/Authorized/);
 assert.throws(()=>indexEducationOwnedAttempts(null,owner),/Authorized/);
});
test("07 same exact record repeated does not create a phantom conflict",()=>{
 const same=attempts[0];
 const out=indexEducationOwnedAttempts([same,same],owner);
 assert.equal(out.byTest.get(testIds[0]).id,uuid(21));
 assert.deepEqual(out.conflictTests,[]);
});
test("08 two different attempts for one assessment are not arbitrarily selected",()=>{
 const second={...attempts[0],id:uuid(25),status:"submitted"};
 const out=indexEducationOwnedAttempts([attempts[0],second],owner);
 assert.deepEqual(out.conflictTests,[testIds[0]]);
 assert.equal(out.byTest.get(testIds[0]).id,"ambiguous-attempt");
});
test("09 a conflicting test loses start, resume AND results links",()=>{
 const out=indexEducationOwnedAttempts([attempts[0],{...attempts[0],id:uuid(25)}],owner);
 const a=educationAttemptNavigation(testIds[0],out.byTest.get(testIds[0]),true,owner);
 assert.equal(a.path,null);
 assert.equal(a.status,"unavailable");
});
test("10 a third record never clears an existing conflict sentinel",()=>{
 const conflicting=[attempts[0],{...attempts[0],id:uuid(25)},attempts[0]];
 const out=indexEducationOwnedAttempts(conflicting,owner);
 assert.equal(out.byTest.get(testIds[0]).id,"ambiguous-attempt");
 assert.equal(out.conflictTests.length,1);
});
test("11 a changed status for the same ID also creates a conflict",()=>{
 const out=indexEducationOwnedAttempts([attempts[0],{...attempts[0],status:"submitted"}],owner);
 assert.deepEqual(out.conflictTests,[testIds[0]]);
});
test("12 unknown attempt state may be indexed but cannot open a route",()=>{
 const item={...attempts[0],status:"pending_review"};
 const out=indexEducationOwnedAttempts([item],owner);
 assert.equal(educationAttemptNavigation(testIds[0],out.byTest.get(testIds[0]),true,owner).path,null);
});
test("13 owner count is based on actual returned tests, not achievements",()=>{
 assert.deepEqual(countEducationCatalogProgress(tests,built(),true,owner),{
  total:4,in_progress:1,available:2,submitted:1,unavailable:0,
 });
});
test("14 verification-not-ready state never invents available or completed",()=>{
 assert.deepEqual(countEducationCatalogProgress(tests,built(),false,owner),{
  total:4,in_progress:0,available:0,submitted:0,unavailable:4,
 });
});
test("15 missing or invalid learner ID blocks every catalog action",()=>{
 const result=countEducationCatalogProgress(tests,built(),true,"bad");
 assert.equal(result.available,0);
 assert.equal(result.unavailable,4);
});
test("16 progress summary cannot be mutated by UI code",()=>{
 assert.equal(Object.isFrozen(countEducationCatalogProgress(tests,built(),true,owner)),true);
});
test("17 in-progress filter selects only real unfinished assessments",()=>{
 assert.deepEqual(filterEducationCatalogProgress(tests,built(),true,owner,"in_progress").map(x=>x.id),[testIds[0]]);
});
test("18 available filters never include a previously submitted or in-progress test",()=>{
 assert.deepEqual(filterEducationCatalogProgress(tests,built(),true,owner,"available").map(x=>x.id),
  [testIds[1],testIds[3]]);
});
test("19 completed filter includes only server-submitted states",()=>{
 assert.deepEqual(filterEducationCatalogProgress(tests,built(),true,owner,"submitted").map(x=>x.id),[testIds[2]]);
});
test("20 no status filter shows all authorized catalog tests without changing order",()=>{
 assert.deepEqual(filterEducationCatalogProgress(tests,built(),true,owner,"all"),tests);
});
test("21 fail-closed statuses have their own filter",()=>{
 const index=indexEducationOwnedAttempts([attempts[0],{...attempts[0],id:uuid(25)}],owner);
 assert.deepEqual(filterEducationCatalogProgress(tests,index.byTest,true,owner,"unavailable").map(x=>x.id),[testIds[0]]);
});
test("22 progress filters cannot make unavailable attempt look available",()=>{
 assert.deepEqual(filterEducationCatalogProgress(tests,built(),false,owner,"available"),[]);
});
test("23 unknown filter and malformed input are rejected rather than ignored",()=>{
 for(const filter of ["passed","cheated","starts","not_registered"])
  assert.throws(()=>filterEducationCatalogProgress(tests,built(),true,owner,filter),/Invalid/);
 assert.throws(()=>filterEducationCatalogProgress({},built(),true,owner),/Invalid/);
});
test("24 resume-first sort uses actual server status instead of fake grades",()=>{
 assert.deepEqual(prioritizeEducationCatalog(tests,built(),true,owner).map(x=>x.id),
  [testIds[0],testIds[1],testIds[3],testIds[2]]);
});
test("25 priority sort does not mutate underlying authorized catalog",()=>{
 const oldOrder=tests.map(x=>x.id);
 prioritizeEducationCatalog(tests,built(),true,owner);
 assert.deepEqual(tests.map(x=>x.id),oldOrder);
});
test("26 priority sort puts unknown/conflicting records last",()=>{
 const index=indexEducationOwnedAttempts([attempts[0],{...attempts[0],id:uuid(25)}],owner);
 assert.equal(prioritizeEducationCatalog(tests,index.byTest,true,owner).at(-1).id,testIds[0]);
});
test("27 focus list offers only verified unfinished exams with safe real routes",()=>{
 const list=continueEducationCatalogItems(tests,built(),true,owner);
 assert.deepEqual(list,[{
  id:testIds[0],title:"Pipeline inspection",duration_minutes:20,path:"/test/"+testIds[0],
 }]);
});
test("28 a submitted exam can never enter resume focus",()=>{
 const onlySubmitted=new Map([[testIds[0],{...attempts[0],status:"submitted"}]]);
 assert.deepEqual(continueEducationCatalogItems([tests[2]],onlySubmitted,true,owner),[]);
});
test("29 no resume items appear if ownership or status lookup failed",()=>{
 assert.deepEqual(continueEducationCatalogItems(tests,built(),false,owner),[]);
});
test("30 focus item limit is bounded, and invalid limits fail",()=>{
 const all=tests.map((x,i)=>({id:uuid(30+i),test_id:x.id,user_id:owner,status:"in_progress"}));
 const idx=indexEducationOwnedAttempts(all,owner).byTest;
 assert.equal(continueEducationCatalogItems(tests,idx,true,owner,2).length,2);
 for(const limit of [0,11,-2,1.4]){
  assert.throws(()=>continueEducationCatalogItems(tests,idx,true,owner,limit),/limit/);
 }
});
test("31 every focus item is a read-only projection with no answer keys",()=>{
 const item=continueEducationCatalogItems(tests,built(),true,owner)[0];
 assert(Object.isFrozen(item));
 assert.equal(Object.hasOwn(item,"correctAnswer"),false);
 assert.equal(Object.hasOwn(item,"score"),false);
});
test("32 account list RPC is still scoped to the authenticated user's attempt records",()=>{
 assert.match(ui,/queryKey: \["education-owned-attempt-list", user\?\.id\]/);
 assert.match(ui,/\.eq\("user_id", user!\.id\)/);
 assert.match(ui,/rows\.filter\(row => row\.user_id === user!\.id\)/);
});
test("33 full attempt list is validated before storing into this user's query cache",()=>{
 assert.match(ui,/indexEducationOwnedAttempts\(rows, user!\.id\)/);
 assert.match(ui,/attemptCheckReady/);
 assert.match(ui,/Existing attempts could not be verified/);
});
test("34 existing trusted navigation always controls actual href",()=>{
 assert.match(ui,/educationAttemptNavigation\(test\.id, previous, attemptCheckReady, user\?\.id\)/);
 assert.match(ui,/action\.path/);
});
test("35 learner sees genuine status counters and no fabricated course achievement",()=>{
 assert.match(ui,/countEducationCatalogProgress\(tests, ownedAttemptByTest, attemptCheckReady, user\?\.id\)/);
 assert.match(ui,/Your assessment progress/);
 assert.match(ui,/progress\.in_progress/);
 assert.match(ui,/progress\.submitted/);
 assert.match(ui,/No grades or certificates are inferred/);
});
test("36 learner sees genuine continuation links and one-click focus action",()=>{
 assert.match(ui,/continueEducationCatalogItems\(tests, ownedAttemptByTest, true, user\?\.id\)/);
 assert.match(ui,/Continue where you left off/);
 assert.match(ui,/Show all in-progress assessments/);
 assert.match(ui,/<Link to=\{item\.path\}>/);
});
test("37 learner can filter genuinely by all real assessment status categories",()=>{
 assert.match(ui,/id="education-progress-filter"/);
 assert.match(ui,/value="in_progress">In progress/);
 assert.match(ui,/value="available">Available to start/);
 assert.match(ui,/value="submitted">Submitted/);
 assert.match(ui,/value="unavailable">Needs verification/);
});
test("38 learner can sort by action priority without affecting previous sort options",()=>{
 assert.match(ui,/value="next_action">Resume first/);
 assert.match(ui,/prioritizeEducationCatalog\(narrowed, ownedAttemptByTest/);
 assert.match(ui,/value="newest">Newest first/);
 assert.match(ui,/value="shortest">Shortest duration/);
});
test("39 conflicting records disable the attempt instead of hiding the uncertainty",()=>{
 assert.match(ui,/indexedAttempts\.conflictTests\.length > 0/);
 assert.match(ui,/conflicting attempt records/);
 assert.match(ui,/No attempt was selected arbitrarily/);
});
test("40 changed accounts clear local search/filter before painting new identity",()=>{
 assert.match(ui,/useLayoutEffect\(\(\) => \{/);
 assert.match(ui,/if \(previousUserRef\.current === user\?\.id\) return/);
 assert.match(ui,/setProgressFilter\("all"\)/);
 assert.match(ui,/setSearch\(""\)/);
});
test("41 no unverified filter options appear while atomic CBT service is off",()=>{
 assert.match(ui,/atomicCbtEnabled && <option value="next_action"/);
 assert.match(ui,/atomicCbtEnabled && <div>/);
 assert.match(ui,/disabled=\{!attemptCheckReady\}/);
});
test("42 existing catalog still does not grant instructor role or invent tests",()=>{
 assert.match(ui,/listEnrolledEducationTests\(\)/);
 assert.match(ui,/normalizeEducationTest/);
 assert.match(ui,/Open Question Bank Studio/);
});
test("43 new helper never directly mutates server, grade or private answer data",()=>{
 const helper=read("src/lib/educationCatalogProgress.mjs");
 assert.doesNotMatch(helper,/supabase\.|fetch\(|localStorage\.|sessionStorage\.|is_correct|points_awarded|createClient\(/);
 assert.match(helper,/educationAttemptNavigation/);
});
test("44 existing results continue to honor submitted test paths",()=>{
 assert.equal(educationAttemptNavigation(testIds[2],attempts[1],true,owner).path,
  "/test-results/"+attempts[1].id);
});
test("45 docs are frank about backend rollout, privacy and conflict fail-closed policy",()=>{
 assert.match(guide,/NOT DEPLOYED/);
 assert.match(guide,/server-side/i);
 assert.match(guide,/production/i);
 assert.match(guide,/duplicate-attempt conflict|conflicting attempt/i);
});
test("46 assessment hub TSX still parses as part of the broader test suite",()=>{
 const ast=ts.createSourceFile("Education.tsx",ui,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(ast.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
