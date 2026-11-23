import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROJECT_SCHEMA, MAX_PROJECT_FILES, MAX_SAVED_PROJECTS, addDeveloperFile,
  checkDeveloperFileName, checkDeveloperProject, createDeveloperProject,
  editDeveloperFile, exportDeveloperProject, importDeveloperProject,
  normalizeDeveloperProject, normalizeSavedDeveloperProjects,
  previewDeveloperProject, removeDeveloperFile, renameDeveloperFile,
  saveDeveloperProject,
} from "../src/lib/developerProjectLab.mjs";
import { developerTools } from "../src/lib/developerStudioCatalog.mjs";
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");

test("project route and command-center entry are linked", () => {
  assert.match(app, /path="\/developer-studio\/project-lab"/);
  assert.match(app, /DeveloperProjectLab = lazy/);
  const tool = developerTools.find((item) => item.id === "project-lab");
  assert.equal(tool?.mode, "local");
  assert.equal(tool?.route, "/developer-studio/project-lab");
});

test("starter creates real named HTML CSS and JS files", () => {
  const starter = createDeveloperProject("starter", "test-id");
  assert.deepEqual(starter.files.map((file) => file.name), ["index.html", "styles.css", "app.js"]);
  assert.ok(starter.files.find((f) => f.name === "app.js").content.includes("addEventListener"));
  assert.equal(createDeveloperProject("blank", "test-id").files.length, 1);
  assert.throws(() => createDeveloperProject("other"), /Unknown/);
});

test("validated multi-file editing, rename and delete enforce unique safe names", () => {
  let project = createDeveloperProject("starter", "test-id");
  project = addDeveloperFile(project, "app.json", '{"ok":true}');
  project = editDeveloperFile(project, "app.json", '{"ok":false}');
  project = renameDeveloperFile(project, "app.json", "config.json");
  assert.equal(project.files.at(-1).content, '{"ok":false}');
  project = removeDeveloperFile(project, "config.json");
  assert.equal(project.files.length, 3);
  assert.throws(() => addDeveloperFile(project, "../config.js"), /File names/);
  assert.throws(() => addDeveloperFile(project, "APP.JS"), /Duplicate/);
  assert.throws(() => editDeveloperFile(project, "missing.js", "x"), /not found/);
  assert.throws(() => removeDeveloperFile(createDeveloperProject("blank"), "index.html"), /at least one/);
  assert.throws(() => checkProjectFileName("folder/test.js"), /File names/);
  assert.throws(() => editDeveloperFile(project, "app.js", "x".repeat(20001)), /20,000/);
});

test("preview preserves restrictive existing labs CSP and opaque origin requirement", () => {
  const project = createDeveloperProject("starter");
  const srcdoc = previewDeveloperProject(project);
  assert.match(srcdoc, /Content-Security-Policy/);
  assert.match(srcdoc, /connect-src 'none'/);
  assert.match(srcdoc, /form-action 'none'/);
  assert.match(srcdoc, /worker-src 'none'/);
  assert.match(srcdoc, /Hello from the isolated preview!/);
  assert.match(studio, /sandbox="allow-scripts"/);
  assert.doesNotMatch(studio, /allow-same-origin|allow-top-navigation|allow-forms/);
  assert.match(studio, /onClick=\{runPreview\}/);
  assert.match(studio, /previewHtml \? <iframe/);
  assert.throws(() => previewDeveloperProject(renameDeveloperFile(project, "index.html", "other.html")), /Create index.html/);
});

test("real shape and JSON syntax diagnostics do not claim compilation", () => {
  let project = addDeveloperFile(createDeveloperProject("blank"), "data.json", "{broken");
  assert.ok(checkDeveloperProject(project).some((item) => item.message.includes("Invalid JSON")));
  project = editDeveloperFile(project, "data.json", '{"good":true}');
  assert.ok(!checkDeveloperProject(project).some((item) => item.level === "error"));
  project = renameDeveloperFile(project, "index.html", "home.html");
  assert.ok(checkDeveloperProject(project).some((item) => item.level === "error"));
  assert.match(studio, /do not compile JavaScript/);
});

test("versioned export/import roundtrips exact source without autoexecution", () => {
  const p = createDeveloperProject("starter", "id-1");
  const raw = exportDeveloperProject(p);
  const payload = JSON.parse(raw);
  assert.equal(payload.schema, PROJECT_SCHEMA);
  assert.equal(payload.id, undefined);
  const imported = importDeveloperProject(raw, "new-id");
  assert.equal(imported.id, "new-id");
  assert.deepEqual(imported.files, p.files);
  assert.throws(() => importDeveloperProject('{"schema":"wrong","files":[]}', "x"), /Unsupported/);
  assert.throws(() => importDeveloperProject("not-json", "x"), /not valid JSON/);
  assert.throws(() => importDeveloperProject("x".repeat(160001), "x"), /too large/);
});

test("saved browser projects remain bounded and reject corrupted data", () => {
  const originals = Array.from({ length: MAX_SAVED_PROJECTS }, (_, i) => createDeveloperProject("blank", "p" + i));
  let saved = [];
  for (const project of originals) saved = saveDeveloperProject(saved, project);
  assert.equal(saved.length, MAX_SAVED_PROJECTS);
  assert.throws(() => saveDeveloperProject(saved, createDeveloperProject("blank", "overflow")), /Maximum five/);
  const updated = { ...originals[0], name: "Updated" };
  saved = saveDeveloperProject(saved, updated);
  assert.equal(saved.find((item) => item.id === updated.id).name, "Updated");
  assert.equal(normalizeSavedDeveloperProjects([{}, ...saved]).length, MAX_SAVED_PROJECTS - 1);
  assert.throws(() => normalizeDeveloperProject({name:"X",files:[]}), /1–12/);
  assert.equal(MAX_PROJECT_FILES, 12);
  assert.match(studio, /localStorage\.setItem\(PROJECT_STORAGE_KEY/);
});

test("destructive replacement prompts on dirty changes and checkpoint restores are user driven", () => {
  assert.match(studio, /window\.confirm\("You have unsaved project changes/);
  assert.match(studio, /setCheckpoints\(\(items\) => \[\.\.\.items, project\]\.slice\(-5\)/);
  assert.match(studio, /setPreviewHtml\(null\)/);
});
