import test from "node:test";
import assert from "node:assert/strict";
import { buildGitHubComparePath, normalizeGitHubRef, summarizeGitHubComparison } from "../src/lib/githubChangeUtils.mjs";

test("accepts ordinary branch names and nested refs", () => {
  assert.equal(normalizeGitHubRef("main"), "main");
  assert.equal(normalizeGitHubRef("feature/api-v2"), "feature/api-v2");
  assert.equal(normalizeGitHubRef("release/2026.11"), "release/2026.11");
});

test("rejects unsafe or malformed Git refs", () => {
  for (const value of ["", "../main", "main/../secret", "/main", "main/", "main..", "main.lock", "a//b", "main?x", "main name", "@{1}"]) {
    assert.throws(() => normalizeGitHubRef(value), undefined, value);
  }
});

test("builds a safely encoded compare API resource", () => {
  assert.equal(buildGitHubComparePath("main", "feature/api-v2"), "compare/main...feature%2Fapi-v2");
  assert.throws(() => buildGitHubComparePath("main", "main"), /different refs/);
  assert.throws(() => buildGitHubComparePath("../main", "dev"), /valid/);
});

test("summarizes ahead/behind and file change metrics", () => {
  const summary = summarizeGitHubComparison({
    status: "ahead", ahead_by: 3, behind_by: 1, total_commits: 3,
    commits: [{ sha: "a" }, { sha: "b" }],
    files: [{ additions: 12, deletions: 4 }, { additions: 3, deletions: 7 }],
  });
  assert.deepEqual(summary, {
    status: "ahead", aheadBy: 3, behindBy: 1, totalCommits: 3,
    returnedCommits: 2, filesChanged: 2, additions: 15, deletions: 11,
    truncatedFiles: false, truncatedCommits: true,
  });
});

test("rejects invalid comparison payloads", () => {
  assert.throws(() => summarizeGitHubComparison({ status: "unknown", total_commits: 0 }), /unsupported/);
  assert.throws(() => summarizeGitHubComparison({ status: "ahead", total_commits: -1 }), /commit count/);
});
