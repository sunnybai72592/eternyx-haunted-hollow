import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  editorCursorInfo, editorTabChange, formatProjectJson, normalizeProjectWhitespace,
  duplicateDeveloperFile, filterProjectFilenames, validateProjectJavascript, exportJavascriptValidationReport,
} from "../src/lib/developerEditorUtils.mjs";
import { createDeveloperProject, addDeveloperFile, editDeveloperFile } from "../src/lib/developerProjectLab.mjs";
const page = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");

test("status bar reports real line, column, file size and selected characters", () => {
  assert.deepEqual(editorCursorInfo("a\nhello", 4, 6), { line: 2, column: 3, selected: 2, lines: 2, chars: 7 });
  assert.deepEqual(editorCursorInfo("", 0), { line: 1, column: 1, selected: 0, lines: 1, chars: 0 });
});

test("Tab inserts spaces; Shift+Tab removes indent with selection positions", () => {
  assert.deepEqual(editorTabChange("abc", 1, 1), { value:"a  bc", start:3, end:3 });
  assert.deepEqual(editorTabChange("  abc", 4, 4, true), {value:"abc", start:2, end:2});
  assert.deepEqual(editorTabChange("\tabc", 3, 3, true), {value:"abc", start:2, end:2});
  assert.deepEqual(editorTabChange("abc", 0, 0, true), {value:"abc", start:0, end:0});
  const changed=editorTabChange("alpha\nbeta\ngamma", 0, 10);
  assert.equal(changed.value,"  alpha\n  beta\ngamma");
  assert.equal(changed.start,2);
  assert.equal(changed.end,14);
  const restored=editorTabChange(changed.value, 2, 14, true);
  assert.equal(restored.value,"alpha\nbeta\ngamma");
  assert.throws(()=>editorTabChange("x".repeat(20000),0,0),/20,000/);
});

test("format JSON and normalize line endings are explicit bounded pure transformations", () => {
  assert.equal(formatProjectJson('{"a":2}'),'{\n  "a": 2\n}\n');
  assert.throws(()=>formatProjectJson("{oops"),/not valid JSON/);
  assert.throws(()=>formatProjectJson(JSON.stringify({str:"x".repeat(19996)})),/20,000|per-file/);
  assert.equal(normalizeProjectWhitespace(" a \r\n b\t\r", {trimTrailing:true})," a\n b\n");
  assert.equal(normalizeProjectWhitespace("a  \r\n"),"a  \n");
});

test("duplicate selected file with unique, bounded names and working contents", () => {
  let p=createDeveloperProject("starter");
  const first=duplicateDeveloperFile(p,"app.js");
  assert.equal(first.name,"app-copy.js");
  assert.equal(first.project.files.find(f=>f.name===first.name).content,p.files.find(f=>f.name==="app.js").content);
  p=first.project;
  assert.equal(duplicateDeveloperFile(p,"app.js").name,"app-copy-2.js");
  assert.throws(()=>duplicateDeveloperFile(p,"missing.js"),/File not found/);
  assert.deepEqual(filterProjectFilenames(p,"APP"),["app.js","app-copy.js"]);
  p=editDeveloperFile(p,"app.js","x");
  assert.equal(filterProjectFilenames(p,"not-exists").length,0);
});

test("actual TypeScript JS parser detects syntax but never executes user JS", async () => {
  let p=createDeveloperProject("starter");
  p=editDeveloperFile(p,"app.js", 'const secret = "PRIVATE_MARKER";\nfunction bad( {\n');
  const checked=await validateProjectJavascript(p);
  assert.equal(checked.filesChecked,1);
  assert.ok(checked.issues.length>0);
  assert.equal(checked.issues[0].file,"app.js");
  assert.equal(checked.issues[0].line>=1,true);
  assert.equal(JSON.stringify(checked.issues).includes("PRIVATE_MARKER"),false);
  const report=JSON.parse(await exportJavascriptValidationReport(p));
  assert.equal(report.schema,"eternyx-javascript-parser-report-v1");
  assert.equal(report.filesChecked,1);
  assert.equal(JSON.stringify(report).includes("PRIVATE_MARKER"),false);
  assert.equal(JSON.stringify(report).includes("function bad"),false);
  const clean=await validateProjectJavascript(createDeveloperProject("starter"));
  assert.equal(clean.issues.length,0);
});

test("UI enables quick-open, keyboard save/preview, indentation, formatting, duplicate, syntax report",()=>{
  assert.match(page,/onKeyDown=\{handleEditorKeyDown\}/);
  assert.match(page,/editorTabChange/);
  assert.match(page,/formatProjectJson/);
  assert.match(page,/duplicateDeveloperFile/);
  assert.match(page,/exportJavascriptValidationReport/);
  assert.match(page,/filterProjectFilenames/);
  assert.match(page,/Ctrl\+S/);
  assert.match(page,/event\.key\.toLowerCase\(\) === "p"/);
  assert.match(page,/setSelectionRange\(/);
  assert.match(page,/onClick=\{runPreview\}/);
});
