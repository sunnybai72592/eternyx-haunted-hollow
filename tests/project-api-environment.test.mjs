import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolveApiEnvironmentSuite,validateApiTargetOrigin} from "../src/lib/projectApiEnvironment.mjs";
import {fingerprintApiSuite,createApiBaseline,compareApiBaselines,storeApiBaseline,readApiBaselines} from "../src/lib/projectApiRegression.mjs";
const s=(extra={})=>({id:"a",projectId:"p1",name:"Health",method:"GET",url:"https://original.example/api/health?token=PRIVATE",expectedStatus:200,maxDurationMs:1000,...extra});
test("exact origin rejects credentials, path, query, fragments, nonloopback HTTP and ambiguous input",()=>{
  for(const value of ["https://user:pass@example.com","https://example.com/path","https://example.com?x=1","https://example.com/#x","http://example.com","https://example.com\\evil"," https://example.com","file:///tmp","https://example.com:443"]){
    assert.throws(()=>validateApiTargetOrigin(value),/origin|HTTPS/);
  }
  assert.equal(validateApiTargetOrigin("https://staging.example.com/"),"https://staging.example.com");
  assert.equal(validateApiTargetOrigin("http://127.0.0.1:4173"),"http://127.0.0.1:4173");
});
test("override preserves paths and contracts without mutating saved definitions or treating double slash as host",()=>{
  const saved=[s(),s({id:"b",url:"https://original.example//other.example/path",expectedContentType:"json",jsonContract:{path:"data.id",type:"number"}})];
  const before=JSON.stringify(saved);
  const resolved=resolveApiEnvironmentSuite(saved,"staging","https://staging.example");
  assert.equal(resolved[0].url,"https://staging.example/api/health");
  assert.equal(resolved[1].url,"https://staging.example//other.example/path");
  assert.deepEqual(resolved[1].jsonContract,saved[1].jsonContract);
  assert.equal(JSON.stringify(saved),before);
  assert.equal(resolveApiEnvironmentSuite(saved,"saved")[0].url,"https://original.example/api/health");
  assert.throws(()=>resolveApiEnvironmentSuite([s(),s({id:"b",url:"https://other.example/x"})],"preview","https://preview.example"),/single-origin/);
  assert.throws(()=>resolveApiEnvironmentSuite(saved,"production","https://example.org"),/Unknown/);
});
test("baseline environment and effective-origin digest both fence comparisons, preserving legacy records",async()=>{
  const a=resolveApiEnvironmentSuite([s()],"saved"), b=resolveApiEnvironmentSuite([s()],"staging","https://staging.example");
  const d=await fingerprintApiSuite(a,webcrypto), e=await fingerprintApiSuite(b,webcrypto);
  assert.notEqual(d,e);
  const rows=[{scenarioId:"a",status:200,elapsedMs:100,passed:true,reason:"passed"}];
  const old=createApiBaseline(a,rows,d);
  const stage=createApiBaseline(b,rows,e,undefined,"staging");
  assert.equal(compareApiBaselines(old,stage).state,"incompatible");
  assert.equal(compareApiBaselines(old,{...old,environment:"preview"}).state,"incompatible");
  const {environment,...legacy}=old;
  const stored=storeApiBaseline(readApiBaselines(JSON.stringify([legacy])),stage);
  assert.equal(stored.length,2);
  assert.equal(readApiBaselines(JSON.stringify(stored)).length,2);
  assert.ok(!JSON.stringify(stored).includes("staging.example"));
  assert.equal(storeApiBaseline(stored,stage).length,2);
});
test("target selection is session-only and stale results cannot be exported after target change",()=>{
  const ui=readFileSync(new URL("../src/components/developer/ProjectApiSuitePanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/resolveApiEnvironmentSuite\(savedScenarios,environment,targetOrigin\)/);
  assert.match(ui,/runEnvironment !== environment \|\| !!targetError/);
  assert.match(ui,/setRunEnvironment\(environment\)/);
  assert.match(ui,/runProjectApiSuite\(available,/);
  assert.match(ui,/b\.environment === environment/);
  assert.doesNotMatch(ui,/localStorage\.setItem\([^;\n]*targetOrigin/);
});
