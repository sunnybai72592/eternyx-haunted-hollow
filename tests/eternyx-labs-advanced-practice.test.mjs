import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
 PRACTICE_CASES,PRACTICE_TRACKS,getPracticeCase,
 gradePracticeAnswer,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
 inspectDnsZoneLocally,inspectHttpRequestLocally,inspectSecurityTxtLocally,
 correlateSecurityEventsLocally,generateLocalRandomToken,
} from "../src/lib/eternyxLabsOperations.mjs";

const cases=[
 ["dns-count","2"],["dns-cname","1"],["dns-owners","3"],
 ["http-body","5"],["http-conflict","2"],["http-headers","3"],
 ["security-contacts","2"],["security-expired","1"],["security-missing","2"],
 ["events-window","1"],["events-errors","2"],["events-total","4"],
 ["tokens-entropy","256"],["tokens-hex","48"],["tokens-b64","43"],
];
const tracks=["dns","http","securitytxt","events","tokens"];

test("fifteen tracks contain forty-five unique scenarios preserving previous defensive cases",()=>{
 assert.equal(PRACTICE_TRACKS.length,15);
 assert.equal(PRACTICE_CASES.length,45);
 assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,45);
 assert.deepEqual(PRACTICE_TRACKS.slice(5,10).map(t=>t.id),tracks);
 assert.deepEqual(PRACTICE_CASES.slice(15,30).map(c=>c.id),cases.map(c=>c[0]));
 for(const track of PRACTICE_TRACKS){
  const group=PRACTICE_CASES.filter(c=>c.track===track.id);
  assert.equal(group.length,3,track.id);
 }
 for(const [id] of cases){
  const c=getPracticeCase(id);
  assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
  assert.ok(c.hint.length>=15&&c.explanation.length>=15);
  assert.ok(c.scenario.length>15);
 }
});
test("all fifteen new answer checks exactly match deterministic offline tool results",()=>{
 for(const [id,expected] of cases){
  const checked=gradePracticeAnswer(id,expected);
  assert.equal(checked.correct,true,id);
  assert.equal(checked.expected,expected,id);
  assert.equal(checked.caseId,id);
  assert.equal(checked.serverVerified,false);
  assert.equal(checked.certificateAwarded,false);
  assert.equal(checked.externalSystemsAccessed,false);
 }
});
test("new practice answers arise from real DNS, HTTP, security.txt and event calculators",()=>{
 const dns=getPracticeCase("dns-count").config;
 assert.equal(gradePracticeAnswer("dns-count",
  String(inspectDnsZoneLocally(dns.zone).counts.A)).correct,true);
 const clash=getPracticeCase("dns-cname").config;
 assert.equal(gradePracticeAnswer("dns-cname",
  String(inspectDnsZoneLocally(clash.zone).warnings.length)).correct,true);
 const owner=getPracticeCase("dns-owners").config;
 assert.equal(gradePracticeAnswer("dns-owners",
  String(inspectDnsZoneLocally(owner.zone).distinctOwners)).correct,true);
 const body=getPracticeCase("http-body").config;
 assert.equal(gradePracticeAnswer("http-body",
  String(inspectHttpRequestLocally(body.request).bodyBytes)).correct,true);
 const conflict=getPracticeCase("http-conflict").config;
 assert.equal(gradePracticeAnswer("http-conflict",
  String(inspectHttpRequestLocally(conflict.request).warnings.length)).correct,true);
 const headers=getPracticeCase("http-headers").config;
 assert.equal(gradePracticeAnswer("http-headers",
  String(inspectHttpRequestLocally(headers.request).headerCount)).correct,true);
 for(const id of ["security-contacts","security-expired","security-missing"]){
  const c=getPracticeCase(id).config;
  const result=inspectSecurityTxtLocally(c.document,new Date("2026-11-23T00:00:00Z"));
  assert.equal(gradePracticeAnswer(id,String(result[c.field])).correct,true);
 }
 for(const [id,field] of [["events-window","threeFailureWindows"],["events-errors","ERROR"],["events-total","eventCount"]]){
  const c=getPracticeCase(id).config;
  const result=correlateSecurityEventsLocally(c.events);
  const actual=id==="events-errors"?result.levels.ERROR:result[field];
  assert.equal(gradePracticeAnswer(id,String(actual)).correct,true);
 }
});
test("token questions use deterministic synthetic bytes only for length calculations",()=>{
 const mocked={getRandomValues(buffer){buffer.fill(0xa5);return buffer;}};
 for(const id of ["tokens-entropy","tokens-hex","tokens-b64"]){
  const cfg=getPracticeCase(id).config;
  const generated=generateLocalRandomToken({
   bytes:cfg.bytes,format:cfg.format,cryptoApi:mocked,
  });
  const expected=cfg.field==="length"?generated.token.length:generated.randomBits;
  assert.equal(gradePracticeAnswer(id,String(expected)).correct,true);
  assert.equal(generated.storageUsed,false);
  assert.equal(generated.requestsSent,0);
 }
 assert.equal(gradePracticeAnswer("tokens-entropy","256").expected,"256");
 assert.equal(gradePracticeAnswer("tokens-b64","43").expected,"43");
});
test("every new scenario rejects an incorrect but valid integer answer",()=>{
 for(const [id,expected] of cases){
  const wrong=String(Number(expected)+1);
  const checked=gradePracticeAnswer(id,wrong);
  assert.equal(checked.correct,false,id);
  assert.equal(checked.expected,expected,id);
  assert.equal(checked.locallyChecked,true);
  assert.equal(checked.certificateAwarded,false);
 }
});
test("malformed and attack-like answer formats are rejected without falsely recording progress",()=>{
 for(const [id,answer] of [
  ["dns-count",""],["dns-owners","01"],["http-body","-1"],
  ["http-conflict","NaN"],["security-contacts","2.0"],
  ["security-expired","2; DROP TABLE"],
  ["events-window","Infinity"],["events-errors","yes"],
  ["tokens-entropy","256 bits"],["tokens-b64","<img src=x>"],
  ["tokens-hex","8".repeat(65)],["dns-cname",null],
 ]){
  assert.throws(()=>gradePracticeAnswer(id,answer),undefined,id);
 }
 assert.throws(()=>gradePracticeAnswer("not-a-case","1"));
});
test("cross-track progress is unique, derived from correct answers and never stored or certified",()=>{
 const first=summarizePracticeProgress();
 assert.equal(first.total,45);
 assert.equal(first.passed,0);
 assert.equal(first.byTrack.length,15);
 const mixed=summarizePracticeProgress([
  "dns-count","dns-count","dns-owners","http-conflict","events-errors","tokens-b64",
 ]);
 assert.equal(mixed.passed,5);
 assert.equal(mixed.byTrack.find(t=>t.id==="dns").passed,2);
 assert.equal(mixed.byTrack.find(t=>t.id==="tokens").passed,1);
 assert.equal(mixed.byTrack.find(t=>t.id==="subnet").passed,0);
 assert.equal(summarizePracticeProgress(new Set(PRACTICE_CASES.map(c=>c.id))).passed,45);
 for(const flag of ["saved","authenticated","certificateAwarded"])
  assert.equal(mixed[flag],false);
 assert.throws(()=>summarizePracticeProgress(["unknown-case"]));
 assert.throws(()=>summarizePracticeProgress(PRACTICE_CASES.map(c=>c.id).concat(["fake"])));
});
test("UI correctly shows fifteen tracks, forty-five questions, safe examples and no network or durable score",async()=>{
 const [ui,page,engine,ops]=await Promise.all([
  readFile(new URL("../src/components/labs/LabsPracticeChallenges.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/lib/eternyxLabsPractice.mjs",import.meta.url),"utf8"),
  readFile(new URL("../src/lib/eternyxLabsOperations.mjs",import.meta.url),"utf8"),
 ]);
 assert.match(ui,/\{PRACTICE_CASES.length\} hands-on questions across \{PRACTICE_TRACKS.length\} tracks/);
 assert.match(ui,/PRACTICE_TRACKS\.map/);
 assert.match(ui,/gradePracticeAnswer\(activeId,answer\)/);
 assert.match(ui,/setPassed\(new Set\(\)\)/);
 assert.match(ui,/Current tab only/);
 assert.match(ui,/role="alert"/);
 assert.match(page,/Practice 45 answer-checked challenges/);
 assert.match(ops,/getRandomValues/);
 assert.match(engine,/bytes\.fill\(0xa5\)/);
 assert.doesNotMatch(engine,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|navigator\.sendBeacon/);
 assert.doesNotMatch(ui,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket/);
 assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
