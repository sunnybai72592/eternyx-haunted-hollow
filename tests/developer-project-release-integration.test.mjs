import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addDeveloperFile, createDeveloperProject, editDeveloperFile, removeDeveloperFile,
} from "../src/lib/developerProjectLab.mjs";
import {
  DEVELOPER_RELEASE_PLAN_STORAGE_KEY, DEVELOPER_RELEASE_EVIDENCE_PACK_SCHEMA,
  DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA, readDeveloperReleaseSavedPlan,
  runDeveloperSavedPlanReleaseReview, runDeveloperCombinedReleaseReview,
  exportDeveloperReleaseEvidencePack, exportDeveloperSavedPlanReview,
} from "../src/lib/developerProjectReleaseIntegration.mjs";
import { runDeveloperLocalReleaseHandoff } from "../src/lib/developerProjectReleaseHandoff.mjs";

const starter = () => createDeveloperProject("starter", "release-integration-38");
const named = (id, kind, file, expected = "", path = "") => ({ id, kind, file, expected, path });
const raw = (project, tests) => JSON.stringify([{ projectId: project.id, tests }]);
const initial = project => [
  named("required-index", "file-exists", "index.html"),
  named("nonblank-index", "file-nonempty", "index.html"),
  named("no-private-marker", "text-absent", "app.js", "PRIVATE_MARKER_8796"),
];

test("saved release plan requires explicit project binding and never silently falls back to two default tests", async () => {
  const p = starter();
  const plan = raw(p, initial(p));
  assert.equal(readDeveloperReleaseSavedPlan(plan, p.id).length, 3);
  assert.equal(DEVELOPER_RELEASE_PLAN_STORAGE_KEY, "eternyx:developer-local-tests:v1");
  assert.throws(() => readDeveloperReleaseSavedPlan("[]", p.id), /Save a project test plan/);
  assert.rejects(runDeveloperCombinedReleaseReview(p, "[]"), /Save a project test plan/);
  assert.throws(() => readDeveloperReleaseSavedPlan(plan, "different-project"), /Save a project test plan/);
  assert.throws(() => readDeveloperReleaseSavedPlan("{", p.id), /invalid JSON/);
  assert.throws(() => readDeveloperReleaseSavedPlan("[".repeat(45001), p.id), /exceeds its limit/);
  assert.throws(() => readDeveloperReleaseSavedPlan(JSON.stringify({ test: true }), p.id), /unsupported structure/);
});

test("duplicate plans, invalid cases and malformed stored test lists are not accepted", () => {
  const p = starter();
  const tests = initial(p);
  assert.throws(() => readDeveloperReleaseSavedPlan(JSON.stringify([
    { projectId: p.id, tests }, { projectId: p.id, tests },
  ]), p.id), /Duplicate saved/);
  assert.throws(() => readDeveloperReleaseSavedPlan(JSON.stringify([
    { projectId: p.id, tests: [] },
  ]), p.id), /1–16 checks/);
  assert.throws(() => readDeveloperReleaseSavedPlan(JSON.stringify([
    { projectId: p.id, tests: [named("x", "fake-network-execution", "app.js")] },
  ]), p.id), /Unsupported local test identifier/);
  assert.throws(() => readDeveloperReleaseSavedPlan(JSON.stringify(
    Array.from({ length: 6 }, (_, i) => ({ projectId: String(i), tests })),
  ), p.id), /unsupported structure/);
});

test("actual saved plan assertions pass separately from the default handoff", async () => {
  const p = starter();
  const a = await runDeveloperSavedPlanReleaseReview(p, raw(p, initial(p)));
  assert.equal(a.schema, DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA);
  assert.equal(a.status, "passed");
  assert.equal(a.assertionCount, 3);
  assert.equal(a.passedAssertions, 3);
  assert.equal(a.failedAssertions, 0);
  assert.equal(a.coverage.fileCount, 3);
  assert.equal(a.coverage.testedFileCount, 2);
  assert.equal(a.coverage.untestedFileCount, 1);
  assert.equal(a.coverage.baselineCompared, false);
  assert.deepEqual(a.kinds.map(item => item.kind), ["file-exists", "file-nonempty", "text-absent"]);
  const combined = await runDeveloperCombinedReleaseReview(p, raw(p, initial(p)));
  assert.equal(combined.local.localVerdict, "local-checks-passed");
  assert.equal(combined.savedPlan.status, "passed");
});

