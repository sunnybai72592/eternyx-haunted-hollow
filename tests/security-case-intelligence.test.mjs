import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCaseSnapshot } from "../src/lib/securityCaseSnapshot.mjs";
import { summarizeCaseTriage, compareCaseSnapshots, exportCaseComparison, exportCaseTriage } from "../src/lib/securityCaseIntelligence.mjs";

const owner = "35a0687b-74f6-4ae3-99b0-02439ba94930";
const engagement = {
  id: "b69eae1e-ef3e-4c11-b2dd-4d4cccae3a9b", owner_id: owner,
  authorization_attested: true, authorization_attested_at: "2026-11-23T10:00:00Z",
  status: "authorized", scope_targets: ["example.org"], excluded_targets: [],
};
const finding = {
  id: "a943aeed-c25d-4d92-9d0b-15c6f2f74baf", title: "Missing CSP",
  severity: "high", evidence: "CSP header was not present in staging response.",
  recommendation: "Add a restrictive CSP.", owner: "Platform", status: "open",
  dueDate: "2026-11-15", retestNote: "", riskAcceptanceNote: "",
};
const second = { ...finding, id: "4308def4-df41-4077-9a79-b9abfbb67cde",
  title: "Unprotected endpoint", severity: "critical", status: "blocked", owner: "", dueDate: "2026-12-20" };
const snapshot = (findings, updates = {}) => createCaseSnapshot({
  engagement, ownerId: owner, assessmentName: "Scoped application review",
  asset: { target: "example.org", steward: "Platform", criticality: "high", notes: "" },
  findings, capturedAt: "2026-11-23T12:00:00Z", ...updates,
});

test("analyst triage calculates critical, overdue, blocked and unassigned without CVSS claims", () => {
  const summary = summarizeCaseTriage([finding, second], "2026-11-23");
  assert.equal(summary.total, 2);
  assert.equal(summary.active, 2);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.highActive, 1);
  assert.equal(summary.criticalActive, 1);
  assert.equal(summary.priorityPoints, 13);
});
test("completed or accepted records are excluded from unresolved prioritization", () => {
  const result = summarizeCaseTriage([{ ...finding, status: "verified" }, { ...second, status: "accepted" }], "2026-11-23");
  assert.equal(result.active, 0); assert.equal(result.priorityPoints, 0);
  assert.equal(result.verified, 1); assert.equal(result.accepted, 1);
});
test("invalid dates cannot create fabricated overdue counts", () => {
  const result = summarizeCaseTriage([{ ...finding, dueDate: "2026-02-31" }], "2026-11-23");
  assert.equal(result.overdue, 0); assert.equal(result.invalidDueDate, 1);
});
test("snapshot comparison detects added, removed and updated findings without copying evidence bodies", () => {
  const start = snapshot([finding, second]);
  const end = snapshot([{ ...finding, status: "in-progress", owner: "Security", evidence: "Do not repeat this sensitive evidence." },
    { ...second, id: "d53c865f-8e32-483a-bdc0-f0b8c6d399f2", title: "New issue" }], { capturedAt: "2026-11-24T11:00:00Z" });
  const diff = compareCaseSnapshots(start, end);
  assert.deepEqual([diff.added, diff.removed, diff.updated], [1,1,1]);
  assert.deepEqual(diff.changes.find(x=>x.kind==="updated").fields, ["evidence","owner","status"]);
  assert.match(exportCaseComparison(diff), /open → in-progress/);
  assert.doesNotMatch(exportCaseComparison(diff), /Do not repeat this sensitive evidence/);
});
test("comparison rejects cross-owner, cross-engagement, and cross-asset casefiles", () => {
  const first = snapshot([finding]); const next = snapshot([finding]);
  assert.throws(() => compareCaseSnapshots(first, { ...next, ownerId: "403963d3-b852-4b2c-8abf-1261731823f4" }), /same owner/);
  assert.throws(() => compareCaseSnapshots(first, { ...next, engagementId: "403963d3-b852-4b2c-8abf-1261731823f4" }), /same owner/);
  assert.throws(() => compareCaseSnapshots(first, { ...next, asset: { ...next.asset, target: "another.example" } }), /same owner/);
});
test("asset metadata changes are reported separately from changes to findings", () => {
  const first = snapshot([finding]);
  const next = snapshot([finding], { asset: { ...first.asset, criticality: "critical" } });
  const diff = compareCaseSnapshots(first,next);
  assert.equal(diff.added+diff.removed+diff.updated,0);
  assert.deepEqual(diff.assetFields,["criticality"]);
  assert.match(exportCaseComparison(compareCaseSnapshots(first,first)), /No recorded changes/);
});
test("reports explicitly disclose heuristics and no scanning", () => {
  const data=snapshot([finding]); const report=exportCaseTriage(data,summarizeCaseTriage(data.findings,"2026-11-23"),"2026-11-23");
  assert.match(report,/not CVSS/);
  assert.match(report,/No scan, live detection/);
});
test("authenticated route and private-paginated evidence flow are integrated", async () => {
  const read = async path => readFile(new URL("../"+path,import.meta.url),"utf8");
  const [app,hub,page] = await Promise.all([read("src/App.tsx"),read("src/pages/CybersecurityHub.tsx"),read("src/pages/SecurityCaseIntelligence.tsx")]);
  assert.match(app,/path="\/cybersecurity\/case-intelligence" element={<RequireAuth><SecurityCaseIntelligence \/><\/RequireAuth>}/);
  assert.match(hub,/href: "\/cybersecurity\/case-intelligence"/);
  assert.match(page,/\.eq\("owner_id", userId\)\.eq\("engagement_id", id\)/);
  assert.match(page,/\.range\(offset, offset \+ PAGE_SIZE - 1\)/);
  assert.match(page,/requestToken\.current/);
  assert.match(page,/item\.storage_path\.startsWith\(userId \+ "\/" \+ selected\.id \+ "\/"\)/);
  assert.match(page,/parseCaseSnapshot/);
  assert.match(page,/compareCaseSnapshots/);
  assert.match(page,/Load older evidence/);
  assert.match(page,/aria-label="Filter findings by severity"/);
  assert.match(page,/aria-label="Filter findings by status"/);
  assert.doesNotMatch(page,/service_role|VITE_SUPABASE_SERVICE_ROLE/);
});
