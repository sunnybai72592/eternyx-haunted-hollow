import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkspaceExport, filterWorkspaceItems, filterWorkspaceTasks, workspaceExportFileName,
} from "../src/lib/workspaceLibrary.mjs";

const project = {
  id: "project-a", owner_id: "owner-private", name: "Release Notes",
  description: "A real project", status: "active", created_at: "2026-11-22T00:00:00Z",
};
const tasks = [
  { id: "task-a", project_id: project.id, owner_id: "owner-private", title: "Fix CI", status: "todo", due_on: "2026-11-24", created_at: "2026-11-22T00:00:00Z" },
  { id: "task-b", project_id: project.id, owner_id: "owner-private", title: "Ship release", status: "done", due_on: null, created_at: "2026-11-22T00:00:00Z" },
];
const items = [
  { id: "note-a", project_id: project.id, owner_id: "owner-private", kind: "note", title: "Findings", note_text: "Real notes", storage_path: null, target_url: null, created_at: "2026-11-22T00:00:00Z" },
  { id: "link-a", project_id: project.id, owner_id: "owner-private", kind: "link", title: "Docs", target_url: "/developer-studio", created_at: "2026-11-22T00:00:00Z" },
  { id: "file-a", project_id: project.id, owner_id: "owner-private", kind: "file", title: "report.pdf", storage_path: "owner-private/project-a/private-key", mime_type: "application/pdf", file_size: 7000, created_at: "2026-11-22T00:00:00Z" },
];

test("export whitelists useful portable fields and excludes private storage paths", () => {
  const value = buildWorkspaceExport(project, tasks, items, "2026-11-22T23:00:00Z");
  assert.equal(value.format, "eternyx.workspace.project");
  assert.equal(value.format_version, 1);
  assert.equal(value.exported_at, "2026-11-22T23:00:00Z");
  assert.equal(value.tasks.length, 2);
  assert.equal(value.items.length, 3);
  assert.equal(value.items[0].text, "Real notes");
  assert.equal(value.items[1].url, "/developer-studio");
  assert.deepEqual(value.items[2].file, { mime_type: "application/pdf", size_bytes: 7000, binary_included: false });
  const serialized = JSON.stringify(value);
  assert.ok(!serialized.includes("owner-private"));
  assert.ok(!serialized.includes("private-key"));
  assert.ok(!serialized.includes("file-a"));
  assert.ok(value.limitations.includes("not included"));
});

test("export rejects accidental cross-project joins", () => {
  assert.throws(() => buildWorkspaceExport(project, [{ ...tasks[0], project_id: "someone-else" }], items), /another project/);
  assert.throws(() => buildWorkspaceExport(project, tasks, [{ ...items[0], project_id: "someone-else" }]), /another project/);
  assert.throws(() => buildWorkspaceExport(project, null, items), /required/);
});

test("export filename normalizes arbitrary user-supplied names", () => {
  assert.equal(workspaceExportFileName("../My Secret Project"), "_My_Secret_Project-eternyx-workspace.json");
  assert.ok(!workspaceExportFileName("../../evil").includes("/"));
});

test("task filters act on real status, names and due dates without changing inputs", () => {
  assert.deepEqual(filterWorkspaceTasks(tasks, "todo", "").map((x) => x.title), ["Fix CI"]);
  assert.deepEqual(filterWorkspaceTasks(tasks, "all", "  NOV-  ").length, 0);
  assert.deepEqual(filterWorkspaceTasks(tasks, "all", "2026-11-24").map((x) => x.title), ["Fix CI"]);
  assert.deepEqual(filterWorkspaceTasks(tasks, "done", "release").map((x) => x.title), ["Ship release"]);
  assert.equal(tasks.length, 2);
});

test("saved item search covers notes, bookmarks, types and titles", () => {
  assert.deepEqual(filterWorkspaceItems(items, "note", "real").map((x) => x.title), ["Findings"]);
  assert.deepEqual(filterWorkspaceItems(items, "link", "/developer").map((x) => x.title), ["Docs"]);
  assert.deepEqual(filterWorkspaceItems(items, "file", "PDF").map((x) => x.title), ["report.pdf"]);
  assert.equal(filterWorkspaceItems(items, "file", "Findings").length, 0);
});
