import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  PRACTICE_TRACKS,PRACTICE_CASES,getPracticeCase,
  gradePracticeAnswer,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
  calculateIpv4Subnet,simulateUnixUmask,lintCspPolicy,
  evaluateCorsHeaderExample,reviewSetCookieExample,
} from "../src/lib/eternyxLabsFoundations.mjs";
const source=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const cases=[
  ["subnet-network","192.168.42.0"],
  ["subnet-hosts","30"],
  ["subnet-point","198.51.100.11"],
  ["chmod-directory","750"],
  ["chmod-file","644"],
  ["chmod-restrict","700"],
  ["csp-hardened","0"],
  ["csp-unsafe","7"],
  ["csp-duplicate","1"],
  ["cors-exact","yes"],
  ["cors-wildcard","no"],
  ["cors-same","yes"],
  ["cookie-host","0"],
  ["cookie-weak","4"],
  ["cookie-session","1"],
];
test("exactly fifteen graded practice cases span five tracks and each has three live scenarios",()=>{
  assert.equal(PRACTICE_TRACKS.length,5);
  assert.equal(PRACTICE_CASES.length,15);
  assert.deepEqual(PRACTICE_CASES.map(c=>c.id),cases.map(c=>c[0]));
  assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,15);
  for(const track of PRACTICE_TRACKS)
    assert.equal(PRACTICE_CASES.filter(c=>c.track===track.id).length,3);
  for(const c of PRACTICE_CASES){
    assert.ok(c.title.length>5&&c.prompt.length>12&&c.scenario.length>6);
    assert.ok(c.hint.length>10&&c.explanation.length>10);
    assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
    assert.equal(getPracticeCase(c.id),c);
  }
});
test("each of fifteen real calculation-derived expected answers is accepted",()=>{
  for(const [id,answer] of cases){
    const result=gradePracticeAnswer(id,answer);
    assert.equal(result.correct,true,id);
    assert.equal(result.expected,answer,id);
    assert.equal(result.caseId,id);
    assert.equal(result.locallyChecked,true);
    assert.equal(result.serverVerified,false);
    assert.equal(result.certificateAwarded,false);
    assert.equal(result.externalSystemsAccessed,false);
  }
});
test("answer keys agree with independent foundation calculations, not a static fake score map",()=>{
  assert.equal(gradePracticeAnswer("subnet-network",
    calculateIpv4Subnet("192.168.42.77/24").network).correct,true);
  assert.equal(gradePracticeAnswer("subnet-hosts",
    String(calculateIpv4Subnet("10.7.1.200/27").usableCount)).correct,true);
  assert.equal(gradePracticeAnswer("subnet-point",
    calculateIpv4Subnet("198.51.100.10/31").broadcast).correct,true);
  assert.equal(gradePracticeAnswer("chmod-file",
    simulateUnixUmask("0666","0022").resultingMode).correct,true);
  assert.equal(gradePracticeAnswer("csp-unsafe",
    String(lintCspPolicy(
      "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' *"
    ).warningCount)).correct,true);
  assert.equal(gradePracticeAnswer("cors-wildcard",
    evaluateCorsHeaderExample({
      requestOrigin:"https://app.example.org",
      resourceOrigin:"https://api.example.org",
      credentials:true,
      headers:"Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",
    }).readAllowed?"yes":"no").correct,true);
  assert.equal(gradePracticeAnswer("cookie-weak",
    String(reviewSetCookieExample(
      "Set-Cookie: __Host-training=synthetic; Domain=example.org; SameSite=None"
    ).warningCount)).correct,true);
});
test("wrong but well-formed answers are checked incorrect; no invented passes",()=>{
  const wrong=[
    ["subnet-network","192.168.42.1"],
    ["subnet-hosts","32"],
    ["subnet-point","198.51.100.10"],
    ["chmod-directory","777"],
    ["chmod-file","666"],
    ["chmod-restrict","750"],
    ["csp-hardened","1"],
    ["csp-unsafe","0"],
    ["csp-duplicate","0"],
    ["cors-exact","no"],
    ["cors-wildcard","yes"],
    ["cors-same","no"],
    ["cookie-host","1"],
    ["cookie-weak","0"],
    ["cookie-session","0"],
  ];
  for(const [id,answer] of wrong){
    const result=gradePracticeAnswer(id,answer);
    assert.equal(result.correct,false,id);
    assert.ok(result.expected);
    assert.equal(result.certificateAwarded,false);
  }
});
test("trim and common octal/binary notation are normalized, but malicious and malformed answers refuse",()=>{
  assert.equal(gradePracticeAnswer("subnet-network"," 192.168.42.0 ").correct,true);
  assert.equal(gradePracticeAnswer("cors-exact"," YES ").correct,true);
  assert.equal(gradePracticeAnswer("chmod-directory","0750").correct,true);
  assert.equal(gradePracticeAnswer("csp-hardened"," 0 ").correct,true);
  for(const [id,answer] of [
    ["subnet-network","192.168.042.0"],
    ["subnet-network","256.168.42.0"],
    ["subnet-network","1.2.3"],
    ["subnet-network","http://example.org"],
    ["subnet-hosts","-1"],
    ["subnet-hosts","3.5"],
    ["subnet-hosts","00"],
    ["chmod-directory","9ab"],
    ["chmod-directory","4750"],
    ["cors-exact","perhaps"],
    ["cookie-host","1; <script>alert(1)</script>"],
    ["cookie-host","0".repeat(65)],
    ["csp-hardened",""],
    ["csp-hardened",42],
  ])assert.throws(()=>gradePracticeAnswer(id,answer),undefined,id);
  for(const id of ["unknown","",null,"__proto__"])
    assert.throws(()=>getPracticeCase(id));
});
test("per-track progress is actual unique correct cases, idempotent and never saved",()=>{
  const empty=summarizePracticeProgress();
  assert.deepEqual([empty.passed,empty.total,empty.saved,empty.authenticated,empty.certificateAwarded],
    [0,15,false,false,false]);
  const duplicate=summarizePracticeProgress([
    "subnet-network","subnet-network","subnet-hosts","cors-wildcard",
  ]);
  assert.equal(duplicate.passed,3);
  assert.equal(duplicate.byTrack.find(t=>t.id==="subnet").passed,2);
  assert.equal(duplicate.byTrack.find(t=>t.id==="cors").passed,1);
  assert.equal(duplicate.byTrack.find(t=>t.id==="cookie").passed,0);
  assert.equal(summarizePracticeProgress(new Set(cases.map(x=>x[0]))).passed,15);
  assert.throws(()=>summarizePracticeProgress(["tampered-id"]));
  assert.throws(()=>summarizePracticeProgress({id:"subnet-network"}));
  assert.throws(()=>summarizePracticeProgress(
    Array.from({length:16},(_,i)=>"foreign-"+i)));
});
test("React challenge practice is accessible, session-only, and based on the grade function",async()=>{
  const [ui,page,engine]=await Promise.all([
    source("src/components/labs/LabsPracticeChallenges.tsx"),
    source("src/pages/EternyxLabs.tsx"),
    source("src/lib/eternyxLabsPractice.mjs"),
  ]);
  assert.match(page,/LabsPracticeChallenges/);
  assert.match(page,/href="#labs-practice"/);
  assert.match(ui,/id="labs-practice"/);
  assert.match(ui,/gradePracticeAnswer\(activeId,answer\)/);
  assert.match(ui,/summarizePracticeProgress\(passed\)/);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/setPassed\(new Set\(\)\)/);
  assert.match(ui,/Current tab only/);
  for(const name of ["Check answer locally","Show hint","Reset local practice","Next scenario"])
    assert.ok(ui.includes(name),name);
  for(const text of [ui,engine]){
    assert.doesNotMatch(text,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|navigator\.sendBeacon|WebSocket/);
  }
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
  assert.doesNotMatch(page,/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
});
