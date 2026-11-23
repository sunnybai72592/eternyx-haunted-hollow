import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeveloperProject, editDeveloperFile, addDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import {
  MAX_EDITOR_UNDO, DEVELOPER_REVISION_REPORT_SCHEMA, createDeveloperEditHistory,
  developerEditHistoryCounts, editDeveloperWithHistory, stepDeveloperEditHistory,
  inspectDeveloperRevision, exportDeveloperRevisionReport,
} from "../src/lib/developerRevisionTools.mjs";

const project=()=>createDeveloperProject("starter","project-3-2");
const find=(p,n)=>p.files.find(f=>f.name===n).content;

test("per-file undo and redo restore actual edits, without touching unrelated source",()=>{
  const start=project();
  let state=createDeveloperEditHistory(start.id), current=start;
  const first=editDeveloperWithHistory(state,current,"app.js","const first=1;");
  state=first.history;current=first.project;
  const second=editDeveloperWithHistory(state,current,"app.js","const second=2;");
  state=second.history;current=second.project;
  assert.deepEqual(developerEditHistoryCounts(state,current,"app.js"),{undo:2,redo:0});
  assert.deepEqual(developerEditHistoryCounts(state,current,"index.html"),{undo:0,redo:0});
  const undo=stepDeveloperEditHistory(state,current,"app.js","undo");
  state=undo.history;current=undo.project;
  assert.equal(undo.changed,true);
  assert.equal(find(current,"app.js"),"const first=1;");
  assert.equal(find(current,"index.html"),find(start,"index.html"));
  assert.deepEqual(developerEditHistoryCounts(state,current,"app.js"),{undo:1,redo:1});
  const redo=stepDeveloperEditHistory(state,current,"app.js","redo");
  assert.equal(find(redo.project,"app.js"),"const second=2;");
  assert.deepEqual(developerEditHistoryCounts(redo.history,redo.project,"app.js"),{undo:2,redo:0});
});

test("editing after undo clears redo, and separate files hold independent history",()=>{
  let state=createDeveloperEditHistory(project().id),current=project();
  let next=editDeveloperWithHistory(state,current,"app.js","A");
  state=next.history;current=next.project;
  next=editDeveloperWithHistory(state,current,"styles.css","B");
  state=next.history;current=next.project;
  next=stepDeveloperEditHistory(state,current,"app.js","undo");
  state=next.history;current=next.project;
  assert.equal(developerEditHistoryCounts(state,current,"app.js").redo,1);
  next=editDeveloperWithHistory(state,current,"app.js","C");
  state=next.history;current=next.project;
  assert.deepEqual(developerEditHistoryCounts(state,current,"app.js"),{undo:1,redo:0});
  assert.deepEqual(developerEditHistoryCounts(state,current,"styles.css"),{undo:1,redo:0});
  assert.equal(stepDeveloperEditHistory(state,current,"app.js","redo").changed,false);
});

test("editor histories are bounded to 16 entries per file and zero on wrong project",()=>{
  let current=project(),history=createDeveloperEditHistory(current.id);
  for(let n=1;n<=40;n++){
    const updated=editDeveloperWithHistory(history,current,"app.js","iteration"+n);
    current=updated.project;history=updated.history;
  }
  assert.equal(MAX_EDITOR_UNDO,16);
  assert.deepEqual(developerEditHistoryCounts(history,current,"app.js"),{undo:16,redo:0});
  for(let n=0;n<MAX_EDITOR_UNDO;n++){
    const out=stepDeveloperEditHistory(history,current,"app.js","undo");
    assert.equal(out.changed,true);
    current=out.project;history=out.history;
  }
  assert.equal(stepDeveloperEditHistory(history,current,"app.js","undo").changed,false);
  assert.deepEqual(developerEditHistoryCounts(history,createDeveloperProject("blank","another"),"index.html"),{undo:0,redo:0});
  assert.throws(()=>editDeveloperWithHistory(history,createDeveloperProject("blank","another"),"index.html","x"),/different project/);
  assert.throws(()=>createDeveloperEditHistory(""),/valid project/);
});

