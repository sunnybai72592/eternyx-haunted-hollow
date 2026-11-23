import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDeveloperFile, createDeveloperProject, editDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import {
  DEVELOPER_INTEGRATION_KINDS, checkDeveloperProjectIntegration, summarizeDeveloperProjectIntegration,
  recommendedDeveloperIntegrationTests, developerIntegrationAdvice,
} from "../src/lib/developerProjectIntegration.mjs";
import {
  TEST_KINDS, normalizeDeveloperTestCase, defaultDeveloperTests,
  runDeveloperLocalTests, exportDeveloperLocalTestReport, exportDeveloperTestSuite, importDeveloperTestSuite,
} from "../src/lib/developerProjectTests.mjs";
import { inspectDeveloperProject, exportDeveloperInspectionReport } from "../src/lib/developerProjectInspection.mjs";

const named = (id, kind, file) => ({ id, kind, file, expected: "", path: "" });
const starter = () => createDeveloperProject("starter", "integration-35");

test("three opt-in real integration checks work on the existing starter without executing source", async () => {
  const p = starter();
  const suggested = recommendedDeveloperIntegrationTests(p);
  assert.deepEqual(suggested.map(c => c.kind), DEVELOPER_INTEGRATION_KINDS);
  assert.deepEqual(suggested.map(c => c.file), ["index.html", "styles.css", "app.js"]);
  assert.equal(TEST_KINDS.length, 18);
  const report = await runDeveloperLocalTests(p, suggested);
  assert.equal(report.failed, 0);
  assert.deepEqual(report.results.map(r => r.reason), ["no-static-references", "no-static-references", "no-static-references"]);
  assert.equal(report.status, "passed");
  assert.deepEqual(recommendedDeveloperIntegrationTests(p, suggested), []);
  assert.equal(defaultDeveloperTests().length, 2);
});

test("actual cross-file HTML, CSS and JS references fail at source lines when targets are absent", async () => {
  let p = starter();
  p = editDeveloperFile(p, "index.html", [
    '<script src="./missing.js"></script>',
    '<link href="styles.css" rel="stylesheet">',
    '<a href="missing.html#intro">Open</a>',
  ].join("\n"));
  p = editDeveloperFile(p, "styles.css", "body{}\n@import './theme.css';");
  p = editDeveloperFile(p, "app.js", 'const x=1;\nimport "./module.js";');
  const tests = recommendedDeveloperIntegrationTests(p);
  const report = await runDeveloperLocalTests(p, tests);
  assert.deepEqual(report.results.map(r => r.reason), [
    "missing-local-reference", "missing-local-reference", "missing-local-reference",
  ]);
  assert.deepEqual(report.results.map(r => r.line), [1, 2, 2]);
  assert.equal(report.failed, 3);
  assert.equal(report.status, "review-required");
  const summary = summarizeDeveloperProjectIntegration(p);
  assert.equal(summary.checked, 5);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.unresolved, 4);
  assert.equal(summary.findings.length, 4);
  assert.ok(inspectDeveloperProject(p).some(f => f.rule === "missing-local-reference"));
});

test("fixed local files resolve and absolute/parent paths or wrong filename case fail", async () => {
  let p = starter();
  p = addDeveloperFile(p, "about.html", "<main>About</main>");
  p = addDeveloperFile(p, "theme.css", "h1 {color:blue}");
  p = addDeveloperFile(p, "module.js", "export const value=1;");
  p = editDeveloperFile(p, "index.html", '<script src="./app.js?rev=3"></script>\n<a href="about.html#first">About</a>');
  p = editDeveloperFile(p, "styles.css", '@import url("./theme.css");');
  p = editDeveloperFile(p, "app.js", 'import { value } from "./module.js";');
  let report = await runDeveloperLocalTests(p, recommendedDeveloperIntegrationTests(p));
  assert.equal(report.failed, 0);
  assert.equal(summarizeDeveloperProjectIntegration(p).resolved, 4);
  p = editDeveloperFile(p, "index.html", '<script src="./APP.js"></script>');
  assert.equal(checkDeveloperProjectIntegration(p, "html-local-files-resolve", "index.html").reason, "reference-case-mismatch");
  p = editDeveloperFile(p, "index.html", '<script src="../app.js"></script>');
  assert.equal(checkDeveloperProjectIntegration(p, "html-local-files-resolve", "index.html").reason, "unsupported-local-path");
  p = editDeveloperFile(p, "app.js", 'import("../module.js")');
  assert.equal(checkDeveloperProjectIntegration(p, "js-local-imports-resolve", "app.js").reason, "unsupported-local-path");
});

