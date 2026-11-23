import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  PREVIEW_VIEWPORTS, MAX_DEVELOPER_UPLOAD_BYTES, developerPreviewWidth,
  developerLinePosition, mergeDeveloperLocalTextFiles, readDeveloperLocalTextFiles,
  restoreSavedDeveloperFile,
} from "../src/lib/developerLocalWorkflows.mjs";
import {
  createDeveloperProject, editDeveloperFile, normalizeDeveloperProject,
} from "../src/lib/developerProjectLab.mjs";

const file = (name, bytes) => ({
  name, size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
const utf8 = text => new TextEncoder().encode(text);
const project = ()=>createDeveloperProject("starter","project-1");

test("real local UTF-8 file import reads bytes only with explicit selected File list",async()=>{
  const entries=await readDeveloperLocalTextFiles([
    file("notes.md",utf8("\uFEFFHello\nWorld")),
    file("styles2.css",utf8("body{color:purple}")),
  ]);
  assert.deepEqual(entries,[
    {name:"notes.md",content:"Hello\nWorld"},
    {name:"styles2.css",content:"body{color:purple}"},
  ]);
  assert.equal(MAX_DEVELOPER_UPLOAD_BYTES,120000);
  assert.deepEqual(await readDeveloperLocalTextFiles([file("config.json",utf8("{}"))]),
    [{name:"config.json",content:"{}"}]);
});

test("local file import rejects traversal, invalid UTF-8, binary data and bytes over limits",async()=>{
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("../private.js",utf8("bad"))]),/File names must be simple/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("private.exe",utf8("bad"))]),/File names must be simple/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("bad.txt",Uint8Array.of(0xff,0xfe))]),/valid UTF-8/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("bad.txt",Uint8Array.of(1,0,3))]),/binary data/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("large.txt",new Uint8Array(80001))]),/80 KB/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([file("one.txt",new Uint8Array(70000)),file("two.txt",new Uint8Array(70000))]),/120 KB/);
  await assert.rejects(()=>readDeveloperLocalTextFiles([]),/1 and 12/);
});

test("multi-file merge is atomic, duplicate-aware and preserves existing filenames",()=>{
  const p=project();
  const batch=[{name:"notes.md",content:"first\nsecond"},{name:"sample.json",content:"{}"}];
  const merged=mergeDeveloperLocalTextFiles(p,batch);
  assert.deepEqual(merged.added,["notes.md","sample.json"]);
  assert.equal(merged.selectedName,"sample.json");
  assert.equal(merged.project.files.length,p.files.length+2);
  assert.deepEqual(p.files,project().files);
  assert.throws(()=>mergeDeveloperLocalTextFiles(p,[{name:"index.html",content:"replaced"}]),/explicit replace/);
  assert.throws(()=>mergeDeveloperLocalTextFiles(p,[{name:"Alpha.txt",content:"a"},{name:"alpha.TXT",content:"b"}]),/Duplicate file/);
  assert.throws(()=>mergeDeveloperLocalTextFiles(p,[{name:"notes.md",content:"okay"},{name:"index.html",content:"oops"}]),/explicit replace/);
  assert.equal(p.files.length,3);
  const replaced=mergeDeveloperLocalTextFiles(p,[{name:"INDEX.HTML",content:"<h1>Changed</h1>"}],{overwrite:true});
  assert.deepEqual(replaced.replaced,["index.html"]);
  assert.equal(replaced.selectedName,"index.html");
  assert.equal(replaced.project.files.find(f=>f.name==="index.html").content,"<h1>Changed</h1>");
  assert.equal(p.files.find(f=>f.name==="index.html").content.includes("Changed"),false);
});

test("enforce existing 12-file, 20,000-character and 90,000-character project constraints",()=>{
  const p=project();
  assert.throws(()=>mergeDeveloperLocalTextFiles(p,[{name:"bad.md",content:"x".repeat(20001)}]),/20,000/);
  const entries=Array.from({length:5},(_,i)=>({name:"file"+i+".txt",content:"x".repeat(19000)}));
  assert.throws(()=>mergeDeveloperLocalTextFiles(p,entries),/90,000/);
  const twelve=mergeDeveloperLocalTextFiles(p,Array.from({length:9},(_,i)=>({name:"s"+i+".md",content:"ok"}))).project;
  assert.equal(twelve.files.length,12);
  assert.throws(()=>mergeDeveloperLocalTextFiles(twelve,[{name:"overflow.md",content:"x"}]),/12-file/);
  assert.deepEqual(normalizeDeveloperProject(twelve),twelve);
});

test("accurate go-to-line uses bounded offsets, including blank lines",()=>{
  const text="hello\n\nworld";
  assert.deepEqual(developerLinePosition(text,1),{index:0,line:1,column:1});
  assert.deepEqual(developerLinePosition(text,2),{index:6,line:2,column:1});
  assert.deepEqual(developerLinePosition(text,3,3),{index:9,line:3,column:3});
  assert.deepEqual(developerLinePosition(text,3,99),{index:12,line:3,column:6});
  assert.throws(()=>developerLinePosition(text,4),/outside/);
  assert.throws(()=>developerLinePosition(text,0),/outside/);
  assert.throws(()=>developerLinePosition(text,1.25),/integer/);
});

test("restore is single-file only, checkpoint-compatible and project-ID constrained",()=>{
  const saved=project();
  const edited=editDeveloperFile(saved,"index.html","Changed");
  const restored=restoreSavedDeveloperFile(edited,saved,"index.html");
  assert.equal(restored.files.find(f=>f.name==="index.html").content,saved.files[0].content);
  assert.equal(restored.files.find(f=>f.name==="app.js").content,saved.files.find(f=>f.name==="app.js").content);
  assert.equal(edited.files.find(f=>f.name==="index.html").content,"Changed");
  assert.throws(()=>restoreSavedDeveloperFile(edited,createDeveloperProject("starter","other"),"index.html"),/different project/);
  assert.throws(()=>restoreSavedDeveloperFile(edited,saved,"not-file.js"),/not in saved/);
});

test("four preview presets resolve to real dimensions, without changing project source",()=>{
  assert.deepEqual(PREVIEW_VIEWPORTS.map(v=>v.id),["fluid","phone","tablet","desktop"]);
  assert.equal(developerPreviewWidth("fluid"),null);
  assert.equal(developerPreviewWidth("phone"),375);
  assert.equal(developerPreviewWidth("tablet"),768);
  assert.equal(developerPreviewWidth("desktop"),1200);
  assert.throws(()=>developerPreviewWidth("secret"),/Unsupported/);
});

test("live Project Lab UI exposes real input, navigation, source restore, preview export and isolation",()=>{
  const page=readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx",import.meta.url),"utf8");
  assert.match(page,/id="project-local-file-import"/);
  assert.match(page,/readDeveloperLocalTextFiles\(chosen\)/);
  assert.match(page,/mergeDeveloperLocalTextFiles\(project, loaded/);
  assert.match(page,/window\.confirm\("Replace "/);
  assert.match(page,/id="editor-goto-line"/);
  assert.match(page,/developerLinePosition\(file\.content/);
  assert.match(page,/restoreSavedDeveloperFile\(old, savedBaseline, file\.name\)/);
  assert.match(page,/Export standalone HTML/);
  assert.match(page,/type: mime/);
  assert.match(page,/aria-label="Preview viewport widths"/);
  assert.match(page,/developerPreviewWidth\(previewMode\)/);
  assert.match(page,/sandbox="allow-scripts"/);
  assert.doesNotMatch(page,/allow-same-origin/);
});
