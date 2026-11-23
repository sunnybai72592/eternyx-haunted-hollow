import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PRACTICE_CASES,PRACTICE_TRACKS} from "../src/lib/eternyxLabsPractice.mjs";
import {filterPracticeCases,filterPracticeTracks,nextUnfinishedPracticeCase,
  summarizePracticeReview,exportPracticeSession,importPracticeSession,MAX_PRACTICE_IMPORT_BYTES}
  from "../src/lib/eternyxLabsPracticeSession.mjs";

test("actual 90 challenges are searchable and track/status/bookmark filtering is correct",()=>{
  assert.equal(PRACTICE_CASES.length,90);assert.equal(PRACTICE_TRACKS.length,30);
  assert.equal(filterPracticeTracks().length,30);
  assert.equal(filterPracticeCases("subnet",{query:"broadcast"}).length,1);
  assert.deepEqual(filterPracticeTracks({query:"sUbNeT"}).map(t=>t.id),["subnet","ipv6","cidrcheck"]);
  assert.equal(filterPracticeCases("subnet",{status:"done",passedIds:["subnet-network"]}).length,1);
  assert.equal(filterPracticeCases("subnet",{status:"todo",passedIds:["subnet-network"]}).length,2);
  assert.deepEqual(filterPracticeTracks({bookmarksOnly:true,bookmarkedIds:["subnet-network"]}).map(t=>t.id),["subnet"]);
  assert.equal(filterPracticeTracks({status:"todo",passedIds:PRACTICE_CASES.map(c=>c.id)}).length,0);
});
test("filters reject unknown, malformed, repeated and oversized inputs",()=>{
  for(const options of [{status:"verified"},{query:"x".repeat(81)},{bookmarksOnly:"true"},
    {bookmarkedIds:["unknown"]},{passedIds:["subnet-hosts","subnet-hosts"]},null])
    assert.throws(()=>filterPracticeTracks(options));
  assert.throws(()=>filterPracticeCases("__proto__"));
});
test("next unfinished wraps safely and review statistics describe real markers",()=>{
  const ids=PRACTICE_CASES.map(c=>c.id);
  assert.equal(nextUnfinishedPracticeCase(ids[0]),ids[1]);
  assert.equal(nextUnfinishedPracticeCase(ids.at(-1),[ids[1]]),ids[0]);
  assert.equal(nextUnfinishedPracticeCase(ids[0],ids),null);
  assert.equal(nextUnfinishedPracticeCase(ids[0],ids.slice(1,-1)),ids.at(-1));
  assert.throws(()=>nextUnfinishedPracticeCase("nonexistent"));
  const summary=summarizePracticeReview([ids[0]],[ids[0],ids[1]]);
  assert.deepEqual([summary.unfinished,summary.bookmarked,summary.bookmarkedUnfinished],[89,2,1]);
  assert.equal(summary.trusted,false);
});
test("JSON exports only known IDs, in deterministic order, and roundtrips locally",()=>{
  const exported=exportPracticeSession(new Set(["subnet-hosts","subnet-network"]),new Set(["subnet-hosts","subnet-network"]));
  const data=JSON.parse(exported),back=importPracticeSession(exported);
  assert.deepEqual(data.passed,["subnet-network","subnet-hosts"]);
  assert.deepEqual([...back.passed],data.passed);
  assert.deepEqual([...back.bookmarks],data.bookmarks);
  assert.equal(back.serverVerified,false);
  assert.equal(exportPracticeSession(back.passed,back.bookmarks),exported);
});
test("tampered, duplicate, oversized and versioned payloads fail closed",()=>{
  const obj=JSON.parse(exportPracticeSession(["subnet-network"],[]));
  for(const changed of [{...obj,version:2},{...obj,user:"fake"},{...obj,passed:["fake"]},
    {...obj,bookmarks:"wrong"},{...obj,passed:["subnet-network","subnet-network"]}])
    assert.throws(()=>importPracticeSession(JSON.stringify(changed)));
  for(const data of ["","{broken","null","[]","x".repeat(MAX_PRACTICE_IMPORT_BYTES+1)])
    assert.throws(()=>importPracticeSession(data));
  assert.throws(()=>exportPracticeSession(["tampered"],[]));
});
test("session helper is pure and does not store, fetch or claim trusted grades",async()=>{
  const helper=await readFile(new URL("../src/lib/eternyxLabsPracticeSession.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(helper,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|WebSocket|Math\.random/);
  assert.match(helper,/trusted:false/);
});
