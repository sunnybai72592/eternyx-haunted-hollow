import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkspaceFocus, filterWorkspaceTaskPriority, sortWorkspaceProjectTasks,
  validWorkspacePriority,
} from "../src/lib/workspaceTaskFocus.mjs";

const projects = [
  { id: "a", name: "Alpha", status: "active" },
  { id: "b", name: "Archived", status: "archived" },
];
const tasks = [
  { id: "1", project_id: "a", title: "Urgent expired", due_on: "2026-11-21", priority: "urgent", status: "todo", updated_at: "2026-11-20" },
  { id: "2", project_id: "a", title: "Normal today", due_on: "2026-11-22", priority: "normal", status: "in_progress", updated_at: "2026-11-19" },
  { id: "3", project_id: "b", title: "Archived urgent", due_on: "2026-11-21", priority: "urgent", status: "todo", updated_at: "2026-11-18" },
  { id: "4", project_id: "a", title: "Low future", due_on: "2026-12-01", priority: "low", status: "todo", updated_at: "2026-11-21" },
  { id: "5", project_id: "a", title: "No deadline", due_on: null, priority: "high", status: "todo", updated_at: "2026-11-22" },
  { id: "6", project_id: "a", title: "Completed overdue", due_on: "2026-11-01", priority: "urgent", status: "done", updated_at: "2026-11-22" },
  { id: "7", project_id: "foreign", title: "Unowned hidden", due_on: "2026-11-21", priority: "urgent", status: "todo", updated_at: "2026-11-22" },
];

test("priority whitelist rejects forged values", () => {
  assert.equal(validWorkspacePriority("urgent"), true);
  assert.equal(validWorkspacePriority("normal"), true);
  assert.equal(validWorkspacePriority("extreme"), false);
  assert.equal(validWorkspacePriority(""), false);
});

test("focus queue excludes completed and foreign tasks; flags archived read-only project", () => {
  const focus = buildWorkspaceFocus(projects, tasks, "2026-11-22");
  assert.deepEqual(focus.counts, { overdue: 2, today: 1, upcoming: 1, unscheduled: 1 });
  assert.equal(focus.total, 5);
  assert.equal(focus.remaining, 0);
  assert.deepEqual(focus.results.map(r => r.id), ["1", "3", "2", "4", "5"]);
  assert.equal(focus.results[1].archived, true);
  assert.equal(focus.results[1].projectName, "Archived");
  assert.ok(!JSON.stringify(focus).includes("Unowned hidden"));
});

test("focus queue caps visible work but reports true counts", () => {
  const focus = buildWorkspaceFocus(projects, tasks, "2026-11-22", 2);
  assert.equal(focus.results.length, 2);
  assert.equal(focus.remaining, 3);
  assert.equal(focus.counts.overdue, 2);
});

test("priority and due-date sorting are deterministic without mutating source", () => {
  assert.deepEqual(sortWorkspaceProjectTasks(tasks.slice(0, 5), "priority").map(t=>t.id),
    ["1","3","5","2","4"]);
  assert.deepEqual(sortWorkspaceProjectTasks(tasks.slice(0, 5), "due").map(t=>t.id),
    ["1","3","2","4","5"]);
  assert.equal(sortWorkspaceProjectTasks(tasks.slice(0, 5), "recent")[0].id, "5");
  assert.equal(tasks[0].id, "1");
});

test("priority filtering handles old records with default normal priority", () => {
  assert.deepEqual(filterWorkspaceTaskPriority(tasks, "high").map(t=>t.id), ["5"]);
  assert.deepEqual(filterWorkspaceTaskPriority([...tasks, { id: "old", priority: undefined }], "normal")
    .map(t=>t.id), ["2","old"]);
  assert.equal(filterWorkspaceTaskPriority(tasks, "extreme").length, 0);
});
