import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
  PRACTICE_CASES,PRACTICE_TRACKS,getPracticeCase,
  gradePracticeAnswer,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
  calculateIpv6SubnetLocally,inspectCachePolicyLocally,
  inspectSpfRecordLocally,simulateTokenBucketLocally,
  inspectSriFormatLocally,generateSriLocally,
} from "../src/lib/eternyxLabsAdvanced.mjs";

const expected=[
  ["ipv6-net","2001:db8:abcd:2::"],
  ["ipv6-count","256"],
  ["ipv6-entire","340282366920938463463374607431768211456"],
  ["cache-private","0"],
  ["cache-public","2"],
  ["cache-validate","yes"],
  ["spf-lookups","1"],
  ["spf-all","1"],
  ["spf-mechanisms","5"],
  ["ratelimit-allowed","6"],
  ["ratelimit-denied","1"],
  ["ratelimit-left","1"],
  ["sri-bits","384"],
  ["sri-base64","88"],
  ["sri-textbytes","10"],
];
const tracks=["ipv6","cache","spf","ratelimit","sri"];
test("fifteen new questions remain present as Labs grows to 60 scenarios and 20 tracks",()=>{
  assert.equal(PRACTICE_CASES.length,60);
  assert.equal(PRACTICE_TRACKS.length,20);
  assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,60);
  assert.deepEqual(PRACTICE_CASES.slice(30,45).map(c=>c.id),expected.map(x=>x[0]));
  assert.deepEqual(PRACTICE_TRACKS.slice(10,15).map(t=>t.id),tracks);
  for(const track of PRACTICE_TRACKS)
    assert.equal(PRACTICE_CASES.filter(x=>x.track===track.id).length,3);
  for(const [id]of expected){
    const c=getPracticeCase(id);
    assert.ok(c.title.length>5 && c.prompt.length>10 && c.scenario.length>4);
    assert.ok(c.hint.length>12 && c.explanation.length>12);
    assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
  }
});
test("fifteen actual calculated right answers pass, wrong answers fail without fake certificates",()=>{
  for(const [id,answer] of expected){
    const good=gradePracticeAnswer(id,answer);
    assert.equal(good.correct,true,id);
    assert.equal(good.expected,answer,id);
    assert.equal(good.locallyChecked,true);
    assert.equal(good.serverVerified,false);
    assert.equal(good.certificateAwarded,false);
    assert.equal(good.externalSystemsAccessed,false);
    const wrong=id==="ipv6-net"?"2001:db8:abcd:2::1":
      id==="cache-validate"?"no":
      id==="ipv6-entire"?(BigInt(answer)-1n).toString():
      (BigInt(answer)+1n).toString();
    const bad=gradePracticeAnswer(id,wrong);
    assert.equal(bad.correct,false,id);
    assert.equal(bad.expected,answer);
  }
});
test("IPv6 answer keys derive from the actual exact 128-bit subnet engine",()=>{
  for(const id of ["ipv6-net","ipv6-count","ipv6-entire"]){
    const c=getPracticeCase(id).config;
    const value=calculateIpv6SubnetLocally(c.cidr)[c.field];
    assert.equal(gradePracticeAnswer(id,String(value)).correct,true);
  }
  assert.equal(gradePracticeAnswer("ipv6-net","2001:0DB8:ABCD:0002:0000:0000:0000:0000").correct,true);
  assert.equal(gradePracticeAnswer("ipv6-entire",(1n<<128n).toString()).correct,true);
  assert.equal(gradePracticeAnswer("ipv6-entire","340282366920938463463374607431768211455").correct,false);
});
test("cache, SPF, and rate-limit practice recalculate using real offline operations",()=>{
  for(const id of ["cache-private","cache-public","cache-validate"]){
    const c=getPracticeCase(id).config;
    const result=inspectCachePolicyLocally(c.header,{sensitive:c.sensitive});
    const answer=c.field==="requiresRevalidation"?(result.requiresRevalidation?"yes":"no"):String(result[c.field]);
    assert.equal(gradePracticeAnswer(id,answer).correct,true,id);
  }
  for(const id of ["spf-lookups","spf-all","spf-mechanisms"]){
    const c=getPracticeCase(id).config;
    assert.equal(gradePracticeAnswer(id,String(inspectSpfRecordLocally(c.record)[c.field])).correct,true,id);
  }
  for(const id of ["ratelimit-allowed","ratelimit-denied","ratelimit-left"]){
    const c=getPracticeCase(id).config;
    const calc=simulateTokenBucketLocally(c);
    assert.equal(gradePracticeAnswer(id,String(calc[c.field])).correct,true,id);
    assert.equal(calc.requestsSent,0);
    assert.equal(calc.serverRateLimitEnforced,false);
  }
});
test("SRI length questions share exact algorithm definitions with real hashing",async()=>{
  const algorithms=[
    ["sha256",32,256,44],
    ["sha384",48,384,64],
    ["sha512",64,512,88],
  ];
  for(const [algorithm,bytes,bits,encoded]of algorithms){
    const format=inspectSriFormatLocally("hello 🌍",{algorithm});
    assert.equal(format.inputBytes,10);
    assert.equal(format.digestBytes,bytes);
    assert.equal(format.digestBits,bits);
    assert.equal(format.base64Length,encoded);
    assert.equal(format.hashComputed,false);
    assert.equal(format.requestsSent,0);
    const hashed=await generateSriLocally("hello 🌍",{algorithm,cryptoApi:webcrypto});
    const truth=algorithm+"-"+createHash(algorithm).update("hello 🌍","utf8").digest("base64");
    assert.equal(hashed.integrity,truth);
    assert.equal(hashed.integrity.length,algorithm.length+1+encoded);
  }
  for(const id of ["sri-bits","sri-base64","sri-textbytes"]){
    const c=getPracticeCase(id).config;
    const format=inspectSriFormatLocally(c.text,{algorithm:c.algorithm});
    assert.equal(gradePracticeAnswer(id,String(format[c.field])).correct,true,id);
  }
  assert.throws(()=>inspectSriFormatLocally("test",{algorithm:"md5"}));
  assert.throws(()=>inspectSriFormatLocally("x".repeat(4097),{algorithm:"sha256"}));
  assert.equal(inspectSriFormatLocally("a").hashComputed,false);
});
test("reject overflow, malformed IPv6 and fabricated answers without credit",()=>{
  const bad=[
    ["ipv6-net","2001:db8:::1"],["ipv6-net","[2001:db8::]"],
    ["ipv6-net","javascript:alert(1)"],
    ["ipv6-count","000256"],["ipv6-count","2.56e2"],["ipv6-count","-1"],
    ["ipv6-entire","340282366920938463463374607431768211457"],
    ["ipv6-entire","999999999999999999999999999999999999999"],
    ["ipv6-entire","1e38"],["cache-public","2.0"],
    ["cache-validate","true"],["spf-all","one"],
    ["ratelimit-allowed","6/7"],["sri-base64","88 characters"],
    ["sri-bits","384; drop table x"],["sri-textbytes","a".repeat(65)],
  ];
  for(const [id,answer] of bad)
    assert.throws(()=>gradePracticeAnswer(id,answer),undefined,id+": "+answer);
  for(const id of ["unknown",null,"__proto__"])
    assert.throws(()=>getPracticeCase(id));
});
test("unique in-memory practice progress is accurate for 45 questions",()=>{
  const pristine=summarizePracticeProgress();
  assert.deepEqual([pristine.passed,pristine.total,pristine.byTrack.length],[0,60,20]);
  const mixed=summarizePracticeProgress([
    "ipv6-net","ipv6-net","ipv6-count","sri-base64",
    "ratelimit-left","dns-count",
  ]);
  assert.equal(mixed.passed,5);
  assert.equal(mixed.byTrack.find(t=>t.id==="ipv6").passed,2);
  assert.equal(mixed.byTrack.find(t=>t.id==="sri").passed,1);
  assert.equal(mixed.byTrack.find(t=>t.id==="dns").passed,1);
  assert.equal(mixed.byTrack.find(t=>t.id==="subnet").passed,0);
  assert.equal(summarizePracticeProgress(new Set(PRACTICE_CASES.map(x=>x.id))).passed,60);
  assert.equal(mixed.saved,false);
  assert.equal(mixed.authenticated,false);
  assert.equal(mixed.certificateAwarded,false);
  assert.throws(()=>summarizePracticeProgress(["fabricated-completion"]));
});
test("mobile/desktop learning interface renders 45 from live catalog and supports exact answers",async()=>{
  const [ui,page,engine,advanced]=await Promise.all([
    readFile(new URL("../src/components/labs/LabsPracticeChallenges.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsPractice.mjs",import.meta.url),"utf8"),
    readFile(new URL("../src/lib/eternyxLabsAdvanced.mjs",import.meta.url),"utf8"),
  ]);
  assert.match(ui,/\{PRACTICE_CASES.length\} hands-on questions across \{PRACTICE_TRACKS.length\} tracks/);
  assert.match(page,/Practice 60 answer-checked challenges/);
  assert.match(ui,/active.kind==="ipv6"/);
  assert.match(ui,/active.kind==="bigint"/);
  assert.match(ui,/gradePracticeAnswerAsync\(caseId,submittedAnswer\)/);
  assert.match(ui,/summarizePracticeProgress\(passed\)/);
  assert.match(ui,/role="alert"/);
  assert.match(ui,/setPassed\(new Set\(\)\)/);
  assert.match(engine,/inspectSriFormatLocally/);
  assert.match(advanced,/cryptoApi\.subtle\.digest/);
  for(const file of [ui,engine,advanced]){
    assert.doesNotMatch(file,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|navigator\.sendBeacon/);
  }
  assert.equal((page.match(/sandbox="allow-scripts"/g)||[]).length,3);
});
