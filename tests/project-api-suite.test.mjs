import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROJECT_API_REPORT_SCHEMA, PROJECT_API_IMPORT_SCHEMA, MAX_PROJECT_SCENARIOS,
  normalizeProjectApiScenario, normalizeProjectApiScenarios, addProjectApiScenario,
  exportProjectApiSuite, importProjectApiSuite, runProjectApiSuite,
  summarizeProjectApiResults, exportProjectApiReport,
} from "../src/lib/projectApiSuite.mjs";
const component = readFileSync(new URL("../src/components/developer/ProjectApiSuitePanel.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/pages/ApiEngineeringWorkbench.tsx", import.meta.url), "utf8");
const lab = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");

const specimen = (id="s1", overrides={}) => ({
  id, projectId:"project-1", name:"Health check", method:"GET", url:"https://example.com/api/health?token=PRIVATE#secret",
  expectedStatus:200, maxDurationMs:5000, ...overrides,
});
const makeSaved = items => items.reduce((saved, item) => addProjectApiScenario(saved, item, ["project-1"]), []);

test("project API scenarios are read-only GET/HEAD with no auth/query/fragment persistence", () => {
  assert.deepEqual(normalizeProjectApiScenario(specimen()), {
    id:"s1", projectId:"project-1", name:"Health check", method:"GET",
    url:"https://example.com/api/health", expectedStatus:200, maxDurationMs:5000,
  });
  for(const method of ["POST","PUT","DELETE","PATCH"]) {
    assert.throws(()=>normalizeProjectApiScenario(specimen("x",{method})), /Only GET and HEAD/);
  }
  assert.throws(()=>normalizeProjectApiScenario(specimen("x",{url:"https://user:pass@example.com/"})), /credentials/);
  assert.throws(()=>normalizeProjectApiScenario(specimen("x",{url:"javascript:alert(1)"})), /HTTP/);
  assert.throws(()=>normalizeProjectApiScenario(specimen("x",{url:"{{baseUrl}}/path"})), /complete HTTP/);
});

test("scenarios are linked only to actual saved project IDs and bounded per project", () => {
  assert.deepEqual(normalizeProjectApiScenarios([specimen()], ["other"]), []);
  let saved = [];
  for(let i=0;i<MAX_PROJECT_SCENARIOS;i++) saved=addProjectApiScenario(saved,specimen("s"+i),["project-1"]);
  assert.equal(saved.length,MAX_PROJECT_SCENARIOS);
  assert.throws(()=>addProjectApiScenario(saved,specimen("extra"),["project-1"]),/Maximum 8/);
  assert.throws(()=>addProjectApiScenario([],specimen("x",{projectId:"unknown"}),["project-1"]),/not saved/);
  assert.deepEqual(normalizeProjectApiScenarios([specimen(),specimen()],["project-1"]).length,1);
});

test("suite exports and imports only sanitized scenario definitions",()=>{
  const original=makeSaved([specimen()]);
  const json=exportProjectApiSuite(original,"project-1");
  assert.equal(json.includes("PRIVATE"),false);
  assert.equal(JSON.parse(json).schema,PROJECT_API_IMPORT_SCHEMA);
  const imported=importProjectApiSuite(json,"project-1",()=> "new-id");
  assert.equal(imported[0].id,"new-id");
  assert.equal(imported[0].url,"https://example.com/api/health");
  assert.throws(()=>importProjectApiSuite('{"schema":"wrong","scenarios":[]}',"project-1",()=> "x"), /Unsupported/);
  assert.throws(()=>importProjectApiSuite("{bad", "project-1",()=> "x"), /valid JSON/);
  assert.throws(()=>importProjectApiSuite("x".repeat(40001),"project-1",()=> "x"), /40 KB/);
});

test("actual sequential requests use no credentials, reject redirects, and record authentic results",async()=>{
  const called=[];
  const cases=makeSaved([specimen("a"),specimen("b",{url:"https://example.com/b",expectedStatus:201})]);
  let tick=100;
  const results=await runProjectApiSuite(cases,{
    now:()=>tick+=10,
    fetcher:async(url,options)=>{
      called.push({url,options});
      assert.equal(options.credentials,"omit");
      assert.equal(options.redirect,"error");
      assert.equal(options.mode,"cors");
      assert.ok(!Object.hasOwn(options,"headers"));
      return {status: url.endsWith("/b")?400:200};
    },
  });
  assert.equal(called.length,2);
  assert.equal(results[0].passed,true);
  assert.equal(results[1].passed,false);
  assert.equal(results[1].reason,"status-mismatch");
  assert.deepEqual(summarizeProjectApiResults(results),{total:2,passed:1,failed:1,cancelled:0});
  assert.equal(JSON.stringify(results).includes("/api/health"),false);
});

test("CORS failures never become passes; cancellation stops following requests",async()=>{
  const cases=makeSaved([specimen("a"),specimen("b",{url:"https://example.com/b"})]);
  const failed=await runProjectApiSuite([cases[0]],{fetcher:async()=>{throw new TypeError("Failed to fetch SECRET");}});
  assert.equal(failed[0].passed,false);
  assert.equal(failed[0].reason,"network-or-cors-error");
  assert.equal(JSON.stringify(failed).includes("SECRET"),false);
  const controller=new AbortController();
  let called=0;
  const cancelled=await runProjectApiSuite(cases,{
    signal:controller.signal,
    fetcher:async()=>{called+=1;controller.abort();throw new Error("Aborted");},
  });
  assert.equal(called,1);
  assert.equal(cancelled.length,1);
  assert.equal(cancelled[0].reason,"cancelled");
});

test("reports retain only sanitized origins/status/durations, no scenario URL paths",()=>{
  const scenarios=makeSaved([specimen()]);
  const row={scenarioId:scenarios[0].id,method:"GET",origin:"https://example.com/internal/token?secret=abc",
    status:200,elapsedMs:15,passed:true,reason:"passed"};
  const result=JSON.parse(exportProjectApiReport([row]));
  assert.equal(result.schema,PROJECT_API_REPORT_SCHEMA);
  assert.equal(result.cases[0].origin,"https://example.com");
  assert.deepEqual(result.summary,{total:1,passed:1,failed:0,cancelled:0});
  assert.ok(!JSON.stringify(result).includes("internal"));
  assert.throws(()=>exportProjectApiReport(Array(9).fill(row)),/at most 8/);
});

test("real cross-page project linking, cancellation and report export are wired",()=>{
  assert.match(api, /<ProjectApiSuitePanel/);
  assert.match(api,/searchParams\.get\("projectId"\)/);
  assert.match(lab, /developer-studio\/api-workbench\?projectId=/);
  assert.match(component,/localStorage\.setItem\(PROJECT_API_SUITE_KEY/);
  assert.match(component,/runProjectApiSuite\(/);
  assert.match(component,/abortRef\.current\?\.abort\(\)/);
  assert.match(component,/exportProjectApiReport\(results\)/);
  assert.match(component,/window\.confirm\("Run "/);
  assert.match(component,/mode=/); // no separate proxy or bypass
});
