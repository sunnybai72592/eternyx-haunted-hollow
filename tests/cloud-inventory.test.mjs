import test from "node:test";
import assert from "node:assert/strict";
import { parseCloudSnapshot, MAX_SNAPSHOT_BYTES } from "../src/lib/cloudInventoryUtils.mjs";

const fixture = () => ({
  schemaVersion: 1, collectedAt: "2026-11-22T11:00:00.000Z",
  docker: { status: "available", version: "27.1", containers: [{ id: "123", name: "web", image: "node:22", state: "running", status: "Up 1h", secret: "must-not-escape" }] },
  kubernetes: { status: "available", namespace: "default", context: "local", pods: [{ name: "api-0", namespace: "default", phase: "Running", ready: "1/1", token: "secret" }], deployments: [{ name: "api", namespace: "default", replicas: 2, ready: 1 }] },
});
test("valid collected inventory is normalized without exposing unknown fields", () => {
  const output = parseCloudSnapshot(JSON.stringify(fixture()));
  assert.equal(output.docker.containers[0].name, "web");
  assert.equal(output.kubernetes.pods[0].ready, "1/1");
  assert.equal(output.docker.containers[0].secret, undefined);
  assert.equal(output.kubernetes.pods[0].token, undefined);
});
test("invalid payload, timestamp, statuses and oversized snapshot are rejected", () => {
  assert.throws(() => parseCloudSnapshot("{"), /valid JSON/);
  assert.throws(() => parseCloudSnapshot(JSON.stringify({ ...fixture(), schemaVersion: 2 })), /Unsupported/);
  assert.throws(() => parseCloudSnapshot(JSON.stringify({ ...fixture(), collectedAt: "no" })), /timestamp/);
  assert.throws(() => parseCloudSnapshot(JSON.stringify({ ...fixture(), docker: { ...fixture().docker, status: "connected" } })), /provider status/);
  assert.throws(() => parseCloudSnapshot(" ".repeat(MAX_SNAPSHOT_BYTES + 1)), /smaller/);
});
test("inventory count has a strict bound", () => {
  const sample = fixture();
  sample.docker.containers = Array.from({ length: 101 }, (_, index) => ({ id: String(index) }));
  assert.throws(() => parseCloudSnapshot(JSON.stringify(sample)), /oversized inventory/);
});
test("unavailable providers cannot show fabricated inventory", () => {
  const sample = fixture();
  sample.docker.status = "unavailable";
  sample.kubernetes.status = "unavailable";
  const output = parseCloudSnapshot(JSON.stringify(sample));
  assert.deepEqual(output.docker.containers, []);
  assert.deepEqual(output.kubernetes.pods, []);
  assert.deepEqual(output.kubernetes.deployments, []);
});
test("malformed item types are rejected", () => {
  const sample = fixture();
  sample.kubernetes.pods = [null];
  assert.throws(() => parseCloudSnapshot(JSON.stringify(sample)), /Invalid Kubernetes pod/);
});
