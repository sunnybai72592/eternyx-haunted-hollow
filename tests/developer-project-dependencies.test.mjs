import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDeveloperProject, addDeveloperFile, editDeveloperFile, removeDeveloperFile,
} from "../src/lib/developerProjectLab.mjs";
import { listDeveloperProjectReferences } from "../src/lib/developerProjectIntegration.mjs";
import {
  DEVELOPER_DEPENDENCY_REPORT_SCHEMA, analyzeDeveloperProjectDependencies, exportDeveloperDependencyReport,
} from "../src/lib/developerProjectDependencies.mjs";

const starter = () => createDeveloperProject("starter", "dependency-36");

test("actual resolved HTML, CSS, JS relationships form a navigable bounded topology", () => {
  let p = starter();
  p = addDeveloperFile(p, "about.html", "<h1>About</h1>");
  p = addDeveloperFile(p, "theme.css", "h1 { color: teal }");
  p = addDeveloperFile(p, "helper.js", "export const helper = true;");
  p = editDeveloperFile(p, "index.html", [
    '<script src="./app.js?edition=1"></script>',
    '<link rel="stylesheet" href="styles.css">',
    '<a href="about.html#bio">About</a>',
  ].join("\n"));
  p = editDeveloperFile(p, "styles.css", 'body {}\n@import "./theme.css";');
  p = editDeveloperFile(p, "app.js", 'const x=1;\nimport { helper } from "./helper.js";');
  const graph = analyzeDeveloperProjectDependencies(p);
  assert.equal(graph.fileCount, 6);
  assert.equal(graph.referenceCount, 5);
  assert.equal(graph.matchedCount, 5);
  assert.equal(graph.unresolvedCount, 0);
  assert.equal(graph.files.find(f => f.name === "app.js").inbound, 1);
  assert.equal(graph.files.find(f => f.name === "styles.css").outbound, 1);
  assert.equal(graph.references.find(f => f.from === "app.js").line, 2);
  assert.deepEqual(graph.unreferenced, []);
  assert.deepEqual(graph.cycles, []);
  assert.equal(graph.impact, null);
  assert.ok(listDeveloperProjectReferences(p).every(ref => !Object.hasOwn(ref, "value")));
});

test("detects only literal CSS or JS cycles, not an HTML link to its own entry", () => {
  let p = starter();
  p = addDeveloperFile(p, "extra.js", 'export { x } from "./app.js";');
  p = addDeveloperFile(p, "theme.css", '@import "styles.css";');
  p = editDeveloperFile(p, "app.js", 'import { x } from "./extra.js";');
  p = editDeveloperFile(p, "styles.css", '@import "./theme.css";');
  p = editDeveloperFile(p, "index.html", '<a href="index.html">Home</a>');
  const report = analyzeDeveloperProjectDependencies(p);
  assert.deepEqual(report.cycles, [
    { kind: "css", files: ["styles.css", "theme.css"] },
    { kind: "js", files: ["app.js", "extra.js"] },
  ]);
  p = editDeveloperFile(p, "app.js", 'import "./app.js";');
  const self = analyzeDeveloperProjectDependencies(p);
  assert.ok(self.cycles.some(c => c.kind === "js" && c.files.length === 1 && c.files[0] === "app.js"));
});

test("unreferenced indicates only no recognized inbound references, never an unused-file claim", () => {
  let p = starter();
  p = addDeveloperFile(p, "notes.md", "not imported");
  const graph = analyzeDeveloperProjectDependencies(p);
  assert.deepEqual(graph.unreferenced, ["app.js", "notes.md", "styles.css"]);
  assert.equal(graph.referenceCount, 0);
  assert.equal(graph.cycles.length, 0);
});

