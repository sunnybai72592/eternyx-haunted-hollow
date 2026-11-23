import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeveloperProject, addDeveloperFile, editDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import { DEVELOPER_HTML_QUALITY_KINDS, DEVELOPER_CSS_QUALITY_KINDS,
  isSafeDeveloperCssSelector, recommendedDeveloperQualityTests,
} from "../src/lib/developerProjectQuality.mjs";
import { TEST_KINDS, defaultDeveloperTests, normalizeDeveloperTestCase,
  normalizeDeveloperTestSuite, runDeveloperLocalTests, exportDeveloperLocalTestReport,
} from "../src/lib/developerProjectTests.mjs";

const testCase=(id,kind,file,expected="",path="")=>({id,kind,file,expected,path});
const starter=()=>createDeveloperProject("starter","quality-review");

test("recommended checks are real per-source assertions, opt-in and duplicate-aware",async()=>{
  const original=defaultDeveloperTests();
  assert.equal(original.length,2);
  const suggestions=recommendedDeveloperQualityTests(starter(),original);
  assert.equal(suggestions.length,6);
  assert.deepEqual(suggestions.map(x=>x.kind),DEVELOPER_HTML_QUALITY_KINDS);
  assert.ok(suggestions.every(x=>x.file==="index.html"));
  const combined=normalizeDeveloperTestSuite([...original,...suggestions]);
  assert.equal(combined.length,8);
  assert.deepEqual(recommendedDeveloperQualityTests(starter(),combined),[]);
  const report=await runDeveloperLocalTests(starter(),combined);
  assert.equal(report.passed,8);
  assert.equal(report.failed,0);
  assert.equal(report.preflightPassed,true);
  assert.equal(report.status,"passed");
  assert.equal(original.length,2);
});

test("broken HTML fragments, image alt, duplicates, buttons, labels and handlers really fail",async()=>{
  const source=[
    '<main>',
    '<a href="#missing-target">navigate</a>',
    '<img src="example.png">',
    '<div id="same"></div><span id="same"></span>',
    '<button><span></span></button>',
    '<label for="missing-field">Name</label>',
    '<button onclick="doSomething()">Action</button>',
    '</main>',
  ].join("\n");
  const project=editDeveloperFile(starter(),"index.html",source);
  const suggestions=recommendedDeveloperQualityTests(project);
  const result=await runDeveloperLocalTests(project,suggestions);
  assert.deepEqual(result.results.map(x=>x.reason),[
    "unresolved-local-anchor","image-missing-alt","duplicate-html-id",
    "button-missing-text-or-aria-label","label-target-missing","inline-handler-detected",
  ]);
  assert.deepEqual(result.results.map(x=>x.line),[2,3,4,5,6,7]);
  assert.equal(result.failed,6);
  assert.equal(result.status,"review-required");
  assert.ok(!exportDeveloperLocalTestReport(result).includes("missing-target"));
});

test("valid quoted ids, decorative alt, aria-label and explicit labels pass",async()=>{
  const html=[
    '<main id="first">',
    '<a href="#first">top</a>',
    '<img src="x.png" alt="">',
    '<button aria-label="Open menu"><svg></svg></button>',
    '<input id="field"><label for="field">Field</label>',
    '</main>',
  ].join("\n");
  const project=editDeveloperFile(starter(),"index.html",html);
  const result=await runDeveloperLocalTests(project,recommendedDeveloperQualityTests(project));
  assert.equal(result.failed,0);
  assert.equal(result.passed,6);
  assert.equal(result.status,"passed");
});

test("literal CSS selector checks inspect actual CSS rules and reject invented selectors",async()=>{
  let project=starter();
  const cases=[
    testCase("one","css-selector-exists","styles.css","body"),
    testCase("two","css-selector-exists","styles.css",".panel"),
    testCase("three","css-selector-exists","styles.css",".not-present"),
  ];
  const result=await runDeveloperLocalTests(project,cases);
  assert.deepEqual(result.results.map(x=>x.reason),[
    "css-selector-found","css-selector-found","css-selector-not-found",
  ]);
  assert.equal(result.failed,1);
  project=editDeveloperFile(project,"styles.css",".card, .panel { color: red; }");
  const other=await runDeveloperLocalTests(project,[testCase("one","css-selector-exists","styles.css",".panel")]);
  assert.equal(other.failed,0);
  assert.ok(isSafeDeveloperCssSelector("main > .card"));
  assert.equal(isSafeDeveloperCssSelector("};fetch('/secret')"),false);
  assert.equal(isSafeDeveloperCssSelector("body{background:blue}"),false);
  assert.throws(()=>normalizeDeveloperTestCase(testCase("bad","css-selector-exists","app.js",".panel")),/CSS selector/);
  assert.throws(()=>normalizeDeveloperTestCase(testCase("bad","css-selector-exists","styles.css","")) ,/CSS selector/);
});