test("out-of-band transformations invalidate stale editor history without altering source",()=>{
  const saved=project();
  const changed=editDeveloperWithHistory(createDeveloperEditHistory(saved.id),saved,"app.js","first");
  const outOfBand=editDeveloperFile(changed.project,"app.js","externally replaced");
  assert.deepEqual(developerEditHistoryCounts(changed.history,outOfBand,"app.js"),{undo:0,redo:0});
  const noUndo=stepDeveloperEditHistory(changed.history,outOfBand,"app.js","undo");
  assert.equal(noUndo.changed,false);
  assert.equal(find(noUndo.project,"app.js"),"externally replaced");
});

test("revision comparison recognizes one bounded contiguous region, adds and deleted files",()=>{
  const saved=project();
  let working=editDeveloperFile(saved,"app.js","// source\nconst a=1;\n// end");
  working=addDeveloperFile(working,"notes.md","New text");
  const edits=inspectDeveloperRevision(working,saved);
  assert.equal(edits.length,2);
  assert.ok(edits.some(x=>x.filename==="notes.md"&&x.status==="added"));
  const js=edits.find(x=>x.filename==="app.js");
  assert.equal(js.status,"modified");
  assert.equal(js.addedLines,3);
  assert.equal(js.removedLines,1);
  assert.deepEqual(js.addedPreview,["// source","const a=1;","// end"]);
  assert.deepEqual(inspectDeveloperRevision(saved,saved),[]);
  assert.throws(()=>inspectDeveloperRevision(working,createDeveloperProject("starter","other-project")),/another project/);
});

test("revision review local preview is bounded at 8 changed lines per side",()=>{
  const initial=createDeveloperProject("blank","project-3-2");
  const working=editDeveloperFile(initial,"index.html",Array.from({length:15},(_,i)=>"changed "+i).join("\n"));
  const entry=inspectDeveloperRevision(working,initial)[0];
  assert.equal(entry.addedLines,15);
  assert.equal(entry.addedPreview.length,8);
  assert.equal(entry.truncated,true);
  assert.equal(entry.newLine,1);
});

test("report exports filenames, counts and line numbers but NEVER project code",()=>{
  const token='SUPER_SECRET_CONTENT_NOT_FOR_REPORT';
  const start=project();
  const working=editDeveloperFile(start,"app.js",token+"\nhello");
  const report=JSON.parse(exportDeveloperRevisionReport(working,start));
  assert.equal(report.schema,DEVELOPER_REVISION_REPORT_SCHEMA);
  assert.equal(report.changedFiles,1);
  assert.equal(report.sourceExcluded,true);
  assert.equal(report.changes[0].filename,"app.js");
  assert.equal(report.changes[0].addedLines,2);
  assert.ok(!JSON.stringify(report).includes(token));
  assert.ok(!JSON.stringify(report).includes("removedPreview"));
  assert.match(report.scope,/not a Git diff/);
});

test("web UI wires editor-scoped shortcuts, bounded history and selective version review",()=>{
  const page=readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx",import.meta.url),"utf8");
  const review=readFileSync(new URL("../src/components/developer/ProjectRevisionReviewPanel.tsx",import.meta.url),"utf8");
  assert.match(page,/editDeveloperWithHistory\(editHistory, project, file\.name, content\)/);
  assert.match(page,/stepDeveloperEditHistory\(editHistory, project, file\.name, direction\)/);
  assert.match(page,/event\.ctrlKey \|\| event\.metaKey/);
  assert.match(page,/key === "z" \|\| key === "y"/);
  assert.match(page,/Undo edit \(/);
  assert.match(page,/Redo edit \(/);
  assert.match(page,/createDeveloperEditHistory\(next\.id\)/);
  assert.match(page,/<ProjectRevisionReviewPanel/);
  assert.match(review,/exportDeveloperRevisionReport\(project, savedBaseline\)/);
  assert.match(review,/onRestore\(current\.filename\)/);
  assert.match(review,/Open changed line/);
  assert.doesNotMatch(review,/fetch\(|localStorage\.setItem|allow-same-origin/);
});