test("broken paths, wrong filename case and unsupported parents never become graph edges", () => {
  let p = starter();
  p = editDeveloperFile(p, "index.html", [
    '<script src="./APP.js"></script>',
    '<script src="../secret.js"></script>',
    '<script src="./not-found.js"></script>',
    '<script src="https://cdn.example.com/tool.js"></script>',
  ].join("\n"));
  const report = analyzeDeveloperProjectDependencies(p);
  assert.equal(report.referenceCount, 3);
  assert.equal(report.matchedCount, 0);
  assert.equal(report.unresolvedCount, 3);
  assert.deepEqual(report.references.map(r => r.reason),
    ["reference-case-mismatch", "unsupported-local-path", "missing-local-reference"]);
  assert.ok(report.references.every(r => r.to === null));
  assert.ok(!JSON.stringify(report.references).includes("secret.js"));
});

test("saved baseline finds transitive dependents via current and historical references", () => {
  let before = starter();
  before = addDeveloperFile(before, "helper.js", "export const value=1;");
  before = editDeveloperFile(before, "index.html", '<script src="./app.js"></script>');
  before = editDeveloperFile(before, "app.js", 'import { value } from "./helper.js";');
  const after = editDeveloperFile(before, "helper.js", "export const value=2;");
  const impact = analyzeDeveloperProjectDependencies(after, before).impact;
  assert.deepEqual(impact.changed, ["helper.js"]);
  assert.deepEqual(impact.affected, ["app.js", "index.html"]);
  const removed = removeDeveloperFile(before, "helper.js");
  const gone = analyzeDeveloperProjectDependencies(removed, before);
  assert.deepEqual(gone.impact.changed, ["helper.js"]);
  assert.deepEqual(gone.impact.affected, ["app.js", "index.html"]);
  assert.equal(gone.unresolvedCount, 1);
  assert.deepEqual(analyzeDeveloperProjectDependencies(before, before).impact, { changed: [], affected: [] });
});

test("change impact is case-insensitive, cycle-safe and never conflates unused static scans with runtime", () => {
  let p = starter();
  p = addDeveloperFile(p, "module.js", 'import "./app.js";');
  p = editDeveloperFile(p, "app.js", 'import "./module.js";');
  const changed = editDeveloperFile(p, "module.js", 'import "./app.js";\n// edited');
  const report = analyzeDeveloperProjectDependencies(changed, p);
  assert.deepEqual(report.impact.changed, ["module.js"]);
  assert.deepEqual(report.impact.affected, ["app.js"]);
  assert.equal(report.cycles.length, 1);
});

test("summary export excludes names, raw source and private reference strings", () => {
  let p = starter();
  p = addDeveloperFile(p, "secret-name.js", 'import "./missing-PRIVATE-777.js";');
  p = editDeveloperFile(p, "app.js", 'import "./secret-name.js"; // TOKEN_9988');
  const raw = exportDeveloperDependencyReport(p, starter());
  const data = JSON.parse(raw);
  assert.equal(data.schema, DEVELOPER_DEPENDENCY_REPORT_SCHEMA);
  assert.equal(data.fileCount, 4);
  assert.equal(data.referenceCount, 2);
  assert.equal(data.matchedCount, 1);
  assert.equal(data.unresolvedCount, 1);
  assert.ok(data.impact);
  for (const secret of ["secret-name", "missing-PRIVATE-777", "TOKEN_9988",
    "index.html", "app.js", "line", "<script"]) {
    assert.ok(!raw.includes(secret), "leaked: " + secret);
  }
  assert.deepEqual(Object.keys(data.impact).sort(), ["affectedCount", "changedCount"]);
});

test("actual UI exports metadata, filters per file, provides source jump and preserves existing Lab features", () => {
  const panel = readFileSync(new URL("../src/components/developer/ProjectDependencyPanel.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");
  assert.match(page, /<ProjectDependencyPanel project=\{project\} baseline=\{savedBaseline\} onJump=\{jumpToMatch\}/);
  assert.match(panel, /analyzeDeveloperProjectDependencies\(project, baseline\)/);
  assert.match(panel, /exportDeveloperDependencyReport\(project, baseline\)/);
  assert.match(panel, /developer-dependency-focus/);
  assert.match(panel, /Open source/);
  assert.match(panel, /developerLinePosition/);
  assert.match(panel, /Possible literal import cycles/);
  assert.match(panel, /filename-free graph summary/);
  assert.doesNotMatch(panel, /\bfetch\(|eval\(|allow-same-origin|runPreview\(/);
});
