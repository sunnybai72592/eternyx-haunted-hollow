import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeJsonContract,evaluateJsonContract,inspectJsonContract,JSON_CONTRACT_MAX_BYTES} from "../src/lib/projectApiJsonContract.mjs";
import {normalizeProjectApiScenario,runProjectApiSuite,exportProjectApiReport,exportProjectApiSuite,importProjectApiSuite,projectApiSuiteSignature} from "../src/lib/projectApiSuite.mjs";
const specimen=(id="case1",extra={})=>({id,projectId:"project-1",name:"check",url:"https://example.com/resource?token=PRIVATE",method:"GET",expectedStatus:200,maxDurationMs:5000,expectedContentType:"json",jsonContract:{path:"data.0.id",type:"number"},...extra});
const jsonResponse=(text,status=200,type="application/json")=>new Response(text,{status,headers:{"content-type":type}});
test("strict field paths allow array indexes and own fields only, including null and false",()=>{
  for(const path of ["__proto__.x","data.constructor","data.prototype","data..id","data.01.id",Array(13).fill("x").join(".")]){
    assert.throws(()=>normalizeJsonContract({path,type:"exists"}),/safe dotted/);
  }
  assert.throws(()=>normalizeJsonContract({path:"x",type:"integer"}),/Unsupported/);
  assert.throws(()=>normalizeJsonContract({path:"x",type:"exists",equals:"SECRET"}),/Invalid/);
  assert.equal(evaluateJsonContract({data:[{id:0}]},{path:"data.0.id",type:"number"}),"passed");
  assert.equal(evaluateJsonContract({data:null},{path:"data",type:"null"}),"passed");
  assert.equal(evaluateJsonContract({data:false},{path:"data",type:"exists"}),"passed");
  assert.equal(evaluateJsonContract({data:[]},{path:"data.length",type:"number"}),"missing");
  assert.equal(evaluateJsonContract(Object.create({x:1}),{path:"x",type:"exists"}),"missing");
  assert.equal(evaluateJsonContract({data:"x"},{path:"data",type:"array"}),"type-mismatch");
});
test("bounded response bodies fail on missing, invalid, oversized and mismatched fields",async()=>{
  const rule={path:"data.0.id",type:"number"};
  for(const [body,outcome] of [['{"data":[{"id":42}]}',"passed"],['{"data":[]}',"missing"],['{"data":[{"id":"42"}]}',"type-mismatch"],['{bad',"invalid-json"],['{"data":[{"id":42}],"pad":"'+ "x".repeat(JSON_CONTRACT_MAX_BYTES)+'"}',"body-too-large"]]){
    assert.equal(await inspectJsonContract(jsonResponse(body),rule),outcome);
  }
});
test("scenario contracts are opt-in GET JSON only and round-trip without values",()=>{
  assert.throws(()=>normalizeProjectApiScenario(specimen("x",{method:"HEAD"})),/require GET/);
  assert.throws(()=>normalizeProjectApiScenario(specimen("x",{expectedContentType:"html"})),/require GET/);
  const saved=[normalizeProjectApiScenario(specimen())];
  const exported=exportProjectApiSuite(saved,"project-1");
  assert.ok(!exported.includes("PRIVATE"));
  assert.deepEqual(importProjectApiSuite(exported,"project-1",()=>"new")[0].jsonContract,saved[0].jsonContract);
  assert.notEqual(projectApiSuiteSignature(saved),projectApiSuiteSignature([specimen("case1",{jsonContract:{path:"data.0.name",type:"string"}})]));
});
test("real Response objects exercise field contracts with redacted evidence and header-only short circuit",async()=>{
  const scenarios=[specimen("good"),specimen("bad",{url:"https://example.com/bad"}),specimen("denied",{url:"https://example.com/denied"})];
  const rows=await runProjectApiSuite(scenarios,{fetcher:async(url,opts)=>{
    assert.equal(opts.credentials,"omit");assert.equal(opts.referrerPolicy,"no-referrer");assert.equal(opts.redirect,"error");
    if(url.endsWith("/denied"))return jsonResponse('{"data":[{"id":42}]}',403);
    return jsonResponse(url.endsWith("/bad")?'{"data":[{"id":"PRIVATE_VALUE"}]}':'{"data":[{"id":42}],"extra":"PRIVATE_VALUE"}');
  }});
  assert.deepEqual(rows.map(x=>x.jsonCheck),["passed","type-mismatch","not-run"]);
  assert.deepEqual(rows.map(x=>x.reason),["passed","json-contract-failed","status-mismatch"]);
  const report=exportProjectApiReport(rows);
  for(const secret of ["PRIVATE","data.0.id","/resource","/bad","/denied"])assert.ok(!report.includes(secret));
  assert.equal(JSON.parse(report).summary.passed,1);
});
test("cancel during actual stream read cannot become a success",async()=>{
  const abort=new AbortController();
  const rows=await runProjectApiSuite([specimen()],{signal:abort.signal,fetcher:async()=>new Response(new ReadableStream({pull(c){abort.abort();c.enqueue(new TextEncoder().encode('{"data":[{"id":42}]}'));c.close()}}),{headers:{"content-type":"application/json"}})});
  assert.equal(rows[0].passed,false);assert.equal(rows[0].reason,"cancelled");
});
test("UI opts into bounded JSON checks and does not export field values",()=>{
  const ui=readFileSync(new URL("../src/components/developer/ProjectApiSuitePanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/id="api-scenario-json-path"/);
  assert.match(ui,/id="api-scenario-json-type"/);
  assert.match(ui,/jsonContract:\{path:jsonPath\.trim\(\),type:jsonType\}/);
  assert.match(ui,/r\.jsonCheck/);
});
