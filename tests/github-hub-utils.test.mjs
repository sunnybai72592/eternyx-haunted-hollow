import test from "node:test";
import assert from "node:assert/strict";
import { githubApiUrl, parseGitHubRepositoryInput } from "../src/lib/githubHubUtils.mjs";

test("parses owner/repository input", () => {
  assert.deepEqual(parseGitHubRepositoryInput("octocat/Hello-World"), {
    owner: "octocat", repository: "Hello-World", fullName: "octocat/Hello-World",
  });
});

test("parses canonical GitHub URLs and strips a .git suffix", () => {
  assert.equal(parseGitHubRepositoryInput("https://github.com/octocat/Hello-World.git").fullName, "octocat/Hello-World");
});

test("rejects non-GitHub hosts, non-HTTPS URLs, credentials and extra path segments", () => {
  assert.throws(() => parseGitHubRepositoryInput("https://evil.example/octocat/repo"), /github.com/);
  assert.throws(() => parseGitHubRepositoryInput("http://github.com/octocat/repo"), /HTTPS/);
  assert.throws(() => parseGitHubRepositoryInput("https://user:pass@github.com/octocat/repo"), /HTTPS/);
  assert.throws(() => parseGitHubRepositoryInput("octocat/repo/tree/main"), /format/);
});

test("rejects query strings, fragments and malformed repository names", () => {
  assert.throws(() => parseGitHubRepositoryInput("https://github.com/octocat/repo?tab=readme"), /query/);
  assert.throws(() => parseGitHubRepositoryInput("octocat/../repo"), /format/);
  assert.throws(() => parseGitHubRepositoryInput(""), /Enter a GitHub repository/);
});

test("builds encoded API URLs and rejects traversal resource paths", () => {
  assert.equal(githubApiUrl("octocat", "Hello-World", "branches"), "https://api.github.com/repos/octocat/Hello-World/branches");
  assert.throws(() => githubApiUrl("octocat", "repo", "../issues"), /Invalid/);
});
