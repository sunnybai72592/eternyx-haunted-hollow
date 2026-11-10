import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDockerfile, analyzeCompose, analyzeKubernetesManifest } from "../src/lib/containerInfrastructureUtils.mjs";

test("Dockerfile analysis identifies missing non-root user and mutable image", () => {
  const result = analyzeDockerfile("FROM node:latest\nWORKDIR /app\nCOPY . .\nRUN npm install");
  assert.ok(result.findings.some((item) => item.title === "No USER instruction"));
  assert.ok(result.findings.some((item) => item.title === "Mutable base image tag"));
  assert.equal(result.baseImages[0], "node:latest");
});
test("Dockerfile analysis flags missing base image and remote shell execution", () => {
  const result = analyzeDockerfile("RUN curl https://example.invalid/install.sh | sh");
  assert.ok(result.findings.some((item) => item.level === "error"));
  assert.ok(result.findings.some((item) => item.title === "Remote script execution pattern"));
});
test("Compose analysis flags privileged mode and embedded credentials", () => {
  const result = analyzeCompose("services:\n  api:\n    image: api:latest\n    privileged: true\n    environment:\n      API_TOKEN: plaintext");
  assert.ok(result.findings.some((item) => item.title === "Privileged container enabled"));
  assert.ok(result.findings.some((item) => item.title === "Possible hard-coded secret"));
  assert.ok(result.serviceNames.includes("api"));
});
test("Compose analysis reports missing services", () => {
  const result = analyzeCompose("version: '3.9'\nnetworks: {}");
  assert.ok(result.findings.some((item) => item.title === "Missing services section"));
});
test("Kubernetes analysis flags privileged, hostPath and mutable image risks", () => {
  const result = analyzeKubernetesManifest("apiVersion: apps/v1\nkind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - name: api\n        image: api:latest\n        securityContext:\n          privileged: true\n      volumes:\n      - name: host\n        hostPath:\n          path: /");
  assert.ok(result.findings.some((item) => item.title === "Privileged workload"));
  assert.ok(result.findings.some((item) => item.title === "hostPath volume detected"));
  assert.ok(result.kinds.includes("Deployment"));
});
test("All analyzers reject empty and oversized input", () => {
  for (const analyze of [analyzeDockerfile, analyzeCompose, analyzeKubernetesManifest]) {
    assert.throws(() => analyze(" "), /required/);
    assert.throws(() => analyze("x".repeat(200001)), /200 KB/);
  }
});