test("a failed private text assertion becomes a navigable local finding, never leaked in evidence", async () => {
  const p = editDeveloperFile(starter(), "app.js", "const x = 1;\n// PRIVATE_MARKER_8796");
  const result = await runDeveloperSavedPlanReleaseReview(p, raw(p, initial(p)));
  assert.equal(result.status, "review-required");
  assert.equal(result.failedAssertions, 1);
  assert.deepEqual(result.failures.map(f => [f.file, f.line, f.reason]),
    [["app.js", 2, "forbidden-text-present"]]);
  assert.ok(!JSON.stringify(result.failures).includes("PRIVATE_MARKER_8796"));
  const sourceFree = JSON.stringify(exportDeveloperSavedPlanReview(result));
  assert.ok(!sourceFree.includes("app.js"));
  assert.ok(!sourceFree.includes("PRIVATE_MARKER_8796"));
  assert.ok(!sourceFree.includes('"line"'));
});

test("saved baseline exposes uncovered changed files and dependent files even when assertions pass", async () => {
  let base = starter();
  base = addDeveloperFile(base, "helper.js", "export const n = 1");
  base = editDeveloperFile(base, "app.js", 'import "./helper.js";');
  base = editDeveloperFile(base, "index.html", '<script src="./app.js"></script>');
  const tests = [
    named("one", "file-exists", "index.html"),
    named("two", "file-nonempty", "index.html"),
    named("three", "text-absent", "styles.css", "DO_NOT_SHOW"),
  ];
  const edited = editDeveloperFile(base, "helper.js", "export const n = 2");
  const review = await runDeveloperSavedPlanReleaseReview(edited, raw(base, tests), base);
  assert.equal(review.passedAssertions, 3);
  assert.equal(review.coverage.changedFileCount, 1);
  assert.equal(review.coverage.potentiallyAffectedFileCount, 2);
  assert.deepEqual(review.coverage.uncoveredChanged, ["helper.js"]);
  assert.deepEqual(review.coverage.uncoveredAffected, ["app.js"]);
  assert.equal(review.status, "review-required");
  const evidence = exportDeveloperSavedPlanReview(review);
  assert.equal(evidence.coverage.uncoveredChangedFileCount, 1);
  assert.equal(evidence.coverage.uncoveredAffectedFileCount, 1);
  assert.ok(!JSON.stringify(evidence).includes("helper.js"));
  const covered = await runDeveloperSavedPlanReleaseReview(edited, raw(base, [
    ...tests, named("four", "file-exists", "app.js"), named("five", "file-nonempty", "helper.js"),
  ]), base);
  assert.equal(covered.status, "passed");
  assert.equal(covered.coverage.uncoveredChangedFileCount, 0);
  assert.equal(covered.coverage.uncoveredAffectedFileCount, 0);
});

test("deleted project files require explicit review and never invent a passing test on deleted sources", async () => {
  let p = starter();
  p = addDeveloperFile(p, "old.js", "export const old=1");
  const edited = removeDeveloperFile(p, "old.js");
  const result = await runDeveloperSavedPlanReleaseReview(edited, raw(p, initial(p)), p);
  assert.equal(result.passedAssertions, 3);
  assert.equal(result.coverage.deletedFileCount, 1);
  assert.deepEqual(result.coverage.deleted, ["old.js"]);
  assert.equal(result.status, "review-required");
  assert.rejects(runDeveloperSavedPlanReleaseReview(edited, raw(p, initial(p)), starter()),
    /different project/);
});

