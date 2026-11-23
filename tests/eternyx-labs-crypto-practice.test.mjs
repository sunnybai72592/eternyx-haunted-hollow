import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,pbkdf2Sync} from "node:crypto";
import {readFile} from "node:fs/promises";
import {
 PRACTICE_TRACKS,PRACTICE_CASES,getPracticeCase,
 gradePracticeAnswer,gradePracticeAnswerAsync,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
 derivePbkdf2Locally,demonstrateAesGcmLocally,calculateTotpLocally,
 compareWebOriginsLocally,neutralizeCsvFormulasLocally,
} from "../src/lib/eternyxLabsCryptoDefense.mjs";

const tracks=["pbkdf2","aesgcm","totp","origins","csvsafe"];
const newIds=[
 "pbkdf2-vector","pbkdf2-work","pbkdf2-bytes",
 "aes-utf8","aes-tag-overhead","aes-tamper",
 "totp-rfc59","totp-leading-zero","totp-six",
 "origins-default","origins-scheme","origins-port",
 "csv-formulas","csv-whitespace","csv-quoted",
];
const known=[
 ["aes-utf8","10"],["aes-tag-overhead","29"],["aes-tamper","yes"],
 ["totp-rfc59","94287082"],["totp-leading-zero","07081804"],["totp-six","287082"],
 ["origins-default","yes"],["origins-scheme","yes"],["origins-port","yes"],
 ["csv-formulas","2"],["csv-whitespace","2"],["csv-quoted","3"],
 ["pbkdf2-bytes","32"],
];

