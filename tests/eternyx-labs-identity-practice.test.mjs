import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash,createHmac} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  PRACTICE_CASES,PRACTICE_TRACKS,getPracticeCase,
  gradePracticeAnswer,gradePracticeAnswerAsync,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
  derivePkceChallengeLocally,signHmacLocally,verifyHmacLocally,
  checkCidrMembershipLocally,inspectHstsLocally,inspectDmarcLocally,
} from "../src/lib/eternyxLabsIdentity.mjs";

const rfcVerifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const b64url=v=>createHash("sha256").update(v,"utf8").digest("base64url");
const hmacHex=createHmac("sha256","key").update("The quick brown fox jumps over the lazy dog","utf8").digest("hex");
const expected=[
  ["pkce-rfc","E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"],
  ["pkce-synthetic",b64url("k".repeat(43))],
  ["pkce-length","43"],
  ["hmac-known",hmacHex],
  ["hmac-tamper","no"],["hmac-valid","yes"],
  ["cidr-v4-in","yes"],["cidr-v4-out","no"],["cidr-v6-in","yes"],
  ["hsts-long","31536000"],["hsts-removal","2"],["hsts-subdomains","yes"],
  ["dmarc-monitor","3"],["dmarc-percentage","75"],["dmarc-report-count","2"],
];
const tracks=["pkce","hmac","cidrcheck","hsts","dmarc"];