test("filename-free combined evidence exports counts, fixed rule labels and permanent remote hold", async () => {
  let p = starter();
  p = editDeveloperFile(p, "app.js", 'const USER_PRIVATE_TOKEN = "SUPER_SECRET_367";');
  const sourceTests = [
    named("sensitive-case-id", "text-contains", "app.js", "USER_PRIVATE_TOKEN"),
    named("missing-export", "text-absent", "app.js", "NOT_PRESENT_399"),
  ];
  const result = await runDeveloperCombinedReleaseReview(p, raw(p, sourceTests));
  const str = exportDeveloperReleaseEvidencePack(result.local, result.savedPlan);
  const parsed = JSON.parse(str);
  assert.equal(parsed.schema, DEVELOPER_RELEASE_EVIDENCE_PACK_SCHEMA);
  assert.equal(parsed.localVerdict, "local-checks-passed");
  assert.equal(parsed.savedPlanReview.passedAssertions, 2);
  assert.equal(parsed.savedPlanReview.status, "passed");
  assert.equal(parsed.defaultReview.releaseDecision, "HOLD_HOSTED_RELEASE");
  assert.equal(parsed.releaseDecision, "HOLD_HOSTED_RELEASE");
  assert.equal(parsed.hostedStagingVerified, false);
  assert.equal(parsed.protectedBackendVerified, false);
  assert.equal(parsed.productionVerified, false);
  for (const secret of ["USER_PRIVATE_TOKEN", "SUPER_SECRET_367", "sensitive-case-id",
    "NOT_PRESENT_399", "app.js", "index.html", '"filename":', '"line":']) {
    assert.ok(!str.includes(secret), "Combined evidence leaked: " + secret);
  }
});

test("combined outcome refuses optimistic success when custom assertions fail even if the default handoff is clean", async () => {
  const p = starter();
  const bad = raw(p, [named("must-have", "text-contains", "app.js", "REQUIRED_SECRET_TEXT")]);
  const combined = await runDeveloperCombinedReleaseReview(p, bad);
  assert.equal(combined.local.localVerdict, "local-checks-passed");
  assert.equal(combined.savedPlan.status, "review-required");
  assert.equal(JSON.parse(exportDeveloperReleaseEvidencePack(combined.local, combined.savedPlan))
    .localVerdict, "local-review-required");
});

test("export validates source contract and strips hostile injected properties and remote claims", async () => {
  const p = starter();
  const report = await runDeveloperSavedPlanReleaseReview(p, raw(p, initial(p)));
  const clean = await runDeveloperLocalReleaseHandoff(p);
  assert.throws(() => exportDeveloperSavedPlanReview({ ...report, schema: "wrong" }), /actual saved-plan/);
  assert.throws(() => exportDeveloperSavedPlanReview({ ...report, kinds: [{ kind: "execute-network", count: 2 }] }), /actual saved-plan/);
  const injected = {
    ...report, scope: "PRIVATE_UNSAFE_PAYLOAD", filename: "PRIVATE_UNSAFE_PAYLOAD",
    failures: [{ file: "PRIVATE_UNSAFE_PAYLOAD", reason: "PRIVATE_UNSAFE_PAYLOAD" }],
    coverage: { ...report.coverage, uncoveredChanged: ["PRIVATE_UNSAFE_PAYLOAD"] },
  };
  const str = exportDeveloperReleaseEvidencePack({ ...clean, privateKey: "PRIVATE_UNSAFE_PAYLOAD" }, injected);
  assert.ok(!str.includes("PRIVATE_UNSAFE_PAYLOAD"));
  assert.equal(JSON.parse(str).productionVerified, false);
});

test("actual UI binds storage-change notifications, source signature and selected saved plan", () => {
  const panel = readFileSync(new URL("../src/components/developer/ProjectReleaseHandoffPanel.tsx", import.meta.url), "utf8");
  const suites = readFileSync(new URL("../src/components/developer/ProjectTestSuitePanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /Run with saved test plan/);
  assert.match(panel, /Export combined local evidence/);
  assert.match(panel, /runDeveloperCombinedReleaseReview\(project, raw, baseline\)/);
  assert.match(panel, /localStorage\.getItem\(DEVELOPER_RELEASE_PLAN_STORAGE_KEY\) !== lastRun\.planRaw/);
  assert.match(panel, /window\.addEventListener\("storage"/);
  assert.match(panel, /window\.addEventListener\("focus"/);
  assert.match(panel, /eternyx:developer-tests-saved/);
  assert.match(panel, /Open failed assertion/);
  assert.match(panel, /Run local release review/);
  assert.match(suites, /window\.dispatchEvent\(new Event\("eternyx:developer-tests-saved"\)\)/);
  assert.doesNotMatch(panel, /\bfetch\(|eval\(|allow-same-origin|runPreview\(/);
});
