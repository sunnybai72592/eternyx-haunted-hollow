import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {updateProjectApiScenario,moveProjectApiScenario,duplicateProjectApiScenario,runProjectApiSuite,isProjectApiRunComplete,projectApiSuiteSignature} from "../src/lib/projectApiSuite.mjs";
const item=(id,projectId="p1",extra={})=>({id,projectId,name:id,method:"GET",url:"https://example.org/"+id,expectedStatus:200,maxDurationMs:1000,...extra});
test("edit preserves project and scenario identity, validates contracts and strips URL secrets",()=>{
  const saved=[item("a"),item("b","p2")];
  const edited=updateProjectApiScenario(saved,"p1","a",{id:"other",projectId:"p2",name:"new",url:"https://example.org/new?token=SECRET"},["p1","p2"]);
  assert.equal(edited[0].id,"a");assert.equal(edited[0].projectId,"p1");assert.equal(edited[0].url,"https://example.org/new");
  assert.deepEqual(edited[1],saved[1]);assert.equal(saved[0].name,"a");
  assert.throws(()=>updateProjectApiScenario(saved,"p1","a",{method:"POST"}),/Only GET and HEAD/);
  assert.throws(()=>updateProjectApiScenario(saved,"p2","a",{}),/no longer exists/);
});
test("ordered moves are project-local and copies get a new identifier",()=>{
  const saved=[item("a"),item("other","p2"),item("b")];
  const moved=moveProjectApiScenario(saved,"p1","b",-1);
  assert.deepEqual(moved.map(x=>x.id),["b","other","a"]);
  assert.deepEqual(moveProjectApiScenario(moved,"p1","b",-1),moved);
  assert.notEqual(projectApiSuiteSignature(saved),projectApiSuiteSignature(moved));
  assert.throws(()=>moveProjectApiScenario(saved,"p1","a",2),/direction/);
  const copied=duplicateProjectApiScenario(saved,"p1","a","copy");
  assert.equal(copied.at(-1).name,"a (copy)");assert.equal(copied.at(-1).url,saved[0].url);
  assert.throws(()=>duplicateProjectApiScenario(saved,"p1","a","b"),/Duplicate/);
  assert.throws(()=>duplicateProjectApiScenario(Array.from({length:8},(_,i)=>item("s"+i)),"p1","s0","copy"),/Maximum 8/);
});
test("fail-fast executes only until first actual failed check, never claims unattempted checks",async()=>{
  const scenarios=[item("a"),item("b"),item("c")];
  const calls=[];
  const fetcher=async(url,opts)=>{calls.push(url);assert.equal(opts.credentials,"omit");return {status:url.endsWith("/b")?503:200}};
  const stopped=await runProjectApiSuite(scenarios,{fetcher,stopOnFailure:true});
  assert.deepEqual(calls,["https://example.org/a","https://example.org/b"]);
  assert.equal(stopped.length,2);assert.equal(stopped[1].reason,"status-mismatch");assert.equal(isProjectApiRunComplete(scenarios,stopped),false);
  calls.length=0;
  const all=await runProjectApiSuite(scenarios,{fetcher,stopOnFailure:false});
  assert.equal(calls.length,3);assert.equal(isProjectApiRunComplete(scenarios,all),true);
  await assert.rejects(runProjectApiSuite(scenarios,{fetcher,stopOnFailure:"yes"}),/Invalid execution policy/);
});
test("collection UI wires edits, order, duplicate, and incomplete evidence protections",()=>{
  const ui=readFileSync(new URL("../src/components/developer/ProjectApiSuitePanel.tsx",import.meta.url),"utf8");
  for(const name of ["updateProjectApiScenario","moveProjectApiScenario","duplicateProjectApiScenario","stopOnFailure","checks not run"])assert.ok(ui.includes(name));
  assert.match(ui,/projectApiSuiteSignature\(latest\) !== projectApiSuiteSignature\(scenarios\)/);
  assert.match(ui,/disabled=\{!complete\}/);
});
