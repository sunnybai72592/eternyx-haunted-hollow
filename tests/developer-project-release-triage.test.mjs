import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDeveloperProject, addDeveloperFile, editDeveloperFile, removeDeveloperFile,
} from "../src/lib/developerProjectLab.mjs";
import {
  runDeveloperCombinedReleaseReview,
} from "../src/lib/developerProjectReleaseIntegration.mjs";
import {
  DEVELOPER_RELEASE_TRIAGE_SCHEMA, DEVELOPER_TRIAGE_RULES, DEVELOPER_TRIAGE_ADVICE,
  analyzeDeveloperReleaseTriage, compareDeveloperReleaseTriage,
  exportDeveloperReleaseTriage,
} from "../src/lib/developerProjectReleaseTriage.mjs";

const starter = () => createDeveloperProject("starter", "triage-39");
const named = (id, kind, file, expected = "", path = "") => ({ id, kind, file, expected, path });
const baseCases = () => [
  named("entry", "file-exists", "index.html"),
  named("body", "file-nonempty", "index.html"),
  named("js", "text-absent", "app.js", "PRIVATE_SHOULD_NOT_BE_PRESENT"),
];
const saved = (project, tests) => JSON.stringify([{ projectId: project.id, tests }]);
async function inspect(project, tests = baseCases(), baseline = null) {
  const combined = await runDeveloperCombinedReleaseReview(project, saved(project, tests), baseline);
  return analyzeDeveloperReleaseTriage(project, tests, baseline, combined);
}
const counts = report => JSON.parse(exportDeveloperReleaseTriage(report)).counts;

test("clean starter produces only honest informational no-baseline and untested-file findings", async () => {
  const result = await inspect(starter());
  assert.equal(result.schema, DEVELOPER_RELEASE_TRIAGE_SCHEMA);
  assert.equal(result.verdict, "no-actionable-findings");
  assert.equal(result.severityCounts.blocker, 0);
  assert.equal(result.severityCounts.review, 0);
  assert.equal(result.counts["baseline-not-available"], 1);
  assert.equal(result.counts["untested-project-file"], 1);
  assert.equal(result.baselineCompared, false);
  assert.deepEqual(result.items.map(x => x.code), ["untested-project-file", "baseline-not-available"]);
  assert.ok(result.items.every(x => DEVELOPER_TRIAGE_ADVICE[x.code]));
  assert.equal(DEVELOPER_TRIAGE_RULES.length, 13);
});

test("real broken JavaScript, failed saved assertion and unresolved HTML references yield source-level priority triage", async () => {
  let p = starter();
  p = editDeveloperFile(p, "app.js", 'const secret = "PRIVATE_SHOULD_NOT_BE_PRESENT";\nfunction bad( {');
  p = editDeveloperFile(p, "index.html", '<script src="./SENSITIVE_TARGET_221.js"></script>');
  const result = await inspect(p);
  assert.equal(result.verdict, "review-required");
  assert.ok(result.counts["parser-or-static-error"] >= 1);
  assert.equal(result.counts["failed-saved-assertion"], 1);
  assert.equal(result.counts["unresolved-local-reference"], 1);
  assert.ok(result.items.find(x => x.code === "failed-saved-assertion" && x.file === "app.js"));
  assert.ok(result.items.find(x => x.code === "unresolved-local-reference" && x.file === "index.html" && x.line === 1));
  assert.ok(!JSON.stringify(result.items).includes("SENSITIVE_TARGET_221"));
  assert.ok(!JSON.stringify(result.items).includes("PRIVATE_SHOULD_NOT_BE_PRESENT"));
  const exported = exportDeveloperReleaseTriage(result);
  assert.ok(!exported.includes("app.js"));
  assert.ok(!exported.includes("index.html"));
  assert.ok(!exported.includes("SENSITIVE_TARGET_221"));
  assert.ok(!exported.includes("PRIVATE_SHOULD_NOT_BE_PRESENT"));
});

test("literal stylesheet cycles and restricted preview warnings are grouped without claiming runtime proof", async () => {
  let p = starter();
  p = addDeveloperFile(p, "theme.css", '@import "./styles.css";');
  p = editDeveloperFile(p, "styles.css", '@import "./theme.css";');
  const result = await inspect(p);
  assert.equal(result.counts["literal-import-cycle"], 2);
  assert.equal(result.counts["restricted-preview-warning"], 2);
  assert.ok(result.items.some(x => x.code === "literal-import-cycle" && x.file === "theme.css"));
  assert.equal(result.severityCounts.blocker, 0);
  assert.ok(result.severityCounts.review > 0);
});

test("impacted files with existence-only checks have weak coverage; substantive checks clear it", async () => {
  let p = starter();
  p = addDeveloperFile(p, "helper.js", "export const n = 1");
  p = editDeveloperFile(p, "app.js", 'import "./helper.js";');
  p = editDeveloperFile(p, "index.html", '<script src="./app.js"></script>');
  const current = editDeveloperFile(p, "helper.js", "export const n = 2");
  const shallow = [
    named("a", "file-exists", "index.html"),
    named("b", "file-exists", "app.js"),
    named("c", "file-nonempty", "helper.js"),
  ];
  const report = await inspect(current, shallow, p);
  assert.equal(report.counts["weak-change-assertion"], 3);
  assert.equal(report.counts["uncovered-changed-file"], 0);
  assert.equal(report.counts["uncovered-dependent-file"], 0);
  assert.equal(report.verdict, "review-required");
  const substantive = [
    named("a", "text-contains", "index.html", '<script'),
    named("b", "text-contains", "app.js", 'import'),
    named("c", "text-contains", "helper.js", "export const n"),
  ];
  const improved = await inspect(current, substantive, p);
  assert.equal(improved.counts["weak-change-assertion"], 0);
  assert.equal(improved.counts["uncovered-changed-file"], 0);
  assert.equal(improved.counts["uncovered-dependent-file"], 0);
});

