import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeveloperProject, addDeveloperFile, editDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import {
  DEVELOPER_TEST_SUITE_SCHEMA, DEVELOPER_TEST_REPORT_SCHEMA, MAX_DEVELOPER_TESTS, TEST_KINDS,
  defaultDeveloperTests, normalizeDeveloperTestCase, normalizeDeveloperTestSuite,
  runDeveloperLocalTests, exportDeveloperLocalTestReport, exportDeveloperTestSuite,
  importDeveloperTestSuite, readSavedDeveloperTestSuites, upsertSavedDeveloperTestSuite,
} from "../src/lib/developerProjectTests.mjs";
const named=(id,kind,file,expected="",path="")=>({id,kind,file,expected,path});
const starter=()=>createDeveloperProject("starter","local-test-1");

test("default assertions run against real project and actual TypeScript JS parser",async()=>{
  const tests=defaultDeveloperTests(), report=await runDeveloperLocalTests(starter(),tests);
  assert.equal(MAX_DEVELOPER_TESTS,16);
  assert.equal(report.schema,DEVELOPER_TEST_REPORT_SCHEMA);
  assert.equal(report.status,"passed");
  assert.equal(report.passed,2);
  assert.equal(report.failed,0);
  assert.equal(report.preflightPassed,true);
  assert.match(report.scope,/No code execution/);
});

test("failure paths are genuine: missing file, empty source, literal and forbidden content",async()=>{
  const source=editDeveloperFile(createDeveloperProject("blank","local-test-1"),"index.html","");
  const cases=[
    named("exists","file-exists","missing.js"),named("filled","file-nonempty","index.html"),
    named("contains","text-contains","index.html","PRIVATE_MARKER"),
    named("absent","text-absent","index.html","PRIVATE_MARKER"),
  ];
  const report=await runDeveloperLocalTests(source,cases);
  assert.deepEqual(report.results.map(x=>x.reason),
    ["missing-file","empty-file","required-text-missing","assertion-met"]);
  assert.equal(report.failed,3);
  assert.equal(report.status,"review-required");
});

test("actual HTML anchor and case-sensitive text checks return real file lines",async()=>{
  let project=createDeveloperProject("landing","local-test-1");
  project=editDeveloperFile(project,"index.html",'<main>\n<a href="#target">Go</a>\n<section id="target">Done</section>\n</main>');
  const report=await runDeveloperLocalTests(project,[
    named("one","text-contains","index.html",'id="target"'),
    named("two","text-contains","index.html",'ID="target"'),
    named("three","html-anchor-exists","index.html","target"),
    named("four","html-anchor-exists","index.html","missing"),
    named("five","text-absent","index.html","<script"),
  ]);
  assert.deepEqual(report.results.map(x=>x.status),["passed","failed","passed","failed","passed"]);
  assert.equal(report.results[0].line,3);
  assert.equal(report.results[2].line,3);
});

test("JSON value equality tests real nested values; parse failures cannot pass",async()=>{
  let project=addDeveloperFile(createDeveloperProject("blank","local-test-1"),
    "settings.json",'{"release":{"ok":true,"count":7,"label":"ready"}}');
  const tests=[
    named("valid","json-valid","settings.json"),
    named("boolean","json-path-equals","settings.json","true","release.ok"),
    named("number","json-path-equals","settings.json","7","release.count"),
    named("string","json-path-equals","settings.json",'"ready"',"release.label"),
    named("different","json-path-equals","settings.json",'"unsafe"',"release.label"),
    named("missing","json-path-equals","settings.json","1","release.unknown"),
  ];
  const result=await runDeveloperLocalTests(project,tests);
  assert.equal(result.passed,4);
  assert.equal(result.failed,2);
  assert.deepEqual(result.results.slice(4).map(x=>x.reason),["json-value-different","json-path-missing"]);
  project=editDeveloperFile(project,"settings.json","{bad");
  const failed=await runDeveloperLocalTests(project,[named("syntax","json-valid","settings.json")]);
  assert.equal(failed.results[0].reason,"invalid-json");
  assert.equal(failed.preflightPassed,false);
});

test("JavaScript parse failure blocks suite pass even when file assertions pass",async()=>{
  const broken=editDeveloperFile(starter(),"app.js","const PRIVATE_SOURCE = 3; function broken( {");
  const output=await runDeveloperLocalTests(broken,defaultDeveloperTests());
  assert.equal(output.failed,0);
  assert.equal(output.preflightPassed,false);
  assert.ok(output.preflightErrors>0);
  assert.equal(output.status,"review-required");
});

