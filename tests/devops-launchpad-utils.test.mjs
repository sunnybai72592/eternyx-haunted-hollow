import test from "node:test";
import assert from "node:assert/strict";
import { buildGitWorkflow, generateGitignore, validateDeploymentConfig } from "../src/lib/devopsLaunchpadUtils.mjs";

test("builds a safe Git feature workflow", () => {
  const result = buildGitWorkflow({ branch: "feature/api-tools", commitMessage: "Add API tools" });
  assert.match(result, /git switch -c 'feature\/api-tools'/);
  assert.match(result, /git push --set-upstream origin/);
});
test("quotes shell-sensitive commit messages", () => {
  const result = buildGitWorkflow({ commitMessage: "fix user's bug" });
  assert.ok(result.includes("fix user") && result.includes("s bug") && result.includes("\\"));
});
test("rejects invalid branches and empty messages", () => {
  assert.throws(() => buildGitWorkflow({ branch: "../main" }), /valid Git branch/);
  assert.throws(() => buildGitWorkflow({ commitMessage: " " }), /Commit message/);
});
test("rejects remotes containing credentials or unsupported protocols", () => {
  assert.throws(() => buildGitWorkflow({ remoteUrl: "https://user:pass@example.com/repo.git" }), /Remote must/);
  assert.throws(() => buildGitWorkflow({ remoteUrl: "file:///tmp/repo" }), /Remote must/);
});
test("includes clone commands for valid HTTPS remotes", () => {
  const result = buildGitWorkflow({ remoteUrl: "https://github.com/example/project.git" });
  assert.match(result, /git clone/);
  assert.match(result, /cd 'project'/);
});
test("generates combined .gitignore rules without duplicate templates", () => {
  const result = generateGitignore(["react", "node", "react"]);
  assert.match(result, /node_modules\//);
  assert.match(result, /dist\//);
  assert.match(result, /!\.env\.example/);
});
test("rejects unknown .gitignore templates", () => {
  assert.throws(() => generateGitignore(["everything"]), /Unsupported/);
});
test("validates Vercel JSON and common routing structures", () => {
  const result = validateDeploymentConfig("vercel", JSON.stringify({ rewrites: [{ source: "/api/:path*", destination: "/api" }], cleanUrls: true }));
  assert.equal(result.valid, true);
});
test("reports malformed Vercel JSON and invalid known property types", () => {
  assert.throws(() => validateDeploymentConfig("vercel", "{"), /Invalid JSON/);
  assert.throws(() => validateDeploymentConfig("vercel", '{"rewrites":{}}'), /rewrites must be an array/);
});
test("checks basic Netlify TOML assignments and duplicate keys", () => {
  const result = validateDeploymentConfig("netlify", '[build]\ncommand = "npm run build"\npublish = "dist"\n');
  assert.equal(result.valid, true);
  assert.throws(() => validateDeploymentConfig("netlify", '[build]\ncommand = "a"\ncommand = "b"'), /duplicate key/);
});
test("rejects unsupported providers, empty input, and oversized configs", () => {
  assert.throws(() => validateDeploymentConfig("other", "x"), /Choose Vercel/);
  assert.throws(() => validateDeploymentConfig("vercel", " "), /Paste a configuration/);
  assert.throws(() => validateDeploymentConfig("vercel", "x".repeat(200_001)), /200 KB/);
});
