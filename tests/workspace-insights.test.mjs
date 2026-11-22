import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_PROJECT_LIMIT, WORKSPACE_TASK_LIMIT, WORKSPACE_ITEM_LIMIT,
  WORKSPACE_REGISTERED_FILE_BYTES_LIMIT, searchWorkspaceRecords,
  sortWorkspaceProjects, workspaceRegisteredBytes, workspaceByteLabel,
} from "../src/lib/workspaceInsights.mjs";

const projects = [
  { id: "one", name: "Developer API", description: "Release checklist", pinned: false, updated_at: "2026-11-22T08:00:00Z" },
  { id: "two", name: "Coating QA", description: "Inspection notes", pinned: true, updated_at: "2026-11-20T08:00:00Z" },
  { id: "three", name: "AI tools", description: "Media jobs", pinned: false, updated_at: "2026-11-19T08:00:00Z" },
];
const tasks = [
  { id: "t1", project_id: "one", title: "Repair auth CI", due_on: "2026-11-24", status: "todo" },
  { id: "t2", project_id: "two", title: "Inspect steel", due_on: null, status: "done" },
  { id: "t3", project_id: "other-owner", title: "Secret task", due_on: null, status: "todo" },
];
const items = [
  { id: "n1", project_id: "two", kind: "note", title: "Salt report", note_text: "Surface salt test passed" },
  { id: "l1", project_id: "one", kind: "link", title: "Deployment docs", target_url: "https://example.com/guide" },
  { id: "f1", project_id: "one", kind: "file", title: "report.pdf", file_size: 5000 },
  { id: "f2", project_id: "other-owner", kind: "file", title: "Secret.pdf", file_size: 8000 },
];

test("limits are explicit and match server-side quota contract", () => {
  assert.equal(WORKSPACE_PROJECT_LIMIT, 100);
  assert.equal(WORKSPACE_TASK_LIMIT, 5000);
  assert.equal(WORKSPACE_ITEM_LIMIT, 5000);
  assert.equal(WORKSPACE_REGISTERED_FILE_BYTES_LIMIT, 100 * 1024 * 1024);
});

test("pinned projects sort first without mutating the source collection", () => {
  const sorted = sortWorkspaceProjects(projects);
  assert.deepEqual(sorted.map(p => p.id), ["two","one","three"]);
  assert.deepEqual(projects.map(p => p.id), ["one","two","three"]);
});

test("global search covers project names/description, tasks, due dates, notes, URLs and file title", () => {
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "release").map(x => x.id), ["one"]);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "auth").map(x => x.id), ["t1"]);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "2026-11-24").map(x => x.id), ["t1"]);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "salt test").map(x => x.id), ["n1"]);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "https://example").map(x => x.id), ["l1"]);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "report.pdf").map(x => x.id), ["f1"]);
});

test("global search never includes records lacking a loaded owned project", () => {
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "secret"), []);
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "").map(x => x.id), []);
  assert.equal(searchWorkspaceRecords(projects, tasks, items, "e").length, 0);
});

test("search caps displayed results and preserves the actual target project", () => {
  const results = searchWorkspaceRecords(projects, tasks, items, "report", 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].projectId, "two");
  assert.equal(results[0].kind, "item");
  assert.equal(results[0].projectName, "Coating QA");
  assert.deepEqual(searchWorkspaceRecords(projects, tasks, items, "report", 0).length, 1);
});

test("only positive, safe integer registered file sizes count toward storage total", () => {
  const content = [...items, { kind: "file", file_size: -1 }, { kind: "file", file_size: NaN }];
  assert.equal(workspaceRegisteredBytes(content), 13000);
  assert.equal(workspaceRegisteredBytes([]), 0);
  assert.equal(workspaceByteLabel(1024), "1.0 KiB");
  assert.equal(workspaceByteLabel(104857600), "100.0 MiB");
  assert.equal(workspaceByteLabel(-1), "Unknown");
});

test("search results do not expose owner IDs or raw file paths", () => {
  const example = searchWorkspaceRecords(projects, tasks,
    [{ ...items[2], owner_id: "private-secret", storage_path: "sensitive/object/key" }], "report");
  const json = JSON.stringify(example);
  assert.equal(json.includes("private-secret"), false);
  assert.equal(json.includes("sensitive/object/key"), false);
});