test("reject traversal, arbitrary execution kinds, unsafe JSON paths and duplicate IDs",()=>{
  const invalid=[
    named("x","text-contains","../private.js","secret"),named("x","text-contains","app.js",""),
    named("x","html-anchor-exists","settings.json","features"),
    named("x","html-anchor-exists","index.html","bad id"),
    named("x","json-path-equals","config.json","true","__proto__.polluted"),
    named("x","json-path-equals","config.json","true","constructor.prototype"),
    named("x","json-path-equals","config.json","{}","safe"),
    named("x","json-path-equals","config.json","not-json","safe"),
    named("x","json-path-equals","config.json","true","a.b.c.d.e"),
    named("x","execute-code","index.html",""),
  ];
  for(const item of invalid) assert.throws(()=>normalizeDeveloperTestCase(item));
  assert.throws(()=>normalizeDeveloperTestSuite([]),/1–16/);
  assert.throws(()=>normalizeDeveloperTestSuite(Array.from({length:17},(_,i)=>named("n-"+i,"file-exists","index.html"))),/1–16/);
  assert.throws(()=>normalizeDeveloperTestSuite([named("same","file-exists","index.html"),named("same","file-exists","styles.css")]),/Duplicate/);
  assert.equal(TEST_KINDS.length,7);
});

test("portable plans and bounded browser suite persistence validate stored data",()=>{
  const cases=[...defaultDeveloperTests(),named("marker","text-absent","app.js","PRIVATE_EXPECTED")];
  const encoded=exportDeveloperTestSuite(cases);
  assert.equal(JSON.parse(encoded).schema,DEVELOPER_TEST_SUITE_SCHEMA);
  assert.deepEqual(importDeveloperTestSuite(encoded),cases);
  assert.throws(()=>importDeveloperTestSuite("a".repeat(9001)),/9,000/);
  assert.throws(()=>importDeveloperTestSuite(encoded.replace(DEVELOPER_TEST_SUITE_SCHEMA,"wrong")),/Unsupported/);
  assert.deepEqual(readSavedDeveloperTestSuites("bad"),[]);
  assert.deepEqual(readSavedDeveloperTestSuites(JSON.stringify([{projectId:"../secret",tests:cases}])),[]);
  let list=upsertSavedDeveloperTestSuite([],"local-test-1",cases);
  assert.deepEqual(readSavedDeveloperTestSuites(JSON.stringify(list))[0].tests,cases);
  list=upsertSavedDeveloperTestSuite(list,"local-test-1",defaultDeveloperTests());
  assert.equal(list.length,1);
  assert.equal(list[0].tests.length,2);
  for(let i=1;i<5;i++)list=upsertSavedDeveloperTestSuite(list,"project-"+i,defaultDeveloperTests());
  assert.throws(()=>upsertSavedDeveloperTestSuite(list,"project-6",defaultDeveloperTests()),/five/);
});

test("sanitized test report strips literal expectations, test IDs, filenames and source",async()=>{
  const token="VERY_SENSITIVE_LITERAL_334455";
  const tests=[...defaultDeveloperTests(),named("sensitive-private-id","text-absent","app.js",token)];
  const project=editDeveloperFile(starter(),"app.js",'const SECRET="'+token+'";');
  const report=await runDeveloperLocalTests(project,tests);
  const exported=exportDeveloperLocalTestReport(report);
  const value=JSON.parse(exported);
  assert.equal(value.schema,DEVELOPER_TEST_REPORT_SCHEMA);
  assert.equal(value.results.length,3);
  assert.ok(!exported.includes(token));
  assert.ok(!exported.includes("sensitive-private-id"));
  assert.ok(!exported.includes("app.js"));
  assert.ok(!exported.includes("SECRET"));
  assert.throws(()=>exportDeveloperLocalTestReport({schema:"other"}),/Run current/);
});

test("new project lab panel is wired to real checks, stale protection and source-free evidence",()=>{
  const page=readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx",import.meta.url),"utf8");
  const panel=readFileSync(new URL("../src/components/developer/ProjectTestSuitePanel.tsx",import.meta.url),"utf8");
  assert.match(page,/<ProjectTestSuitePanel key=\{project\.id\} project=\{project\} onJump=\{jumpToMatch\}/);
  assert.match(panel,/runDeveloperLocalTests\(project, cases\)/);
  assert.match(panel,/exportDeveloperLocalTestReport\(report\)/);
  assert.match(panel,/localStorage\.setItem\(DEVELOPER_TEST_STORAGE/);
  assert.match(panel,/Project or test plan changed. Test results are stale/);
  assert.match(panel,/Import a test plan JSON/);
  assert.doesNotMatch(panel,/fetch\(|allow-same-origin|eval\(|runPreview\(/);
});
