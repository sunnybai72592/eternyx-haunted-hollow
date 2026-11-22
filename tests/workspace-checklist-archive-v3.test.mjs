import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceArchiveV3, parseWorkspaceArchiveV3,
  attachWorkspaceChecklists, WORKSPACE_ARCHIVE_STEP_LIMIT,
} from "../src/lib/workspaceChecklistArchive.mjs";
import { parseWorkspaceRestore } from "../src/lib/workspaceRestore.mjs";

const owner = "11111111-1111-4111-8111-111111111111";
const project = { id: "p", owner_id: owner, name: "CP inspection", description: "Actual task records",
  status: "active", created_at: "2026-11-22T12:00:00Z" };
const tasks = [
  { id: "a", project_id: "p", owner_id: owner, title: "Inspect", priority: "high", status: "done",
    due_on: "2026-11-23", details: "Measured potential", completed_at: "2026-11-22T08:00:00Z" },
  { id: "b", project_id: "p", owner_id: owner, title: "Inspect", priority: "normal", status: "todo",
    due_on: null, details: "" },
];
const steps = [
  { id: "s2", task_id: "a", owner_id: owner, title: "Measure instant-off", done: true, created_at: "2026-11-21T11:00:00Z" },
  { id: "s1", task_id: "a", owner_id: owner, title: "Connect electrode", done: true, created_at: "2026-11-21T10:00:00Z" },
  { id: "s3", task_id: "b", owner_id: owner, title: "Review coating", done: false, created_at: "2026-11-21T10:00:00Z" },
];
const items = [
  { project_id: "p", kind: "note", title: "Observation", note_text: "Real reading",
    created_at: "2026-11-21" },
  { project_id: "p", kind: "file", title: "proof.txt", mime_type: "text/plain",
    file_size: 5, storage_path: owner + "/p/secure-name", created_at: "2026-11-21" },
];

test("v3 metadata export restores checklists by task position, not duplicate titles", async () => {
  const raw = await createWorkspaceArchiveV3(project, tasks, items, steps);
  const doc = JSON.parse(raw);
  assert.equal(doc.format_version, 3);
  assert.equal(doc.archive_mode, "metadata");
  assert.deepEqual(doc.tasks.map(task => task.checklist.map(step => step.title)),
    [["Connect electrode","Measure instant-off"],["Review coating"]]);
  assert.ok(!raw.includes(owner));
  assert.ok(!raw.includes("secure-name"));
  assert.ok(!raw.includes('"task_id"'));
  assert.ok(!raw.includes('"completed_at"'));
  const restore = await parseWorkspaceArchiveV3(raw);
  assert.equal(restore.stepCount, 3);
  assert.deepEqual(restore.tasks.map(task => task.checklist.length), [2,1]);
  assert.deepEqual(restore.tasks[0].checklist.map(step => step.done), [true,true]);
  assert.equal(restore.filesSkipped, 1);
  assert.equal(restore.files, undefined);
});

test("v3 private-file archive restores bytes and checklist state without Storage IDs", async () => {
  const raw = await createWorkspaceArchiveV3(project, tasks, items, steps, async path => {
    assert.equal(path, items[1].storage_path);
    return new Blob([new TextEncoder().encode("hello")], { type: "text/plain" });
  });
  const restore = await parseWorkspaceArchiveV3(raw);
  assert.equal(restore.archiveMode, "files");
  assert.equal(restore.files.length, 1);
  assert.equal(restore.stepCount, 3);
  assert.deepEqual(Array.from(restore.files[0].bytes), Array.from(new TextEncoder().encode("hello")));
  assert.ok(!raw.includes(owner));
});

test("v3 strictly rejects malformed or untrusted checklist data", async () => {
  const raw = await createWorkspaceArchiveV3(project, tasks, [], steps);
  const base = JSON.parse(raw);
  const mutate = (fn) => {
    const data = structuredClone(base);
    fn(data);
    return JSON.stringify(data);
  };
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { doc.tasks[0].checklist[0].done = "yes"; })), /boolean done/);
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { doc.tasks[0].checklist[0].title = "x".repeat(181); })), /1–180/);
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { doc.tasks[0].checklist = Array(31).fill({ title:"too many",done:false }); })), /excessive/);
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { delete doc.tasks[0].checklist; })), /invalid/);
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { doc.archive_mode = "strange"; })), /supported/);
  await assert.rejects(parseWorkspaceArchiveV3(mutate(doc =>
    { doc.tasks[0].priority = "forged"; })), /invalid priority/);
});

test("metadata mode cannot silently discard malicious binary-included manifests", async () => {
  const raw = await createWorkspaceArchiveV3(project, tasks, items, steps);
  const doc = JSON.parse(raw);
  doc.items[1].file.binary_included = true;
  await assert.rejects(parseWorkspaceArchiveV3(JSON.stringify(doc)), /unexpected/);
});

test("complete snapshot refuses cross-owner, orphan, duplicate and >30 steps", () => {
  assert.equal(WORKSPACE_ARCHIVE_STEP_LIMIT, 30);
  assert.throws(() => attachWorkspaceChecklists(tasks, [{ ...steps[0], owner_id: "other" }], owner), /unowned/);
  assert.throws(() => attachWorkspaceChecklists(tasks, [{ ...steps[0], task_id: "missing" }], owner), /orphan/);
  assert.throws(() => attachWorkspaceChecklists(tasks, [steps[0], steps[0]], owner), /duplicate/);
  assert.throws(() => attachWorkspaceChecklists(tasks, Array.from({ length:31 }, (_,i) => ({ ...steps[0], id:"unique"+i })), owner), /30 steps/);
  assert.throws(() => attachWorkspaceChecklists([{...tasks[0],owner_id:"other"}], [], owner), /foreign/);
});

test("legacy v1 imports remain intact; v3 is a separately versioned contract", async () => {
  const raw = await createWorkspaceArchiveV3(project, tasks, [], []);
  assert.throws(() => parseWorkspaceRestore(raw), /version 1/);
  const result = await parseWorkspaceArchiveV3(raw);
  assert.deepEqual(result.tasks.map(t=>t.checklist), [[],[]]);
});
