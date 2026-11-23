import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
  PRACTICE_CASES,PRACTICE_TRACKS,getPracticeCase,
  gradePracticeAnswer,gradePracticeAnswerAsync,summarizePracticeProgress,
} from "../src/lib/eternyxLabsPractice.mjs";
import {
  ADVANCED_DATA_TRACKS,ADVANCED_DATA_DEFINITIONS,
  answerForStructuredPractice,answerForAdvancedCryptoPractice,
} from "../src/lib/eternyxLabsAdvancedDataPractice.mjs";

test("15 new cases make 90 questions in 30 tracks without changing prior 75 IDs",()=>{
  const newTracks=["hkdf","ecdsa","aesaad","jsonmask","jsonhash"];
  assert.equal(PRACTICE_TRACKS.length,30);
  assert.equal(PRACTICE_CASES.length,90);
  assert.equal(new Set(PRACTICE_CASES.map(c=>c.id)).size,90);
  assert.deepEqual(PRACTICE_TRACKS.slice(25).map(t=>t.id),newTracks);
  assert.deepEqual(PRACTICE_CASES.slice(75).map(c=>c.id),ADVANCED_DATA_DEFINITIONS.map(d=>d[0]));
  assert.deepEqual(ADVANCED_DATA_TRACKS.map(t=>t.id),newTracks);
  for(const track of PRACTICE_TRACKS){
    assert.equal(PRACTICE_CASES.filter(x=>x.track===track.id).length,3);
  }
  for(const c of PRACTICE_CASES.slice(75)){
    assert.ok(c.prompt.length>8&&c.explanation.length>12&&c.hint.length>12,c.id);
    assert.ok(Object.isFrozen(c)&&Object.isFrozen(c.config));
  }
});
test("all 15 new scenario answers are recomputed by their actual engines",async()=>{
  for(const c of PRACTICE_CASES.slice(75)){
    const expected=c.track==="jsonmask"?
      answerForStructuredPractice(c):await answerForAdvancedCryptoPractice(c,webcrypto);
    const correct=await gradePracticeAnswerAsync(c.id,expected,webcrypto);
    assert.equal(correct.correct,true,c.id);
    assert.equal(correct.expected,expected,c.id);
    assert.equal(correct.locallyChecked,true);
    assert.equal(correct.serverVerified,false);
    assert.equal(correct.certificateAwarded,false);
    assert.equal(correct.externalSystemsAccessed,false);
    const wrong=c.kind==="boolean"?(expected==="yes"?"no":"yes"):
      c.kind==="hex64"?"0".repeat(64):String(Number(expected)+1);
    assert.equal((await gradePracticeAnswerAsync(c.id,wrong,webcrypto)).correct,false,c.id);
  }
});
test("synthetic HKDF practice derives truly different context-bound 256-bit outputs",async()=>{
  const a=getPracticeCase("hkdf-vector"),b=getPracticeCase("hkdf-context");
  const one=await answerForAdvancedCryptoPractice(a,webcrypto);
  const two=await answerForAdvancedCryptoPractice(b,webcrypto);
  assert.match(one,/^[0-9a-f]{64}$/);
  assert.match(two,/^[0-9a-f]{64}$/);
  assert.notEqual(one,two);
  assert.equal((await gradePracticeAnswerAsync("hkdf-length","16",webcrypto)).correct,true);
});
test("JSON key redaction grades synchronously; cryptographic tracks do not fake synchronous results",()=>{
  assert.equal(gradePracticeAnswer("mask-keys","2").correct,true);
  assert.equal(gradePracticeAnswer("mask-nested","2").correct,true);
  assert.equal(gradePracticeAnswer("mask-none","no").correct,true);
  assert.throws(()=>gradePracticeAnswer("hkdf-vector","0".repeat(64)),/asynchronous/);
  assert.throws(()=>gradePracticeAnswer("jsonhash-order","yes"),/asynchronous/);
});
test("invalid answer formats and missing cryptography fail closed",async()=>{
  for(const [id,answer] of [
    ["hkdf-vector","x".repeat(64)],["hkdf-vector","f".repeat(65)],
    ["hkdf-length","016"],["ecdsa-size","64.0"],
    ["aad-utf8","-2"],["aad-reject","maybe"],
    ["mask-nested","2; drop table"],["mask-none","unknown"],
    ["jsonhash-order","1"],
  ])await assert.rejects(gradePracticeAnswerAsync(id,answer,webcrypto),undefined,id);
  for(const [id,answer] of [
    ["hkdf-vector","0".repeat(64)],["ecdsa-good","yes"],
    ["aad-reject","yes"],["jsonhash-order","yes"],
  ])await assert.rejects(gradePracticeAnswerAsync(id,answer,{}),/Web Crypto/,id);
});
test("progress includes the new 15 IDs without recording accounts or certificates",()=>{
  const empty=summarizePracticeProgress();
  assert.deepEqual([empty.passed,empty.total,empty.byTrack.length],[0,90,30]);
  const passed=summarizePracticeProgress(new Set(PRACTICE_CASES.map(c=>c.id)));
  assert.equal(passed.passed,90);
  assert.equal(passed.saved,false);
  assert.equal(passed.authenticated,false);
  assert.equal(passed.certificateAwarded,false);
  assert.equal(passed.byTrack.find(t=>t.id==="hkdf").passed,3);
  assert.equal(passed.byTrack.find(t=>t.id==="jsonmask").passed,3);
});