test("JSON array length checks handle arrays, mismatches, non-arrays and missing paths",async()=>{
  const project=addDeveloperFile(starter(),"config.json",
    '{"items":[1,2,3],"nested":{"empty":[]},"object":{"length":3}}');
  const cases=[
    testCase("three","json-array-length","config.json","3","items"),
    testCase("zero","json-array-length","config.json","0","nested.empty"),
    testCase("wrong","json-array-length","config.json","2","items"),
    testCase("not-array","json-array-length","config.json","3","object"),
    testCase("missing","json-array-length","config.json","0","nested.absent"),
  ];
  const report=await runDeveloperLocalTests(project,cases);
  assert.equal(report.passed,2);
  assert.equal(report.failed,3);
  assert.deepEqual(report.results.map(x=>x.reason),[
    "json-array-length-matched","json-array-length-matched",
    "json-array-length-different","json-value-not-array","json-path-missing",
  ]);
  assert.throws(()=>normalizeDeveloperTestCase(testCase("invalid","json-array-length","config.json","-1","items")),/array length/);
  assert.throws(()=>normalizeDeveloperTestCase(testCase("invalid","json-array-length","config.json","3","constructor.prototype")),/JSON path/);
  assert.throws(()=>normalizeDeveloperTestCase(testCase("invalid","json-array-length","config.json","3.2","items")),/array length/);
});

test("HTML rules cannot inspect arbitrary files, and existing saved plans remain compatible",()=>{
  for(const kind of DEVELOPER_HTML_QUALITY_KINDS){
    assert.throws(()=>normalizeDeveloperTestCase(testCase("bad",kind,"app.js")),/HTML quality/);
    assert.doesNotThrow(()=>normalizeDeveloperTestCase(testCase("ok",kind,"index.html")));
  }
  assert.equal(DEVELOPER_CSS_QUALITY_KINDS.length,1);
  assert.equal(TEST_KINDS.length,15);
  assert.deepEqual(defaultDeveloperTests().map(x=>x.kind),["file-exists","file-nonempty"]);
  assert.equal(recommendedDeveloperQualityTests(createDeveloperProject("blank","quality-review"),[]).length,6);
  assert.equal(recommendedDeveloperQualityTests({files:[{name:"main.html",content:"x"}]},[]).length,0);
});

test("source-free exported reports exclude private literals, filenames and IDs",async()=>{
  const token="SENTINEL_PRIVATE_LITERAL_997100";
  const bad=editDeveloperFile(starter(),"index.html",'<a href="#'+token+'">'+token+'</a>');
  const cases=[...recommendedDeveloperQualityTests(bad),
    testCase("private-id","text-absent","index.html",token)];
  const report=await runDeveloperLocalTests(bad,cases);
  const exported=exportDeveloperLocalTestReport(report);
  const json=JSON.parse(exported);
  assert.ok(json.failed>=2);
  assert.ok(!exported.includes(token));
  assert.ok(!exported.includes("index.html"));
  assert.ok(!exported.includes("private-id"));
  assert.deepEqual(Object.keys(json.results[0]).sort(),["index","kind","line","reason","status"]);
  assert.ok(!exported.includes("href"));
});

test("test panel exposes explicit presets, JSON array paths and failed-only filter",()=>{
  const ui=readFileSync(new URL("../src/components/developer/ProjectTestSuitePanel.tsx",import.meta.url),"utf8");
  const runner=readFileSync(new URL("../src/lib/developerProjectTests.mjs",import.meta.url),"utf8");
  assert.match(ui,/Add HTML quality checks/);
  assert.match(ui,/recommendedDeveloperQualityTests\(project, cases\)/);
  assert.match(ui,/normalizeDeveloperTestSuite\(\[\.\.\.cases, \.\.\.suggested\]\)/);
  assert.match(ui,/kind === "json-array-length"/);
  assert.match(ui,/kind === "css-selector-exists"/);
  assert.match(ui,/Show failed only/);
  assert.match(ui,/showFailuresOnly \|\| result\.status === "failed"/);
  assert.match(runner,/runDeveloperPreflight\(valid\)/);
  assert.match(runner,/checkDeveloperHtmlQuality\(file\.content/);
  assert.match(runner,/checkDeveloperCssSelector\(file\.content/);
  assert.doesNotMatch(ui,/allow-same-origin|eval\(|fetch\(|runPreview\(/);
});
