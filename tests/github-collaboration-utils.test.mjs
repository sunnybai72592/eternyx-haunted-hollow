import test from "node:test";
import assert from "node:assert/strict";
import { filterGitHubItems, formatGitHubItemNumber, normalizeGitHubState } from "../src/lib/githubCollaborationUtils.mjs";

const items = [
  { title: "Add OAuth support", body: "Implement secure login", user: { login: "octocat" }, labels: [{ name: "enhancement" }], assignees: [] },
  { title: "Fix broken build", body: "CI fails on Windows", user: { login: "hubot" }, labels: [{ name: "bug" }], assignees: [{ login: "octocat" }] },
];

test("accepts supported GitHub item states only", () => {
  for (const state of ["open", "closed", "all"]) assert.equal(normalizeGitHubState(state), state);
  assert.throws(() => normalizeGitHubState("merged"), /Choose/);
});

test("filters items across title, body, author, labels and assignees", () => {
  assert.equal(filterGitHubItems(items, "oauth").length, 1);
  assert.equal(filterGitHubItems(items, "windows").length, 1);
  assert.equal(filterGitHubItems(items, "enhancement").length, 1);
  assert.equal(filterGitHubItems(items, "octocat").length, 2);
  assert.equal(filterGitHubItems(items, "   ").length, 2);
});

test("formats valid GitHub item numbers", () => {
  assert.equal(formatGitHubItemNumber(42), "#42");
  assert.throws(() => formatGitHubItemNumber(0), /Invalid/);
  assert.throws(() => formatGitHubItemNumber(1.5), /Invalid/);
});