test("25 tracks and 75 distinct locally graded scenarios preserve the previous sixty",()=>{
 assert.equal(PRACTICE_TRACKS.length,25);
 assert.equal(PRACTICE_CASES.length,75);
 assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,75);
 assert.deepEqual(PRACTICE_TRACKS.slice(20).map(c=>c.id),tracks);
 assert.deepEqual(PRACTICE_CASES.slice(60).map(c=>c.id),newIds);
 for(const track of PRACTICE_TRACKS)assert.equal(PRACTICE_CASES.filter(c=>c.track===track.id).length,3);
 for(const id of newIds){
  const c=getPracticeCase(id);
  assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
  assert.ok(c.hint.length>15&&c.explanation.length>15&&c.scenario.length>15);
 }
});
test("all new cases use real engines, published RFC vectors, and strict answer formatting",async()=>{
 const salt="00112233445566778899aabbccddeeff";
 for(const [id,iterations] of [["pbkdf2-vector",1000],["pbkdf2-work",10000]]){
  const expected=pbkdf2Sync("synthetic-example-only",Buffer.from(salt,"hex"),iterations,32,"sha256").toString("hex");
  const result=await gradePracticeAnswerAsync(id,expected,webcrypto);
  assert.equal(result.correct,true,id);
  assert.equal(result.expected,expected,id);
  assert.equal((await gradePracticeAnswerAsync(id,"f".repeat(64),webcrypto)).correct,expected==="f".repeat(64),id);
 }
 for(const [id,expected] of known){
  const result=await gradePracticeAnswerAsync(id,expected,webcrypto);
  assert.equal(result.correct,true,id);
  assert.equal(result.expected,expected,id);
  assert.equal(result.locallyChecked,true,id);
  assert.equal(result.serverVerified,false,id);
  assert.equal(result.certificateAwarded,false,id);
  assert.equal(result.externalSystemsAccessed,false,id);
 }
 assert.equal((await calculateTotpLocally("12345678901234567890",{epochSeconds:1111111109,period:30,digits:8,cryptoApi:webcrypto})).code,"07081804");
 assert.equal((await derivePbkdf2Locally("synthetic-example-only",{iterations:1000,saltHex:salt,cryptoApi:webcrypto})).derivedBytes,32);
 assert.equal((await demonstrateAesGcmLocally("verify integrity",webcrypto)).tamperingRejected,true);
 assert.equal(compareWebOriginsLocally("https://EXAMPLE.test/a","https://example.test:443/b").sameOrigin,true);
 assert.equal(neutralizeCsvFormulasLocally("=SUM(1,2)\nplain\n@HYPERLINK(\"x\")").neutralized,2);
});
test("wrong but well-formed answers do not count as successes",async()=>{
 for(const [id,expected] of known){
  const kind=getPracticeCase(id).kind;
  const wrong=kind==="boolean"?"no":kind==="otp8"?"99999999":kind==="otp6"?"999999":String(Number(expected)+1);
  assert.equal((await gradePracticeAnswerAsync(id,wrong,webcrypto)).correct,false,id);
 }
 const digest=pbkdf2Sync("synthetic-example-only",Buffer.from("00112233445566778899aabbccddeeff","hex"),1000,32,"sha256").toString("hex");
 assert.equal((await gradePracticeAnswerAsync("pbkdf2-vector",digest.toUpperCase(),webcrypto)).correct,true);
 assert.equal((await gradePracticeAnswerAsync("pbkdf2-vector","0".repeat(64),webcrypto)).correct,false);
 assert.equal((await gradePracticeAnswerAsync("totp-leading-zero","07081804",webcrypto)).correct,true);
 await assert.rejects(gradePracticeAnswerAsync("totp-leading-zero","7081804",webcrypto),/eight|8/);
});
test("Web Crypto is required, malformed answers fail closed, and no synchronous pretend crypto",async()=>{
 for(const [id,valid] of [
  ["pbkdf2-vector","0".repeat(64)],
  ["aes-tamper","yes"],
  ["totp-rfc59","94287082"],
 ]) {
  assert.throws(()=>gradePracticeAnswer(id,valid),/asynchronous/);
  await assert.rejects(gradePracticeAnswerAsync(id,valid,{}),/Web Crypto/);
 }
 for(const [id,answer] of [
  ["pbkdf2-vector","g".repeat(64)],["pbkdf2-work","a".repeat(65)],
  ["totp-rfc59","9428708"],["totp-leading-zero","0708180x"],
  ["totp-six","00287082"],["aes-tamper","maybe"],
  ["origins-default","perhaps"],["csv-formulas","02"],
  ["csv-formulas","1; DROP TABLE"],
 ])await assert.rejects(gradePracticeAnswerAsync(id,answer,webcrypto),undefined,id);
});
test("in-memory progress recognizes 75 real IDs but creates no server-verified score",()=>{
 const empty=summarizePracticeProgress();
 assert.deepEqual([empty.total,empty.passed,empty.byTrack.length],[75,0,25]);
 const mixed=summarizePracticeProgress(["pbkdf2-vector","pbkdf2-vector","aes-tamper","totp-leading-zero","csv-formulas"]);
 assert.equal(mixed.passed,4);
 assert.equal(mixed.byTrack.find(t=>t.id==="pbkdf2").passed,1);
 assert.equal(mixed.byTrack.find(t=>t.id==="csvsafe").passed,1);
 assert.equal(mixed.saved,false);
 assert.equal(mixed.authenticated,false);
 assert.equal(mixed.certificateAwarded,false);
 assert.equal(summarizePracticeProgress(new Set(newIds)).passed,15);
 assert.equal(summarizePracticeProgress(new Set(PRACTICE_CASES.map(c=>c.id))).passed,75);
 assert.throws(()=>summarizePracticeProgress(["forged-result"]));
});
test("UI supports leading-zero OTP, async stale-result fences and keeps everything browser-only",async()=>{
 const [ui,page,engine,extension]=await Promise.all([
  readFile(new URL("../src/components/labs/LabsPracticeChallenges.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/pages/EternyxLabs.tsx",import.meta.url),"utf8"),
  readFile(new URL("../src/lib/eternyxLabsPractice.mjs",import.meta.url),"utf8"),
  readFile(new URL("../src/lib/eternyxLabsCryptoPractice.mjs",import.meta.url),"utf8"),
 ]);
 assert.match(page,/Practice 75 answer-checked challenges/);
 assert.match(ui,/active.kind==="otp8"/);
 assert.match(ui,/active.kind==="otp6"/);
 assert.match(ui,/gradePracticeAnswerAsync\(caseId,submittedAnswer\)/);
 assert.match(ui,/ticket!==requestSeq.current/);
 assert.match(ui,/Current tab only/);
 for(const source of [ui,engine,extension]){
  assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|supabase|createServer|WebSocket|navigator\.sendBeacon/);
 }
});
