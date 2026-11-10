import test from "node:test";
import assert from "node:assert/strict";
import { parseProjectPackageJson, auditDeploymentReadiness, compareEnvironmentKeys, analyzeBuildLog } from "../src/lib/deploymentIntelligenceUtils.mjs";

test("detects Vite project metadata, scripts and missing deployment hints", () => {
  const result = parseProjectPackageJson(JSON.stringify({ name: "demo", scripts: { build: "vite build", test: "vitest" }, devDependencies: { vite: "^5" } }));
  assert.equal(result.framework, "Vite");
  assert.equal(result.hasBuild, true);
  assert.equal(result.hasTest, true);
  assert.ok(result.findings.some((item) => item.title === "Node version not pinned"));
});
test("rejects malformed or non-object package JSON", () => {
  assert.throws(() => parseProjectPackageJson("{"), /Invalid package.json/);
  assert.throws(() => parseProjectPackageJson("[]"), /JSON object/);
});
test("audits provider readiness and calculates a bounded score", () => {
  const result = auditDeploymentReadiness({ packageJson: JSON.stringify({ scripts: { build: "vite build" }, devDependencies: { vite: "5" } }), provider: "vercel", config: '{"cleanUrls":true}', envExample: "VITE_API_URL=\nVITE_PUBLIC_KEY=\n" });
  assert.equal(result.provider, "Vercel");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.deepEqual(result.environmentVariableNames, ["VITE_API_URL", "VITE_PUBLIC_KEY"]);
});
test("flags invalid provider config and missing build script", () => {
  const result = auditDeploymentReadiness({ packageJson: JSON.stringify({ name: "demo" }), provider: "vercel", config: "{" });
  assert.ok(result.findings.some((item) => item.title === "Invalid vercel.json"));
  assert.ok(result.findings.some((item) => item.title === "No build script"));
});
test("compares expected environment names without reading secret values", () => {
  const result = compareEnvironmentKeys("API_URL=\nDB_KEY=\n", ["API_URL", "EXTRA"]);
  assert.deepEqual(result.missing, ["DB_KEY"]);
  assert.deepEqual(result.extra, ["EXTRA"]);
});
test("diagnoses common build-log patterns", () => {
  const result = analyzeBuildLog("Error: Module not found: Can't resolve './missing'");
  assert.equal(result.matched, 1);
  assert.match(result.matches[0].advice, /import path/);
});
test("reports unmatched logs and rejects empty or oversized inputs", () => {
  assert.equal(analyzeBuildLog("Build completed with warnings").matched, 0);
  assert.throws(() => analyzeBuildLog(" "), /required/);
  assert.throws(() => parseProjectPackageJson("x".repeat(200001)), /200 KB/);
});
test("rejects unsupported deployment providers", () => {
  assert.throws(() => auditDeploymentReadiness({ packageJson: '{"scripts":{"build":"x"}}', provider: "other" }), /Choose Vercel/);
});
