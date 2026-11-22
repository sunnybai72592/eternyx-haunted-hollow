import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWorkspaceRestore, scheduleLabel, filterScheduledTasks, localCalendarDate,
  WORKSPACE_RESTORE_MAX_BYTES, WORKSPACE_RESTORE_MAX_ITEMS,
} from "../src/lib/workspaceRestore.mjs";
import { buildWorkspaceExport } from "../src/lib/workspaceLibrary.mjs";

const project = { id: "project", name: "Real project", description: "Review work", status: "active", created_at: "2026-11-22" };
const tasks = [{ project_id: "project", title: "Test owner RLS", status: "todo", due_on: "2026-11-23", created_at: "2026-11-22" }];
const items = [
  { project_id: "project", kind: "note", title: "Notes", note_text: "Real notes", created_at: "2026-11-22" },
  { project_id: "project", kind: "link", title: "Developer", target_url: "/developer-studio", created_at: "2026-11-22" },
  { project_id: "project", kind: "file", title: "Private.txt", file_size: 100, mime_type: "text/plain", created_at: "2026-11-22" },
];
const exported = JSON.stringify(buildWorkspaceExport(project, tasks, items));

test("restore validates an actual portable Workspace export and skips binaries explicitly", () => {
  const restored = parseWorkspaceRestore(exported);
  assert.deepEqual(restored.project, { name: "Real project", description: "Review work" });
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.items.length, 2);
  assert.equal(restored.filesSkipped, 1);
  assert.equal(restored.items[0].note_text, "Real notes");
  assert.equal(restored.items[1].target_url, "/developer-studio");
  assert.ok(!JSON.stringify(restored).includes("storage_path"));
});

test("restore rejects unsafe links, malformed calendar dates and unsupported formats", () => {
  const copy = JSON.parse(exported);
  copy.items[1].url = "javascript:alert(1)";
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(copy)), /unsafe/);
  copy.items[1].url = "https://example.com/docs";
  copy.tasks[0].due_on = "2026-02-30";
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(copy)), /real calendar/);
  copy.tasks[0].due_on = null;
  copy.format_version = 2;
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(copy)), /supported ETERNYX/);
});

test("restore bounds size and item counts, with no untrusted file uploads", () => {
  assert.equal(WORKSPACE_RESTORE_MAX_BYTES, 1048576);
  assert.equal(WORKSPACE_RESTORE_MAX_ITEMS, 1000);
  assert.throws(() => parseWorkspaceRestore("x".repeat(WORKSPACE_RESTORE_MAX_BYTES + 1)), /1 MiB/);
  const copy = JSON.parse(exported);
  copy.items = Array(1001).fill(copy.items[0]);
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(copy)), /limit/);
  copy.items = [{ ...items[0], kind: "untrusted" }];
  assert.throws(() => parseWorkspaceRestore(JSON.stringify(copy)), /unsupported/);
});

test("schedule filters use local calendar day and ignore completed overdue tasks", () => {
  const input = [
    { title: "Late", due_on: "2026-11-21", status: "todo" },
    { title: "Done", due_on: "2026-11-21", status: "done" },
    { title: "Today", due_on: "2026-11-22", status: "in_progress" },
    { title: "Future", due_on: "2026-11-23", status: "todo" },
    { title: "No date", due_on: null, status: "todo" },
  ];
  assert.equal(scheduleLabel("2026-11-21", "2026-11-22"), "Overdue");
  assert.equal(scheduleLabel(null, "2026-11-22"), "No due date");
  assert.deepEqual(filterScheduledTasks(input, "overdue", "2026-11-22").map(x=>x.title), ["Late"]);
  assert.deepEqual(filterScheduledTasks(input, "today", "2026-11-22").map(x=>x.title), ["Today"]);
  assert.deepEqual(filterScheduledTasks(input, "upcoming", "2026-11-22").map(x=>x.title), ["Future"]);
  assert.deepEqual(filterScheduledTasks(input, "unscheduled", "2026-11-22").map(x=>x.title), ["No date"]);
  assert.equal(localCalendarDate(new Date(2026, 10, 22, 12, 0, 0)), "2026-11-22");
});
