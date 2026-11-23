import test from "node:test";
import assert from "node:assert/strict";
import {
  sha256Hex, importManifest, taskRestoreBatches, itemRestoreBatches,
  chunkImportRows, verifyExistingImportFile,
} from "../src/lib/workspaceImportRecovery.mjs";

const fingerprint = "a".repeat(64);
const project = { name: "Work inspection", description: "Actual inspection data" };
const task = { title: "Repeat task", status: "in_progress",
  details: "Real observations", priority: "high", due_on: "2026-11-22",
  checklist: [{ title: "Step 1", done: true }, { title: "Step 2", done: false }] };
const note = { kind: "note", title: "Note", note_text: "Real data", target_url: null };

test("SHA-256 archive fingerprint is stable and content-sensitive", async () => {
  assert.equal(await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), await sha256Hex("abc"));
  assert.notEqual(await sha256Hex("abc"), await sha256Hex("abd"));
});

test("manifest counts real tasks, checklists, notes and files", () => {
  const payload = { project, tasks: [task,task], items: [note], files: [
    { title:"proof.txt", mime_type:"text/plain", size_bytes:3, bytes:new Uint8Array([1,2,3]) },
  ] };
  assert.deepEqual(importManifest(payload, fingerprint, 3), {
    p_source_sha256: fingerprint, p_source_version: 3,
    p_project_name: "Work inspection", p_description: "Actual inspection data",
    p_expected_tasks: 2, p_expected_steps: 4, p_expected_items: 1,
    p_expected_files: 1,
  });
});

test("legacy archive manifests preserve empty step counts and reject invalid versions", () => {
  const payload = { project, tasks: [{...task,checklist:undefined}], items:[], files:[] };
  assert.equal(importManifest(payload,fingerprint,2).p_expected_steps,0);
  assert.throws(()=>importManifest(payload,fingerprint,5), /validated/);
  assert.throws(()=>importManifest(payload,"short",3), /validated/);
  assert.throws(()=>importManifest({ ...payload, files:[{}] },fingerprint,1), /verified restore/);
  assert.throws(()=>importManifest({...payload,tasks:Array(1001).fill(task)},fingerprint,3), /validated/);
});

test("batches are bounded to 25 and whitelist only portable task/item data", () => {
  const secretTask = { ...task, id:"sensitive-id", owner_id:"private-owner",
    storage_path:"private/key", updated_at:"secret" };
  const tasks = taskRestoreBatches({ tasks:Array(27).fill(secretTask) });
  assert.deepEqual(tasks.map(batch=>batch.length), [25,2]);
  assert.equal(tasks[0][0].title,"Repeat task");
  assert.equal(tasks[0][0].checklist[0].done,true);
  assert.ok(!JSON.stringify(tasks).includes("private-owner"));
  assert.ok(!JSON.stringify(tasks).includes("sensitive-id"));
  const items = itemRestoreBatches({ items:Array(26).fill({...note,owner_id:"private-owner"}) });
  assert.deepEqual(items.map(batch=>batch.length),[25,1]);
  assert.deepEqual(Object.keys(items[0][0]),["kind","title","note_text","target_url"]);
  assert.throws(()=>chunkImportRows([],26), /Invalid import/);
});

test("resumable private upload compares actual downloaded bytes and SHA-256", async () => {
  const bytes = new TextEncoder().encode("private inspection");
  const hash = await sha256Hex(bytes);
  const storage = { async download(path) {
    assert.equal(path,"owner/project/session-import-0-proof.txt");
    return {data:new Blob([bytes],{type:"text/plain"}),error:null};
  }};
  assert.equal(await verifyExistingImportFile(storage,
    "owner/project/session-import-0-proof.txt",bytes,hash),true);
  await assert.rejects(verifyExistingImportFile(storage,
    "owner/project/session-import-0-proof.txt",bytes,"0".repeat(64)), /checksum mismatch/);
  await assert.rejects(verifyExistingImportFile(storage,
    "owner/project/session-import-0-proof.txt",new Uint8Array([1]),hash), /unexpected size/);
  await assert.rejects(verifyExistingImportFile({download:async()=>({
    data:null,error:{message:"Forbidden"},
  })},"private/path",bytes,hash), /could not be verified/);
});

test("import batch helpers refuse missing inputs rather than writing partial data", () => {
  assert.throws(()=>taskRestoreBatches(null), /Missing validated tasks/);
  assert.throws(()=>itemRestoreBatches({}), /Missing validated saved items/);
});
