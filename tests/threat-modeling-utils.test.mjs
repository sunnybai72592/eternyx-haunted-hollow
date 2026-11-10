import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThreatModel, buildThreatModelReport } from "../src/lib/threatModelingUtils.mjs";
const base = { systemName: "Customer Portal", scope: "Web portal and API for customer records", assets: "Customer database\nSession tokens", entryPoints: "Public HTTPS login\nPartner API", dataFlows: "Browser to API over HTTPS", trustBoundaries: "Internet to application tier", existingControls: "" };
test("requires system scope, assets, and entry points", () => {
  assert.throws(() => analyzeThreatModel({}), /system or application name/);
  assert.throws(() => analyzeThreatModel({ ...base, assets: "" }), /at least one asset/);
  assert.throws(() => analyzeThreatModel({ ...base, entryPoints: "" }), /at least one entry point/);
});
test("generates all six STRIDE categories with risk scores", () => {
  const model = analyzeThreatModel(base);
  assert.deepEqual(model.threats.map(x => x.id).sort(), ["denial-of-service", "elevation-of-privilege", "information-disclosure", "repudiation", "spoofing", "tampering"].sort());
  assert.ok(model.threats.every(x => x.score >= 1 && x.score <= 25));
  assert.ok(model.summary.high + model.summary.critical > 0);
});
test("recognizes documented control signals without claiming effectiveness", () => {
  const model = analyzeThreatModel({ ...base, existingControls: "MFA, RBAC, audit logging, encryption, rate limiting, integrity signatures" });
  assert.ok(model.threats.every(x => x.controlSignal.includes("validate")));
});
test("enforces text limits", () => {
  assert.throws(() => analyzeThreatModel({ ...base, scope: "x".repeat(12001) }), /12,000 characters/);
});
test("builds a Markdown report with limitations", () => {
  const report = buildThreatModelReport(analyzeThreatModel(base));
  assert.match(report, /STRIDE threat register/);
  assert.match(report, /not an automated security test/);
  assert.match(report, /Customer database/);
});
