import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceExport } from "../src/lib/workspaceLibrary.mjs";
import { createWorkspaceFullBackup } from "../src/lib/workspaceFullBackup.mjs";
import { createWorkspaceArchiveV3 } from "../src/lib/workspaceChecklistArchive.mjs";
import { sha256Hex } from "../src/lib/workspaceImportRecovery.mjs";
import { createWorkspaceRecoveryFork, parsePortableWorkspaceArchive,
  validateWorkspaceRecoveryForkHeader } from "../src/lib/workspaceRecoveryFork.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const uuid = "22222222-2222-4222-8222-222222222222";
const now = "2026-11-23T12:00:00.000Z";
const project = { id:"p", owner_id:owner, name:"Original CP inspection",
  description:"Private readings", status:"active", created_at:now };
const tasks = [
  { id:"task-a", owner_id:owner, project_id:"p", title:"Inspect",
    details:"-950mV",priority:"high",status:"todo",due_on:null,created_at:now },
  { id:"task-b", owner_id:owner, project_id:"p", title:"Inspect",
    details:"-850mV",priority:"urgent",status:"done",due_on:"2026-11-30",created_at:now },
];
const items = [
  { owner_id:owner,project_id:"p",kind:"note",title:"Reading",
    note_text:"Measured value",created_at:now },
  { owner_id:owner,project_id:"p",kind:"file",title:"data.txt",file_size:5,
    mime_type:"text/plain",storage_path:owner+"/p/secret-path",created_at:now },
];
const steps=[{ id:"step-a",task_id:"task-a",owner_id:owner,
  title:"Measure off potential",done:true,created_at:now }];

async function fork(raw) {
  return createWorkspaceRecoveryFork(raw,await sha256Hex(raw),uuid,now);
}

test("v1 recovery fork preserves notes/tasks and never imports into original session",async()=>{
  const source=JSON.stringify(buildWorkspaceExport(project,tasks,items,now));
  const value=await fork(source);
  assert.notEqual(value.fingerprint,await sha256Hex(source));
  assert.equal(value.projectName,"Original CP inspection (Recovery copy)");
  assert.equal(value.taskCount,2);
  assert.equal(value.fileCount,0);
  const {doc,parsed,forkMarker}=await parsePortableWorkspaceArchive(value.content);
  assert.equal(doc.format_version,1);
  assert.equal(forkMarker.source_sha256,await sha256Hex(source));
  assert.equal(parsed.tasks[0].details,"-950mV");
  assert.equal(parsed.tasks[1].details,"-850mV");
  assert.equal(parsed.items[0].note_text,"Measured value");
  assert.ok(!value.content.includes(owner));
  assert.ok(!value.content.includes("secret-path"));
  await assert.rejects(fork(value.content),/already a recovery copy/);
});

test("v2 fork keeps the existing private binary payload byte-for-byte",async()=>{
  const source=await createWorkspaceFullBackup(project,tasks,items,async path=>{
    assert.equal(path,items[1].storage_path);
    return new Blob([new TextEncoder().encode("hello")],{type:"text/plain"});
  });
  const value=await fork(source);
  const restored=await parsePortableWorkspaceArchive(value.content);
  const original=await parsePortableWorkspaceArchive(source);
  assert.equal(value.fileCount,1);
  assert.equal(restored.parsed.files[0].size_bytes,5);
  assert.equal(await sha256Hex(restored.parsed.files[0].bytes),
    await sha256Hex(original.parsed.files[0].bytes));
  assert.equal(restored.parsed.items[0].note_text,original.parsed.items[0].note_text);
});

test("v3 fork preserves checklists, priorities, duplicate titles and included files",async()=>{
  const source=await createWorkspaceArchiveV3(project,tasks,items,steps,
    async () => new Blob([new TextEncoder().encode("hello")],{type:"text/plain"}));
  const value=await fork(source);
  const restored=await parsePortableWorkspaceArchive(value.content);
  assert.equal(restored.doc.format_version,3);
  assert.equal(value.stepCount,1);
  assert.deepEqual(restored.parsed.tasks.map(t=>t.title),["Inspect","Inspect"]);
  assert.deepEqual(restored.parsed.tasks.map(t=>t.priority),["high","urgent"]);
  assert.equal(restored.parsed.tasks[0].checklist[0].done,true);
  assert.equal(restored.parsed.files[0].size_bytes,5);
  assert.ok(!value.content.includes('"task_id"'));
  assert.ok(!value.content.includes("secret-path"));
});

test("fork refuses changed source, bad marker, recursion and missing identity",async()=>{
  const source=JSON.stringify(buildWorkspaceExport(project,tasks,[],now));
  await assert.rejects(createWorkspaceRecoveryFork(source,"a".repeat(64),uuid,now),/changed since/);
  await assert.rejects(createWorkspaceRecoveryFork(source,await sha256Hex(source),"x",now),/valid source identity/);
  await assert.rejects(createWorkspaceRecoveryFork(source,await sha256Hex(source),uuid,"not-time"),/valid source identity/);
  assert.throws(()=>validateWorkspaceRecoveryForkHeader({
    version:1,source_sha256:"a".repeat(64),fork_id:uuid,created_at:now,
    injected:"owner project",}),/invalid/);
  const corrupt=JSON.parse(source);
  corrupt.recovery_fork={version:1,source_sha256:"wrong",fork_id:uuid,created_at:now};
  await assert.rejects(parsePortableWorkspaceArchive(JSON.stringify(corrupt)),/invalid/);
});

test("original file BOM identity is verified against original bytes",async()=>{
  const raw=JSON.stringify(buildWorkspaceExport(project,tasks,[],now));
  const rawBytes=new Uint8Array([239,187,191,...new TextEncoder().encode(raw)]);
  const value=await createWorkspaceRecoveryFork(raw,await sha256Hex(rawBytes),
    uuid,now,rawBytes);
  assert.equal(value.taskCount,2);
  assert.notEqual(value.fingerprint,await sha256Hex(rawBytes));
});

test("long source project names remain valid after adding recovery suffix",async()=>{
  const long={...project,name:"X".repeat(120)};
  const source=JSON.stringify(buildWorkspaceExport(long,tasks,[],now));
  const value=await fork(source);
  const parsed=await parsePortableWorkspaceArchive(value.content);
  assert.equal(parsed.parsed.project.name.length,120);
  assert.match(parsed.parsed.project.name,/\(Recovery copy\)$/);
});
