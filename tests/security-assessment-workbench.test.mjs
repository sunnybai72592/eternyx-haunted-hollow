import test from "node:test";
import assert from "node:assert/strict";
import { buildAssessmentReport, summarizeAssessment, validateAssessmentFinding } from "../src/lib/securityAssessmentUtils.mjs";

const base = { title: "Missing CSP", severity: "high", evidence: "Response did not include Content-Security-Policy.", recommendation: "Deploy a restrictive CSP.", owner: "Platform", status: "open", dueDate: "2026-12-01" };

test("validates and normalizes a finding", () => {
  assert.deepEqual(validateAssessmentFinding({ ...base, title: "  Missing CSP  ", severity: "HIGH" }), { ...base, title: "Missing CSP", severity: "high" });
});
test("rejects missing titles, invalid severity, status, and malformed dates", () => {
  assert.throws(() => validateAssessmentFinding({ ...base, title: " " }), /title/i);
  assert.throws(() => validateAssessmentFinding({ ...base, severity: "urgent" }), /severity/i);
  assert.throws(() => validateAssessmentFinding({ ...base, status: "done" }), /status/i);
  assert.throws(() => validateAssessmentFinding({ ...base, dueDate: "01-12-2026" }), /YYYY-MM-DD/);
});
test("summarizes severity and workflow status independently", () => {
  const result = summarizeAssessment([base, { ...base, severity: "critical", status: "in-progress" }, { ...base, severity: "low", status: "verified" }]);
  assert.equal(result.total, 3);
  assert.equal(result.critical, 1);
  assert.equal(result.high, 1);
  assert.equal(result.low, 1);
  assert.equal(result.open, 1);
  assert.equal(result.inProgress, 1);
  assert.equal(result.verified, 1);
});
test("limits the register to 100 findings", () => {
  assert.throws(() => summarizeAssessment(Array.from({ length: 101 }, (_, i) => ({ ...base, title: "Finding " + i }))), /100/);
});
test("builds a Markdown report with evidence, owner, status, and validation guidance", () => {
  const report = buildAssessmentReport({ assessmentName: "Portal review", target: "Staging portal", findings: [base] });
  assert.match(report, /Portal review/);
  assert.match(report, /Missing CSP/);
  assert.match(report, /Platform/);
  assert.match(report, /Evidence \/ observation/);
  assert.match(report, /Mark a finding verified only after recording/);
});
