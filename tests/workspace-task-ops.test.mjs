import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceTasksCsv, workspaceTaskProgress, copyWorkspaceTask } from "../src/lib/workspaceTaskOps.mjs";
import { buildWorkspaceExport } from "../src/lib/workspaceLibrary.mjs";
import { parseWorkspaceRestore } from "../src/lib/workspaceRestore.mjs";
import { createWorkspaceFullBackup, parseWorkspaceFullBackup } from "../src/lib/workspaceFullBackup.mjs";

const project = { id: "project", name: "Coating QA", description: "Site records",
  status: "active", created_at: "2026-11-22" };
const tasks = [
  { id: "a", project_id: "project", title: "=2+2", details: "@SUM(2,2)\n\"quoted\"",
    status: "todo", priority: "urgent", due_on: "2026-11-21", completed_at: null },
  { id: "b", project_id: "project", title: "Inspect weld", details: "Visual acceptance",
    status: "done", priority: "normal", due_on: "2026-11-22", completed_at: "2026-11-22T12:00:00Z" },
  { id: "c", project_id: "project", title: "Final report", details: "Send report",
    status: "todo", priority: "normal", due_on: null, completed_at: null },
];

test("CSV quotes values, mitigates formula injection and hides internal account IDs", () => {
  const csv = buildWorkspaceTasksCsv(project, tasks);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("\"'=2+2\""));
  assert.ok(csv.includes("\"'@SUM(2,2)\n\"\"quoted\"\"\""));
  assert.ok(csv.includes("\"2026-11-22T12:00:00Z\""));
  assert.ok(!csv.includes("owner_id"));
  assert.ok(!csv.includes("storage_path"));
  assert.equal(csv.split("\r\n").filter(Boolean).length, 5); // embedded newline in a quoted detail
});

test("CSV refuses mixed-project rows and excessive record counts", () => {
  assert.throws(() => buildWorkspaceTasksCsv(project,
    [{ ...tasks[0], project_id: "other" }]), /one owned project/);
  assert.throws(() => buildWorkspaceTasksCsv(project, Array(5001).fill(tasks[0])), /5,000/);
});

test("project progress counts real task states and does not invent completion times", () => {
  const progress = workspaceTaskProgress(tasks, "2026-11-22");
  assert.deepEqual(progress, { total: 3, done: 1, open: 2, overdue: 1, urgentOpen: 1, percentage: 33 });
  assert.equal(workspaceTaskProgress([], "2026-11-22").percentage, 0);
});

test("copy only whitelists current project task data, resets completion and IDs", () => {
  const copy = copyWorkspaceTask(tasks[1], "account-a", "project");
  assert.equal(copy.title, "Copy of Inspect weld");
  assert.equal(copy.details, "Visual acceptance");
  assert.equal(copy.status, "todo");
  assert.equal(copy.priority, "normal");
  assert.ok(!("completed_at" in copy));
  assert.ok(!("id" in copy));
  assert.throws(() => copyWorkspaceTask(tasks[0], "account-a", "other"), /currently selected/);
});

test("v1 project archive roundtrips descriptions and accepts old records", () => {
  const backup = buildWorkspaceExport(project, tasks, []);
  assert.equal(backup.tasks[0].details, "@SUM(2,2)\n\"quoted\"");
  const restored = parseWorkspaceRestore(JSON.stringify(backup));
  assert.equal(restored.tasks[0].details, tasks[0].details);
  const old = { ...backup, tasks: backup.tasks.map(({ details, ...task }) => task) };
  assert.equal(parseWorkspaceRestore(JSON.stringify(old)).tasks[0].details, "");
});

test("v2 file-capable backup roundtrips details and rejects oversized text", async () => {
  const raw = await createWorkspaceFullBackup(project, tasks, [], async () => {
    throw new Error("No file content should be requested");
  });
  const value = await parseWorkspaceFullBackup(raw);
  assert.equal(value.tasks[1].details, "Visual acceptance");
  const bad = JSON.parse(raw);
  bad.tasks[0].details = "x".repeat(4001);
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(bad)), /Task details/);
});
