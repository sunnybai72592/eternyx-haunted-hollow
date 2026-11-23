import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceExport } from "../src/lib/workspaceLibrary.mjs";
import { createWorkspaceFullBackup } from "../src/lib/workspaceFullBackup.mjs";
import { createWorkspaceArchiveV3 } from "../src/lib/workspaceChecklistArchive.mjs";
import { sha256Hex } from "../src/lib/workspaceImportRecovery.mjs";
import { auditWorkspaceBackupBytes } from "../src/lib/workspaceBackupAudit.mjs";

const owner="11111111-1111-4111-8111-111111111111";
const pid="22222222-2222-4222-8222-222222222222";
const now="2026-11-22T12:00:00Z";
const project={id:pid,owner_id:owner,name:"Real CP Field Data",
  description:"Private survey",status:"active",created_at:now};
const tasks=[{id:"task1",owner_id:owner,project_id:pid,title:"Inspect rectifier",
  details:"Real readings",status:"todo",priority:"high",due_on:null,created_at:now}];
const notes=[{id:"n",owner_id:owner,project_id:pid,kind:"note",
  title:"Readings",note_text:"Actual mV values",created_at:now}];
const file={id:"f",owner_id:owner,project_id:pid,kind:"file",
  title:"proof.txt",mime_type:"text/plain",file_size:5,storage_path:owner+"/"+pid+"/private",
  created_at:now};
const steps=[{id:"s1",task_id:"task1",owner_id:owner,
  title:"Check off potential",done:true,created_at:now}];
const encode=raw=>new TextEncoder().encode(raw);

test("v1 local verification reports actual metadata and warns file contents omitted",async()=>{
  const raw=JSON.stringify(buildWorkspaceExport(project,tasks,[...notes,file],now));
  const checked=await auditWorkspaceBackupBytes(encode(raw));
  assert.equal(checked.version,1);
  assert.equal(checked.archiveMode,"metadata");
  assert.equal(checked.taskCount,1);
  assert.equal(checked.savedItemCount,1);
  assert.equal(checked.skippedFiles,1);
  assert.equal(checked.includedFiles,0);
  assert.equal(checked.sha256,await sha256Hex(encode(raw)));
  assert.match(checked.limitations,/not a signed authenticity/);
});

test("v2 local verifier hashes actual embedded private bytes",async()=>{
  const raw=await createWorkspaceFullBackup(project,tasks,[...notes,file],async ()=>
    new Blob([encode("hello")],{type:"text/plain"}));
  const checked=await auditWorkspaceBackupBytes(encode(raw));
  assert.equal(checked.version,2);
  assert.equal(checked.includedFiles,1);
  assert.equal(checked.actualFileBytes,5);
  assert.equal(checked.skippedFiles,0);
  const changed=JSON.parse(raw);
  changed.items[1].file.base64=btoa("world");
  await assert.rejects(auditWorkspaceBackupBytes(encode(JSON.stringify(changed))),
    /integrity verification failed/);
});

test("v3 checklist metadata and file-inclusive archives validate accurately",async()=>{
  const basic=await createWorkspaceArchiveV3(project,tasks,[...notes,file],steps);
  const report=await auditWorkspaceBackupBytes(encode(basic));
  assert.equal(report.version,3);
  assert.equal(report.archiveMode,"metadata");
  assert.equal(report.checklistCount,1);
  assert.equal(report.skippedFiles,1);
  assert.equal(report.includedFiles,0);
  const full=await createWorkspaceArchiveV3(project,tasks,[...notes,file],steps,
    async()=>new Blob([encode("hello")],{type:"text/plain"}));
  const withFiles=await auditWorkspaceBackupBytes(encode(full));
  assert.equal(withFiles.archiveMode,"files");
  assert.equal(withFiles.includedFiles,1);
  assert.equal(withFiles.actualFileBytes,5);
  const bad=JSON.parse(full);
  bad.tasks[0].checklist[0].done="incorrect";
  await assert.rejects(auditWorkspaceBackupBytes(encode(JSON.stringify(bad))),
    /boolean done/);
});

test("invalid JSON, non-archive documents, corrupt UTF-8 and size bounds fail closed",async()=>{
  await assert.rejects(auditWorkspaceBackupBytes(encode("not json")),/not valid JSON/);
  await assert.rejects(auditWorkspaceBackupBytes(encode('{"format":"other"}')),
    /supported ETERNYX/);
  await assert.rejects(auditWorkspaceBackupBytes(new Uint8Array([0xff])),/encoded|UTF-8|valid/i);
  await assert.rejects(auditWorkspaceBackupBytes(new Uint8Array(0)),/between 1 byte/);
  await assert.rejects(auditWorkspaceBackupBytes(new Uint8Array(24*1024*1024+1)),
    /between 1 byte/);
});