test("external URLs, in-page hashes and bare npm imports are not misreported as local project files", () => {
  let p = starter();
  p = editDeveloperFile(p, "index.html", [
    '<a href="#section">Section</a>',
    '<a href="https://site.test/guide.html">External</a>',
    '<script src="https://cdn.site.test/tool.js"></script>',
  ].join("\n"));
  p = editDeveloperFile(p, "styles.css", '@import "https://cdn.site.test/main.css";');
  p = editDeveloperFile(p, "app.js", 'import { thing } from "some-package";');
  const summary = summarizeDeveloperProjectIntegration(p);
  assert.equal(summary.checked, 0);
  assert.equal(summary.unresolved, 0);
});

test("assertions only accept matching project file kinds and imported old plans are untouched", () => {
  for (const [kind, filename] of [
    ["html-local-files-resolve", "app.js"],
    ["css-local-files-resolve", "index.html"],
    ["js-local-imports-resolve", "styles.css"],
  ]) {
    assert.throws(() => normalizeDeveloperTestCase(named("wrong", kind, filename)), /Integration checks require/);
  }
  const original = defaultDeveloperTests();
  assert.deepEqual(importDeveloperTestSuite(exportDeveloperTestSuite(original)), original);
  const p = addDeveloperFile(starter(), "second.js", 'import "./app.js";');
  assert.equal(recommendedDeveloperIntegrationTests(p).length, 4);
  const existing = [named("integration-1", "file-exists", "index.html")];
  const suggestions = recommendedDeveloperIntegrationTests(p, existing);
  assert.equal(new Set(suggestions.map(c => c.id)).size, suggestions.length);
  assert.ok(suggestions.every(c => c.id !== "integration-1"));
  assert.match(developerIntegrationAdvice("missing-local-reference"), /Add the named local file/);
});

test("source-free exports and diagnostics never serialize private reference literals", async () => {
  const privateName = "PRIVATE_424242.js";
  const p = editDeveloperFile(starter(), "index.html", '<script src="./' + privateName + '"></script>');
  const checks = [named("hidden-plan-id", "html-local-files-resolve", "index.html")];
  const result = await runDeveloperLocalTests(p, checks);
  const evidence = exportDeveloperLocalTestReport(result);
  const inspection = exportDeveloperInspectionReport(p);
  for (const exported of [evidence, inspection]) {
    assert.ok(!exported.includes(privateName));
    assert.ok(!exported.includes("<script"));
  }
  assert.ok(!evidence.includes("hidden-plan-id"));
  assert.ok(!evidence.includes("index.html"));
  assert.ok(!inspection.includes("PRIVATE_424242"));
  assert.match(inspection, /missing-local-reference/);
});

test("Project Lab surfaces failure guidance, opt-in presets, scan totals and clickable source locations", () => {
  const suite = readFileSync(new URL("../src/components/developer/ProjectTestSuitePanel.tsx", import.meta.url), "utf8");
  const inspection = readFileSync(new URL("../src/components/developer/ProjectInspectionPanel.tsx", import.meta.url), "utf8");
  assert.match(suite, /Add integration checks/);
  assert.match(suite, /recommendedDeveloperIntegrationTests\(project, cases\)/);
  assert.match(suite, /Next step:/);
  assert.match(suite, /Open test location/);
  assert.match(inspection, /Cross-file references:/);
  assert.match(inspection, /summarizeDeveloperProjectIntegration\(project\)/);
  assert.match(inspection, /Open location/);
  assert.doesNotMatch(suite, /allow-same-origin|eval\(|fetch\(|runPreview\(/);
});