test("changed-file gaps, dependent gaps and deleted files are separately actionable", async () => {
  let p = starter();
  p = addDeveloperFile(p, "helper.js", "export const n = 1");
  p = editDeveloperFile(p, "app.js", 'import "./helper.js";');
  p = editDeveloperFile(p, "index.html", '<script src="./app.js"></script>');
  const changed = editDeveloperFile(p, "helper.js", "export const n = 2");
  const cases = [named("one", "file-exists", "index.html")];
  const result = await inspect(changed, cases, p);
  assert.equal(result.counts["uncovered-changed-file"], 1);
  assert.equal(result.counts["uncovered-dependent-file"], 1);
  assert.equal(result.counts["weak-change-assertion"], 1);
  const deleted = await inspect(removeDeveloperFile(p, "helper.js"), cases, p);
  assert.equal(deleted.counts["deleted-baseline-file"], 1);
  assert.ok(deleted.items.some(x => x.code === "deleted-baseline-file" && x.file === "helper.js"));
});

test("identical assertions and saved assertions pointing to absent files produce diagnostics", async () => {
  const p = starter();
  const cases = [
    named("one", "file-exists", "index.html"),
    named("two", "file-exists", "index.html"),
    named("missing", "file-exists", "PRIVATE_MISSING_FILE.js"),
  ];
  const result = await inspect(p, cases);
  assert.equal(result.counts["duplicate-plan-assertion"], 1);
  assert.equal(result.counts["missing-plan-file"], 1);
  assert.equal(result.counts["failed-saved-assertion"], 1);
  assert.equal(result.verdict, "review-required");
  assert.ok(!exportDeveloperReleaseTriage(result).includes("PRIVATE_MISSING_FILE"));
});

test("category-count deltas distinguish improving from regressing diagnostics without exposing code", async () => {
  const first = await inspect(starter());
  let bad = editDeveloperFile(starter(), "index.html", '<script src="./private.js"></script>');
  const second = await inspect(bad);
  const delta = compareDeveloperReleaseTriage(first, second);
  assert.ok(delta.regressed.some(item => item.code === "unresolved-local-reference" && item.current > item.previous));
  assert.ok(delta.regressed.some(item => item.code === "restricted-preview-warning"));
  assert.equal(delta.improved.length, 0);
  const reverse = compareDeveloperReleaseTriage(second, first);
  assert.ok(reverse.improved.some(item => item.code === "unresolved-local-reference"));
  assert.equal(compareDeveloperReleaseTriage(null, second), null);
  assert.equal(compareDeveloperReleaseTriage(first, {}), null);
});

test("the redacted export uses strictly known categories and rejects forged status while retaining mandatory hold", async () => {
  const clean = await inspect(starter());
  const raw = exportDeveloperReleaseTriage({ ...clean,
    verdict: "approved-production", files: ["SECRET-APP.JS"],
    items: [{ code: "private", file: "SECRET-APP.JS" }],
    source: "TOP-PRIVATE-DATA",
  });
  assert.ok(!raw.includes("SECRET-APP.JS"));
  assert.ok(!raw.includes("TOP-PRIVATE-DATA"));
  const payload = JSON.parse(raw);
  assert.equal(payload.verdict, "no-actionable-findings");
  assert.equal(payload.productionVerified, false);
  assert.equal(payload.releaseDecision, "HOLD_HOSTED_RELEASE");
  assert.deepEqual(Object.keys(payload.counts), DEVELOPER_TRIAGE_RULES);
  assert.throws(() => exportDeveloperReleaseTriage({ ...clean, schema: "invented" }), /current saved-plan/);
  assert.throws(() => exportDeveloperReleaseTriage({ ...clean, counts: { ...clean.counts, "literal-import-cycle": -3 } }), /current saved-plan/);
  assert.equal(typeof counts(clean)["untested-project-file"], "number");
});

test("UI wires real saved-plan results, prioritized diagnostics, navigation, change delta and stale export", () => {
  const panel = readFileSync(new URL("../src/components/developer/ProjectReleaseHandoffPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /analyzeDeveloperReleaseTriage\(project, tests, baseline, next\)/);
  assert.match(panel, /compareDeveloperReleaseTriage\(lastRun\.triage, triage\)/);
  assert.match(panel, /Export redacted diagnostic summary/);
  assert.match(panel, /Prioritized integration diagnostics/);
  assert.match(panel, /Open diagnostic source/);
  assert.match(panel, /combinedStale \|\| running/);
  assert.match(panel, /showAllTriage/);
  assert.match(panel, /DEVELOPER_TRIAGE_ADVICE\[item\.code\]/);
  assert.doesNotMatch(panel, /\bfetch\(|eval\(|allow-same-origin|runPreview\(/);
});
