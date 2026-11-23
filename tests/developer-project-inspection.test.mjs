import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROJECT_INSPECTION_REPORT_SCHEMA, searchDeveloperFiles, replaceDeveloperFileText,
  compareDeveloperProjectFiles, inspectDeveloperProject, exportDeveloperInspectionReport,
} from "../src/lib/developerProjectInspection.mjs";
import { createDeveloperProject, addDeveloperFile, editDeveloperFile, renameDeveloperFile, removeDeveloperFile } from "../src/lib/developerProjectLab.mjs";
const page = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/developer/ProjectInspectionPanel.tsx", import.meta.url), "utf8");

test("cross-file search returns actual filenames, lines, columns and bounded matches", () => {
  let project = createDeveloperProject("blank", "p");
  project = editDeveloperFile(project, "index.html", "hello\nhello world\nHELLO");
  project = addDeveloperFile(project, "readme.md", "hello project");
  const found = searchDeveloperFiles(project, "hello");
  assert.equal(found.length, 4);
  assert.deepEqual(found[1], {file:"index.html", index:6, length:5, line:2, column:1});
  assert.deepEqual(searchDeveloperFiles(project, "hello", {caseSensitive:true}).length, 3);
  assert.deepEqual(searchDeveloperFiles(project, "").length, 0);
  assert.equal(searchDeveloperFiles(editDeveloperFile(project,"readme.md","a".repeat(10000)),"a").length,120);
});

test("replacement is literal, case-sensitive, limited and bound to active file", () => {
  const project = editDeveloperFile(createDeveloperProject("blank"),"index.html","a.a.a");
  const once = replaceDeveloperFileText(project,"index.html",".","_",false);
  assert.equal(once.count,1);
  assert.equal(once.project.files[0].content,"a_a.a");
  const all = replaceDeveloperFileText(project,"index.html",".","_",true);
  assert.equal(all.count,2);
  assert.equal(all.project.files[0].content,"a_a_a");
  assert.equal(replaceDeveloperFileText(project,"index.html","missing","x").count,0);
  assert.throws(() => replaceDeveloperFileText(project,"index.html","","x"), /literal characters/);
  assert.throws(() => replaceDeveloperFileText(project,"index.html","a","x".repeat(2001)), /2,000/);
  assert.throws(() => replaceDeveloperFileText(project,"missing.md","a","x"), /File not found/);
  assert.throws(() => replaceDeveloperFileText(editDeveloperFile(project,"index.html","x".repeat(1000)),"index.html","x","y",true), /200 matches/);
});

test("saved-vs-working diff recognizes modified, added, deleted files without source", () => {
  const baseline = createDeveloperProject("starter");
  let current = editDeveloperFile(baseline, "app.js", "console.log(1)");
  current = renameDeveloperFile(current, "styles.css", "theme.css");
  current = addDeveloperFile(current, "notes.md", "Private notes");
  current = removeDeveloperFile(current, "index.html");
  assert.deepEqual(compareDeveloperProjectFiles(current, baseline), {
    added: ["theme.css", "notes.md"], modified: ["app.js"], deleted: ["index.html", "styles.css"], unchanged: [],
  });
  assert.equal(compareDeveloperProjectFiles(current, null).added.length,3);
});

test("project diagnostics report real JSON errors, duplicate IDs, broken anchors, missing alt and blocked resources", () => {
  let project = createDeveloperProject("blank");
  project = editDeveloperFile(project, "index.html", '<a href="#none">Go</a><div id="same"></div><div id="same"></div><img src="x"><script src="lib.js"></script><link rel="stylesheet" href="x.css">');
  project = addDeveloperFile(project, "data.json", "{bad syntax SECRETVALUE");
  project = addDeveloperFile(project, "style.css", '@import "https://example.com";');
  project = addDeveloperFile(project, "logic.js", 'fetch("/private");');
  const issues = inspectDeveloperProject(project);
  const rules = issues.map(item => item.rule);
  for (const rule of ["json-syntax","duplicate-id","missing-anchor","image-alt","blocked-script-src","blocked-stylesheet-link","blocked-css-import","blocked-network"]) assert.ok(rules.includes(rule),rule);
  assert.equal(JSON.stringify(issues).includes("SECRETVALUE"),false);
});

test("safe starter passes extra diagnostics and scope avoids pretending to compile JS", () => {
  const starter = createDeveloperProject("starter");
  assert.deepEqual(inspectDeveloperProject(starter),[]);
  const missing = renameDeveloperFile(starter, "index.html", "home.html");
  assert.ok(inspectDeveloperProject(missing).some(i=>i.rule==="missing-entry"));
});

test("report includes only sanitized structural diagnostics, never source code or match strings", () => {
  let project = createDeveloperProject("blank", "p");
  project = editDeveloperFile(project,"index.html",'<div id="duplicate"></div><div id="duplicate"></div><!-- SECRET_PASSWORD_4234 -->');
  const report = JSON.parse(exportDeveloperInspectionReport(project, [{message:"SECRET_PASSWORD_4234"}]));
  assert.equal(report.schema,PROJECT_INSPECTION_REPORT_SCHEMA);
  assert.equal(report.fileCount,1);
  assert.equal(report.counts.warnings,1);
  assert.equal(report.files[0].name,"index.html");
  assert.equal(JSON.stringify(report).includes("SECRET_PASSWORD_4234"),false);
  assert.equal(JSON.stringify(report).includes("duplicate"),false);
});

test("UI enables jump-to-text, deliberate restore-backed replace and manual report export", () => {
  assert.match(page, /<ProjectInspectionPanel/);
  assert.match(page, /ref=\{editorRef\}/);
  assert.match(page, /setSelectionRange\(/);
  assert.match(page, /replaceDeveloperFileText/);
  assert.match(page, /commit\(\(\) => result\.project\)/);
  assert.match(panel, /searchDeveloperFiles/);
  assert.match(panel, /Export inspection report/);
  assert.match(panel, /heuristic checks/i);
});
