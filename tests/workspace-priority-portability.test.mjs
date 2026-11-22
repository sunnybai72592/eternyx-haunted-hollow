import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceExport } from "../src/lib/workspaceLibrary.mjs";
import { parseWorkspaceRestore } from "../src/lib/workspaceRestore.mjs";
import { createWorkspaceFullBackup, parseWorkspaceFullBackup } from "../src/lib/workspaceFullBackup.mjs";

const project = { id: "project", name: "Safety inspection", description: "Real project",
  status: "active", created_at: "2026-11-22T00:00:00Z" };
const tasks = [
  { project_id: "project", title: "Immediate inspection", status: "todo", priority: "urgent", due_on: "2026-11-25" },
  { project_id: "project", title: "Routine checks", status: "in_progress", priority: "low", due_on: null },
];
const notes = [{ project_id: "project", kind: "note", title: "Checklist", note_text: "Inspect", created_at: "2026-11-22" }];

test("v1 export includes persistent priorities, and v1 import restores them", () => {
  const exported = buildWorkspaceExport(project, tasks, notes);
  assert.equal(exported.tasks[0].priority, "urgent");
  const result = parseWorkspaceRestore(JSON.stringify(exported));
  assert.deepEqual(result.tasks.map(t => t.priority), ["urgent", "low"]);
});

test("older v1 backups without priority retain normal defaults", () => {
  const old = buildWorkspaceExport(project, tasks, notes);
  old.tasks.forEach(task => delete task.priority);
  const result = parseWorkspaceRestore(JSON.stringify(old));
  assert.deepEqual(result.tasks.map(t => t.priority), ["normal", "normal"]);
});

test("a forged or unknown priority stops import before project creation", () => {
  const data = buildWorkspaceExport(project, tasks, notes);
  data.tasks[0].priority = "sudo";
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(data)), /invalid priority/);
});

test("v2 complete backup includes valid priorities and rejects altered values", async () => {
  const backup = await createWorkspaceFullBackup(project, tasks, notes, async () => {
    throw new Error("No private files in this test");
  });
  const restored = await parseWorkspaceFullBackup(backup);
  assert.deepEqual(restored.tasks.map(t => t.priority), ["urgent","low"]);
  const tampered = JSON.parse(backup);
  tampered.tasks[0].priority = "critical-plus";
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(tampered)), /invalid priority/);
});
