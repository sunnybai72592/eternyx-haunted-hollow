import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CASE_SCHEMA, CASE_MARKER, MAX_CASE_BYTES, engagementMaySaveCase,
  createCaseSnapshot, parseCaseSnapshot, caseReport,
} from "../src/lib/securityCaseSnapshot.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const ownerId = "35a0687b-74f6-4ae3-99b0-02439ba94930";
const engagement = {
  id: "b69eae1e-ef3e-4c11-b2dd-4d4cccae3a9b", owner_id: ownerId,
  authorization_attested: true, authorization_attested_at: "2026-11-23T10:00:00Z",
  status: "authorized", scope_targets: ["example.org", "api.example.org"],
  excluded_targets: ["api.example.org"],
};
const draft = { title: "Missing CSP", severity: "high", evidence: "Observed absent CSP in a saved response.",
  recommendation: "Set a restrictive CSP.", owner: "Platform", status: "open", dueDate: "2026-12-01",
  id: "20412349-6025-4b3d-8c66-8a44305a11c8", retestNote: "", riskAcceptanceNote: "" };
const build = (overrides = {}) => createCaseSnapshot({
  engagement, ownerId, assessmentName: "Authorized Web Review",
  asset: { target: "example.org", steward: "Platform", criticality: "high", notes: "Staging" },
  findings: [draft], capturedAt: "2026-11-23T10:02:00.000Z", ...overrides,
});

test("private case normalizes a scoped, attested engagement and report", () => {
  const casefile = build();
  assert.equal(casefile.schema, CASE_SCHEMA);
  assert.equal(casefile.findings[0].status, "open");
  assert.equal(parseCaseSnapshot(JSON.stringify(casefile), engagement, ownerId).asset.target, "example.org");
  assert.match(caseReport(casefile), /not independent proof of authorization/i);
  assert.match(caseReport(casefile), /Missing CSP/);
});

test("cannot save when engagement lacks authorization attestation or permitted lifecycle", () => {
  assert.equal(engagementMaySaveCase({ ...engagement, authorization_attested: false }), false);
  assert.equal(engagementMaySaveCase({ ...engagement, status: "draft" }), false);
  assert.throws(() => build({ engagement: { ...engagement, status: "draft" } }), /attested/i);
});

test("rejects out-of-scope and excluded assets, even on snapshot restoration", () => {
  assert.throws(() => build({ asset: { target: "api.example.org", steward: "", criticality: "high", notes: "" } }), /scope/i);
  assert.throws(() => build({ asset: { target: "other.com", steward: "", criticality: "high", notes: "" } }), /scope/i);
  const old = build();
  assert.throws(() => parseCaseSnapshot(JSON.stringify(old), { ...engagement, scope_targets: ["other.com"] }, ownerId), /scope/i);
});

test("restoration rejects cross-account identity, changed engagement and invalid schema", () => {
  const original = build();
  assert.throws(() => parseCaseSnapshot(JSON.stringify(original), engagement, "40214b9d-329e-4729-b9e9-c6f8e165b312"), /ownership/i);
  assert.throws(() => parseCaseSnapshot(JSON.stringify(original), { ...engagement, id: "cf9754ed-97e1-4f09-976a-d5188c28ad6f" }, ownerId), /ownership/i);
  assert.throws(() => parseCaseSnapshot(JSON.stringify({ ...original, schema: "fake" }), engagement, ownerId), /version/i);
});

test("verified remediation needs evidence and a retest note; accepted risk needs approval", () => {
  assert.throws(() => build({ findings: [{ ...draft, status: "verified" }] }), /retest/i);
  assert.throws(() => build({ findings: [{ ...draft, status: "accepted" }] }), /approval/i);
  assert.equal(build({ findings: [{ ...draft, status: "verified", retestNote: "2026-11-23: Confirmed browser response includes restrictive CSP." }] }).findings[0].status, "verified");
  assert.equal(build({ findings: [{ ...draft, status: "accepted", riskAcceptanceNote: "Risk owner approval ticket SEC-1234" }] }).findings[0].status, "accepted");
});

test("rejects duplicate IDs, truncated JSON, and oversized case content", () => {
  assert.throws(() => build({ findings: [draft, draft] }), /unique/i);
  assert.throws(() => parseCaseSnapshot("{", engagement, ownerId), /valid JSON/i);
  assert.throws(() => parseCaseSnapshot("x".repeat(MAX_CASE_BYTES + 1), engagement, ownerId), /oversized/i);
});

test("route, private storage, audit trail and rollback are explicit", async () => {
  const [app, hub, page, evidenceMigration, managerMigration] = await Promise.all([
    read("src/App.tsx"), read("src/pages/CybersecurityHub.tsx"),
    read("src/pages/SecurityCaseWorkspace.tsx"),
    read("supabase/migrations/20261111220000_pentest_evidence_and_audit.sql"),
    read("supabase/migrations/20261111210000_pentest_engagement_management.sql"),
  ]);
  assert.match(app, /path="\/cybersecurity\/cases" element={<RequireAuth><SecurityCaseWorkspace \/><\/RequireAuth>}/);
  assert.match(hub, /href: "\/cybersecurity\/cases"/);
  assert.match(page, /from\("pentest_engagements"\)/);
  assert.match(page, /from\("pentest-evidence"\)\.upload/);
  assert.match(page, /from\("pentest_evidence"\)\.insert/);
  assert.match(page, /from\("pentest-evidence"\)\.remove/);
  assert.match(page, /from\("pentest-evidence"\)\.download/);
  assert.match(page, /description: CASE_MARKER/);
  assert.match(page, /if \(registered\.error\)/);
  assert.match(page, /if \(dirty && !window\.confirm/);
  assert.match(evidenceMigration, /public\.pentest_evidence ENABLE ROW LEVEL SECURITY/);
  assert.match(evidenceMigration, /public\.record_pentest_evidence_audit/);
  assert.match(managerMigration, /pentest_engagements ENABLE ROW LEVEL SECURITY/);
  assert.equal(CASE_MARKER, "ETERNYX security case snapshot v1");
});

test("snapshot is private and no staging or production migration was introduced", async () => {
  const page = await read("src/pages/SecurityCaseWorkspace.tsx");
  assert.match(page, /owner_id: userId, engagement_id: selected\.id/);
  assert.match(page, /upsert: false/);
  assert.match(page, /File\(\[raw\]/);
  assert.match(page, /new changes require a new snapshot/i);
  assert.doesNotMatch(page, /service_role|VITE_SUPABASE_SERVICE_ROLE/i);
});