test("sixty unique challenges span twenty tracks and preserve the first forty-five cases",()=>{
  assert.equal(PRACTICE_TRACKS.length,20);
  assert.equal(PRACTICE_CASES.length,60);
  assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,60);
  assert.deepEqual(PRACTICE_TRACKS.slice(-5).map(t=>t.id),tracks);
  assert.deepEqual(PRACTICE_CASES.slice(-15).map(c=>c.id),expected.map(x=>x[0]));
  assert.deepEqual(PRACTICE_CASES.slice(42,45).map(c=>c.id),
    ["sri-bits","sri-base64","sri-textbytes"]);
  for(const t of PRACTICE_TRACKS)
    assert.equal(PRACTICE_CASES.filter(c=>c.track===t.id).length,3);
  for(const [id] of expected){
    const c=getPracticeCase(id);
    assert.ok(c.title.length>5 && c.prompt.length>10 && c.scenario.length>6);
    assert.ok(c.hint.length>10 && c.explanation.length>10);
    assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
  }
});
test("all fifteen new expected answers are independently recomputed and accepted",async()=>{
  for(const [id,value] of expected){
    const grade=await gradePracticeAnswerAsync(id,value,webcrypto);
    assert.equal(grade.correct,true,id);
    assert.equal(grade.expected,value,id);
    assert.equal(grade.caseId,id);
    assert.equal(grade.locallyChecked,true);
    assert.equal(grade.serverVerified,false);
    assert.equal(grade.certificateAwarded,false);
    assert.equal(grade.externalSystemsAccessed,false);
  }
});
test("fifteen plausible but wrong answers are not recorded as correct",async()=>{
  for(const [id,answer] of expected){
    let wrong;
    if(id.startsWith("pkce-")&&id!=="pkce-length")wrong="A".repeat(43);
    else if(id==="hmac-known")wrong="0".repeat(64);
    else if(["hmac-tamper","hmac-valid","cidr-v4-in","cidr-v4-out","cidr-v6-in","hsts-subdomains"].includes(id))
      wrong=answer==="yes"?"no":"yes";
    else wrong=String(Number(answer)+1);
    assert.equal((await gradePracticeAnswerAsync(id,wrong,webcrypto)).correct,false,id);
  }
});
test("PKCE lessons use real SHA-256 and preserve case-sensitive Base64url strings",async()=>{
  const rfc=await derivePkceChallengeLocally(rfcVerifier,webcrypto);
  assert.equal(rfc.challenge,expected[0][1]);
  assert.equal((await gradePracticeAnswerAsync("pkce-rfc",rfc.challenge,webcrypto)).correct,true);
  const synthetic=await derivePkceChallengeLocally("k".repeat(43),webcrypto);
  assert.equal(synthetic.challenge,expected[1][1]);
  assert.equal((await gradePracticeAnswerAsync("pkce-synthetic",synthetic.challenge,webcrypto)).correct,true);
  assert.equal((await gradePracticeAnswerAsync("pkce-length","43",webcrypto)).correct,true);
  assert.equal((await gradePracticeAnswerAsync("pkce-rfc",rfc.challenge.toLowerCase(),webcrypto)).correct,false);
  await assert.rejects(gradePracticeAnswerAsync("pkce-rfc","NOT-BASE64URL",webcrypto),/43/);
  await assert.rejects(gradePracticeAnswerAsync("pkce-rfc",rfc.challenge,{}),/Web Crypto/);
});
test("HMAC lessons sign with real Web Crypto and verify changed messages, not fake booleans",async()=>{
  const real=await signHmacLocally("The quick brown fox jumps over the lazy dog","key",webcrypto);
  assert.equal(real.signatureHex,hmacHex);
  assert.equal((await gradePracticeAnswerAsync("hmac-known",hmacHex.toUpperCase(),webcrypto)).correct,true);
  const signed=await signHmacLocally("training event","training-only-key",webcrypto);
  const good=await verifyHmacLocally("training event","training-only-key",signed.signatureHex,webcrypto);
  const tampered=await verifyHmacLocally("training event changed","training-only-key",signed.signatureHex,webcrypto);
  assert.equal(good.verified,true);
  assert.equal(tampered.verified,false);
  assert.equal((await gradePracticeAnswerAsync("hmac-valid","yes",webcrypto)).correct,true);
  assert.equal((await gradePracticeAnswerAsync("hmac-tamper","no",webcrypto)).correct,true);
  await assert.rejects(gradePracticeAnswerAsync("hmac-known","Z".repeat(64),webcrypto),/hexadecimal/);
  await assert.rejects(gradePracticeAnswerAsync("hmac-known",hmacHex,{}),/Web Crypto/);
});
test("all nine networking, HSTS and DMARC lessons derive exact offline values",()=>{
  for(const id of ["cidr-v4-in","cidr-v4-out","cidr-v6-in"]){
    const c=getPracticeCase(id).config;
    const actual=checkCidrMembershipLocally(c.cidr,c.ip);
    assert.equal(gradePracticeAnswer(id,actual.contained?"yes":"no").correct,true,id);
    assert.equal(actual.probesSent,0);
    assert.equal(actual.aclEnforced,false);
  }
  for(const id of ["hsts-long","hsts-removal","hsts-subdomains"]){
    const c=getPracticeCase(id).config;
    const actual=inspectHstsLocally(c.header);
    const expected=c.field==="includeSubDomains"?
      (actual.includeSubDomains?"yes":"no"):String(actual[c.field]);
    assert.equal(gradePracticeAnswer(id,expected).correct,true,id);
    assert.equal(actual.remoteHostChecked,false);
  }
  for(const id of ["dmarc-monitor","dmarc-percentage","dmarc-report-count"]){
    const c=getPracticeCase(id).config;
    const actual=inspectDmarcLocally(c.record);
    assert.equal(gradePracticeAnswer(id,String(actual[c.field])).correct,true,id);
    assert.equal(actual.emailAuthenticated,false);
    assert.equal(actual.dnsQueriesSent,0);
    assert.equal(actual.reportAddressesExposed,false);
  }
});
test("validation rejects injection-shaped, oversized, malformed and ambiguous inputs",async()=>{
  for(const [id,answer] of [
    ["pkce-rfc","="+"a".repeat(43)],["pkce-rfc","e".repeat(42)],
    ["pkce-rfc","🚀".repeat(21)],["pkce-rfc","e".repeat(65)],
    ["hmac-known","a".repeat(63)],["hmac-known","g".repeat(64)],
    ["hmac-tamper","not sure"],["cidr-v4-in","maybe"],
    ["hsts-long","31_536_000"],["dmarc-monitor","-3"],
    ["dmarc-percentage","075"],["dmarc-report-count","2;rm -rf /"],
  ])await assert.rejects(gradePracticeAnswerAsync(id,answer,webcrypto),undefined,id);
  for(const id of ["does-not-exist",null,"__proto__"])
    await assert.rejects(gradePracticeAnswerAsync(id,"yes",webcrypto));
});
test("historical synchronous grading remains fully compatible, crypto intentionally requires async",async()=>{
  assert.equal(gradePracticeAnswer("subnet-hosts","30").correct,true);
  assert.equal(gradePracticeAnswer("ipv6-entire",(1n<<128n).toString()).correct,true);
  assert.throws(()=>gradePracticeAnswer("hmac-known",hmacHex),/asynchronous/);
  assert.throws(()=>gradePracticeAnswer("pkce-rfc",expected[0][1]),/asynchronous/);
  assert.equal((await gradePracticeAnswerAsync("subnet-hosts","30",{})).correct,true);
});
test("progress is unique, in-memory, never saved or turned into certificates",()=>{
  const p=summarizePracticeProgress();
  assert.equal(p.total,60);
  assert.equal(p.passed,0);
  assert.equal(p.byTrack.length,20);
  const mixed=summarizePracticeProgress(["pkce-rfc","pkce-rfc","hmac-valid","cidr-v6-in","subnet-hosts"]);
  assert.equal(mixed.passed,4);
  assert.equal(mixed.byTrack.find(t=>t.id==="pkce").passed,1);
  assert.equal(mixed.byTrack.find(t=>t.id==="hmac").passed,1);
  assert.equal(mixed.byTrack.find(t=>t.id==="subnet").passed,1);
  assert.equal(mixed.saved,false);
  assert.equal(mixed.authenticated,false);
  assert.equal(mixed.certificateAwarded,false);
  assert.equal(summarizePracticeProgress(new Set(PRACTICE_CASES.map(x=>x.id))).passed,60);
  assert.throws(()=>summarizePracticeProgress(["fabricated-pkce"]));
});
test("the React UI waits for actual crypto grades and invalidates stale results",async()=>{
  const [ui,page,engine]=await Promise.all([
    readFile(new URL("../src/components/labs/LabsPracticeChallenges.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsPractice.mjs",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Practice 60 answer-checked challenges/);
  assert.match(ui,/gradePracticeAnswerAsync\(caseId,submittedAnswer\)/);
  assert.match(ui,/if\(ticket!==requestSeq\.current\)return/);
  assert.match(ui,/\+\+requestSeq\.current/);
  assert.match(ui,/setChecking\(false\)/);
  assert.match(ui,/active.kind==="base64url"/);
  assert.match(ui,/active.kind==="hex64"/);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/setPassed\(new Set\(\)\)/);
  for(const file of [ui,engine])
    assert.doesNotMatch(file,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|navigator\.sendBeacon/);
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
