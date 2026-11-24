import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {fingerprintApiSuite,createApiBaseline,compareApiBaselines,exportApiRegression,readApiBaselines,storeApiBaseline} from "../src/lib/projectApiRegression.mjs";
const scenario=(extra={})=>({id:"a",projectId:"p1",name:"Health",method:"GET",url:"https://example.org/private?secret=SECRET",expectedStatus:200,maxDurationMs:1000,...extra});
const row=(extra={})=>({scenarioId:"a",status:200,elapsedMs:100,passed:true,reason:"passed",origin:"https://example.org/private?secret=SECRET",...extra});
const digest=async(s=[scenario()])=>fingerprintApiSuite(s,webcrypto);
const baseline=async(r=row(),s=[scenario()])=>createApiBaseline(s,[r],await digest(s),"2026-11-24T12:00:00.000Z");
test("fingerprints bind exact normalized contracts and not stripped query tokens",async()=>{
  assert.equal(await digest(),await digest([scenario({url:"https://example.org/private?secret=OTHER"})]));
  assert.notEqual(await digest(),await digest([scenario({expectedStatus:403})]));
  assert.notEqual(await digest(),await digest([scenario({maxDurationMs:900})]));
  assert.notEqual(await digest(),await digest([scenario({projectId:"p2"})]));
  assert.match(await digest(),/^[a-f0-9]{64}$/);
  await assert.rejects(fingerprintApiSuite([scenario()],{}),/Secure browser/);
});
test("completed results are redacted and reject cancelled and contradictory passes",async()=>{
  const b=await baseline();
  assert.ok(!JSON.stringify(b).includes("SECRET"));assert.ok(!JSON.stringify(b).includes("private"));
  assert.throws(()=>createApiBaseline([scenario()],[],b.fingerprint),/completed/);
  assert.throws(()=>createApiBaseline([scenario()],[row({reason:"cancelled",passed:false})],b.fingerprint),/completed/);
  assert.throws(()=>createApiBaseline([scenario()],[row({status:403})],b.fingerprint),/contract/);
  assert.throws(()=>createApiBaseline([scenario()],[row({elapsedMs:1500})],b.fingerprint),/contract/);
});
test("compares same configuration, identifies regressions, recoveries and observed latency changes",async()=>{
  const a=await baseline(), bad=await baseline(row({status:503,passed:false,reason:"status-mismatch"}));
  assert.equal(compareApiBaselines(a,bad).regressed,1);
  assert.equal(compareApiBaselines(bad,a).recovered,1);
  const slow=await baseline(row({elapsedMs:220}));
  assert.equal(compareApiBaselines(a,slow).latencyIncreases,1);
  assert.equal(compareApiBaselines(a,await baseline(row({elapsedMs:160}))).latencyIncreases,0);
  const changed=await baseline(row(),[scenario({maxDurationMs:900})]);
  assert.equal(compareApiBaselines(a,changed).state,"incompatible");
  assert.throws(()=>exportApiRegression(a,changed),/configuration changed|contracts changed/);
  const report=JSON.parse(exportApiRegression(a,bad));
  assert.equal(report.summary.regressed,1);assert.equal(report.productionVerified,false);
  assert.ok(!JSON.stringify(report).includes("https://"));
});
test("local baseline storage drops malformed, duplicate and cancelled records and supports replacement",async()=>{
  const b=await baseline();
  const data=readApiBaselines(JSON.stringify([{...b,savedAt:"not-date"},b,b,{...b,projectId:"p2",cases:[row({passed:false,reason:"cancelled"})]}]));
  assert.equal(data.length,1);
  assert.equal(storeApiBaseline(data,{...b,savedAt:"2026-11-24T13:00:00.000Z"}).length,1);
  assert.equal(readApiBaselines("invalid").length,0);
});
test("baseline controls require current complete evidence and never persist raw signature",()=>{
  const ui=readFileSync(new URL("../src/components/developer/ProjectApiSuitePanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/complete && currentEvidence\?\.signature === runSignature/);
  assert.match(ui,/if \(!current \|\| !complete \|\| running\) return/);
  assert.match(ui,/localStorage\.setItem\(API_BASELINE_KEY,JSON\.stringify\(next\)\)/);
  assert.doesNotMatch(ui,/localStorage\.setItem\([^;\n]*runSignature/);
  assert.match(ui,/comparison\?\.state==="comparable"\)saveJson/);
});
