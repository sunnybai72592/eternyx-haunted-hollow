import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_WORKSPACE_FILE_BYTES, WORKSPACE_MIME_TYPES, validWorkspaceLink,
  workspaceFileAllowed, workspaceFileKey, WORKSPACE_EVENT_LABELS,
} from "../src/lib/workspaceRules.mjs";

test("workspace links accept only secure external URLs and internal ETERNYX paths", () => {
  for (const link of ["/developer-studio", "/ai-arsenal/video", "https://github.com/example/repo"]) {
    assert.equal(validWorkspaceLink(link), true, link);
  }
  for (const link of [
    "", "//external.example", "javascript:alert(1)", "data:text/html,bad",
    "http://insecure.test", "https://user:password@site.example",
    "https://host.example/path with spaces", "not-a-link", "/\\host.example",
  ]) assert.equal(validWorkspaceLink(link), false, link);
});

test("workspace upload keys keep user and project ownership and sanitize filenames", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const project = "22222222-2222-4222-8222-222222222222";
  const id = "33333333-3333-4333-8333-333333333333";
  const key = workspaceFileKey(owner, project, "../../private scan.pdf", id);
  assert.ok(key.startsWith(owner + "/" + project + "/" + id + "-"));
  assert.equal(key.split("/").length, 3);
  assert.ok(!key.includes(".."));
  assert.throws(() => workspaceFileKey("../../other", project, "note.txt", id));
});

test("private workspace upload types and limits are bounded", () => {
  assert.equal(MAX_WORKSPACE_FILE_BYTES, 5242880);
  assert.ok(WORKSPACE_MIME_TYPES.includes("application/pdf"));
  assert.equal(workspaceFileAllowed({ size: MAX_WORKSPACE_FILE_BYTES, type: "application/pdf" }), true);
  assert.equal(workspaceFileAllowed({ size: MAX_WORKSPACE_FILE_BYTES + 1, type: "application/pdf" }), false);
  assert.equal(workspaceFileAllowed({ size: 0, type: "image/png" }), false);
  assert.equal(workspaceFileAllowed({ size: 1000, type: "application/x-msdownload" }), false);
});

test("activity names are grounded in server-recorded event types", () => {
  assert.equal(WORKSPACE_EVENT_LABELS.task_created, "Task added");
  assert.equal(WORKSPACE_EVENT_LABELS.item_deleted, "Item removed");
  assert.equal(Object.keys(WORKSPACE_EVENT_LABELS).length, 7);
});
