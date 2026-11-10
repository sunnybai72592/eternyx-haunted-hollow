import test from "node:test";
import assert from "node:assert/strict";
import {
  filterGitHubReleases, formatGitHubAssetSize, normalizeGitHubComparison,
  normalizeGitHubReleases, normalizeGitHubTags, summarizeGitHubReleases
} from "../src/lib/githubReleaseUtils.mjs";

const release = (overrides = {}) => ({
  id: 1, name: "Version 1.2.0", tag_name: "v1.2.0", target_commitish: "main",
  body: "Stable feature release", draft: false, prerelease: false,
  created_at: "2026-01-01T00:00:00Z", published_at: "2026-01-02T00:00:00Z",
  html_url: "https://github.com/acme/app/releases/tag/v1.2.0", author: "maintainer",
  assets: [{ id: 9, name: "app.zip", size: 2048, download_count: 12, content_type: "application/zip", browser_download_url: "https://github.com/acme/app/releases/download/v1.2.0/app.zip" }],
  ...overrides
});

test("normalizes releases and rejects malformed entries and unsafe URLs", () => {
  const normalized = normalizeGitHubReleases([release(), { id: 2, tag_name: "bad", html_url: "javascript:alert(1)" }, null]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].assets[0].download_count, 12);
  assert.equal(normalizeGitHubReleases({ releases: [] }).length, 0);
});

test("normalizes tags only when a full commit SHA is available", () => {
  assert.deepEqual(normalizeGitHubTags([{ name: "v1.2.0", commit: { sha: "a".repeat(40) } }, { name: "bad", commit: { sha: "short" } }]), [
    { name: "v1.2.0", sha: "a".repeat(40), url: "" }
  ]);
});

test("filters releases by query and release channel", () => {
  const items = [release(), release({ id: 2, tag_name: "v2.0.0-rc.1", prerelease: true, name: "Release candidate" })];
  assert.equal(filterGitHubReleases(items, { query: "candidate" }).length, 1);
  assert.equal(filterGitHubReleases(items, { channel: "stable" }).length, 1);
  assert.equal(filterGitHubReleases(items, { channel: "prerelease" }).length, 1);
});

test("summarizes stable releases, assets, and download counts", () => {
  const summary = summarizeGitHubReleases([release(), release({ id: 2, prerelease: true })]);
  assert.equal(summary.latestStable.tag_name, "v1.2.0");
  assert.equal(summary.stable, 1);
  assert.equal(summary.assets, 2);
  assert.equal(summary.downloads, 24);
});

test("formats asset sizes with binary units", () => {
  assert.equal(formatGitHubAssetSize(512), "512 B");
  assert.equal(formatGitHubAssetSize(2048), "2.00 KB");
  assert.equal(formatGitHubAssetSize(-1), "Unknown size");
});

test("normalizes comparison stats and file inventory", () => {
  const result = normalizeGitHubComparison({ status: "ahead", ahead_by: 2, behind_by: 1, total_commits: 3, files: [{ filename: "src/a.ts", status: "modified", additions: 4, deletions: 2 }] });
  assert.equal(result.ahead_by, 2);
  assert.equal(result.files[0].changes, 0);
  assert.throws(() => normalizeGitHubComparison(null), /invalid comparison response/i);
});
