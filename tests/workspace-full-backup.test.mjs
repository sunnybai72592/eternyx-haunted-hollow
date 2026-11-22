import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceFullBackup, parseWorkspaceFullBackup,
  WORKSPACE_BACKUP_MAX_FILES, WORKSPACE_BACKUP_MAX_FILE_BYTES,
} from "../src/lib/workspaceFullBackup.mjs";
import { parseWorkspaceRestore } from "../src/lib/workspaceRestore.mjs";

const project = {
  id: "project-a", owner_id: "private-user", name: "Engineering Review",
  description: "A real private backup", status: "active", created_at: "2026-11-22T00:00:00Z",
};
const tasks = [{ project_id: project.id, title: "Review test output", status: "todo",
  due_on: "2026-11-23", created_at: "2026-11-22T00:00:00Z" }];
const items = [
  { project_id: project.id, kind: "note", title: "Notes", note_text: "Site checklist",
    created_at: "2026-11-22T00:00:00Z" },
  { project_id: project.id, kind: "link", title: "App", target_url: "/developer-studio",
    created_at: "2026-11-22T00:00:00Z" },
  { project_id: project.id, kind: "file", title: "report.pdf",
    file_size: 12, mime_type: "application/pdf",
    storage_path: "private-user/project-a/hidden-file-key",
    created_at: "2026-11-22T00:00:00Z" },
];
const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 13, 10, 0, 255]);
const download = async (path) => {
  assert.equal(path, items[2].storage_path);
  return new Blob([bytes], { type: "application/pdf" });
};

test("complete backup restores actual binary bytes with digest verification", async () => {
  const raw = await createWorkspaceFullBackup(project, tasks, items, download);
  const data = JSON.parse(raw);
  assert.equal(data.format_version, 2);
  assert.equal(data.items[2].file.binary_included, true);
  assert.equal(data.items[2].file.size_bytes, bytes.length);
  assert.match(data.items[2].file.sha256, /^[a-f0-9]{64}$/);
  assert.ok(!raw.includes("hidden-file-key"), "Never export private object keys");
  assert.ok(!raw.includes("private-user"), "Never export account IDs");
  assert.ok(!raw.includes("storage_path"));
  assert.throws(() => parseWorkspaceRestore(raw), /version 1/);
  const restored = await parseWorkspaceFullBackup(raw);
  assert.equal(restored.project.name, project.name);
  assert.equal(restored.tasks.length, 1);
  assert.equal(restored.items.length, 2);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.filesSkipped, 0);
  assert.deepEqual(Array.from(restored.files[0].bytes), Array.from(bytes));
});

test("checksum tampering is a hard failure, not an incomplete success", async () => {
  const raw = await createWorkspaceFullBackup(project, tasks, items, download);
  const changed = JSON.parse(raw);
  changed.items[2].file.base64 = btoa("tamper data!");
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(changed)), /integrity|size/);
  changed.items[2].file.base64 = "abc_";
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(changed)), /canonical base64/);
});

test("rejects a missing object, changed size and unsafe/unknown content type", async () => {
  await assert.rejects(createWorkspaceFullBackup(project, tasks, items,
    async () => new Blob([new Uint8Array(2)])), /could not be verified/);
  await assert.rejects(createWorkspaceFullBackup(project, tasks, items,
    async () => { throw new Error("Storage failed"); }), /Storage failed/);
  await assert.rejects(createWorkspaceFullBackup(project, tasks,
    [{ ...items[2], mime_type: "text/html" }], download), /metadata/);
});

test("bounds file count, total bytes, task count and cross-project membership", async () => {
  assert.equal(WORKSPACE_BACKUP_MAX_FILES, 8);
  assert.equal(WORKSPACE_BACKUP_MAX_FILE_BYTES, 12 * 1024 * 1024);
  const excess = Array.from({ length: 9 }, (_, index) =>
    ({ ...items[2], storage_path: "private-user/project-a/f" + index }));
  await assert.rejects(createWorkspaceFullBackup(project, tasks, excess, download), /up to 8/);
  await assert.rejects(createWorkspaceFullBackup(project, tasks,
    [{ ...items[0], project_id: "someone-else" }], download), /another project/);
  await assert.rejects(createWorkspaceFullBackup(project,
    Array(1001).fill(tasks[0]), items, download), /1,000/);
  const huge = [
    { ...items[2], file_size: 5 * 1024 * 1024 },
    { ...items[2], file_size: 5 * 1024 * 1024, storage_path: "other2" },
    { ...items[2], file_size: 5 * 1024 * 1024, storage_path: "other3" },
  ];
  await assert.rejects(createWorkspaceFullBackup(project, tasks, huge, download), /12 MiB/);
});

test("validates restored file manifests before trusting their content", async () => {
  const data = JSON.parse(await createWorkspaceFullBackup(project, tasks, items, download));
  data.items[1].url = "javascript:alert(1)";
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(data)), /unsafe/);
  data.items[1].url = "/developer-studio";
  data.items[2].file.mime_type = "text/html";
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(data)), /invalid file manifest/);
  data.items[2].file.mime_type = "application/pdf";
  data.items[2].file.size_bytes = 6 * 1024 * 1024;
  await assert.rejects(parseWorkspaceFullBackup(JSON.stringify(data)), /invalid file manifest/);
});
