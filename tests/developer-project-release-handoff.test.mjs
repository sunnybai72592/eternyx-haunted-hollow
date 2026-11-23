import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDeveloperProject, addDeveloperFile, editDeveloperFile, removeDeveloperFile } from "../src/lib/developerProjectLab.mjs";
import {
  DEVELOPER_RELEASE_HANDOFF_SCHEMA, DEVELOPER_RELEASE_CHECK_IDS,
  runDeveloperLocalReleaseHandoff, exportDeveloperLocalReleaseHandoff,
} from "../src/lib/developerProjectReleaseHandoff.mjs";

const starter = () => createDeveloperProject("starter", "release-handoff-37");
const status = (report, id) => report.checks.find(item => item.id === id);

test("clean starter clears only local source checks and never invents a hosted green light", async () => {
  const report = await runDeveloperLocalReleaseHandoff(starter());
  assert.equal(report.schema, DEVELOPER_RELEASE_HANDOFF_SCHEMA);
  assert.equal(report.localVerdict, "local-checks-passed");
  assert.deepEqual(report.checks.map(c => c.id), DEVELOPER_RELEASE_CHECK_IDS);
  assert.deepEqual(report.checks.slice(0, 6).map(c => c.status), Array(6).fill("passed"));
  assert.deepEqual(report.checks.slice(6).map(c => c.status), Array(3).fill("not-verified"));
  assert.equal(report.defaultSmokeAssertions, 2);
  assert.equal(report.baselineCompared, false);
  assert.equal(report.changedFileCount, null);
  assert.equal(report.potentiallyAffectedFileCount, null);
  assert.equal(report.findings.length, 0);
  assert.match(report.scope, /not.*custom test suite/i);
});

test("missing entry and blank HTML fail local structure, default smoke and preflight", async () => {
  const blank = editDeveloperFile(createDeveloperProject("blank", "release-handoff-37"), "index.html", " ");
  const result = await runDeveloperLocalReleaseHandoff(blank);
  assert.equal(result.localVerdict, "local-review-required");
  assert.equal(status(result, "entry-structure").status, "review-required");
  assert.equal(status(result, "default-local-smoke").status, "review-required");
  const missing = removeDeveloperFile(starter(), "index.html");
  const report = await runDeveloperLocalReleaseHandoff(missing);
  assert.equal(status(report, "entry-structure").status, "review-required");
  assert.ok(report.findings.some(item => item.rule === "missing-entry"));
  assert.ok(report.checks.slice(6).every(item => item.status === "not-verified"));
});

test("actual JavaScript parser errors require review and expose a local source jump", async () => {
  const broken = editDeveloperFile(starter(), "app.js", "const privateValue=1;\nfunction broken( {");
  const report = await runDeveloperLocalReleaseHandoff(broken);
  assert.equal(report.localVerdict, "local-review-required");
  assert.equal(status(report, "static-and-js-preflight").status, "review-required");
  assert.equal(status(report, "default-local-smoke").status, "review-required");
  assert.ok(report.findings.some(f => f.rule.startsWith("js-parser-") && f.file === "app.js"));
  assert.ok(!JSON.stringify(report).includes("privateValue"));
});

test("missing graph references are failures in release review and preserve bounded line navigation", async () => {
  const project = editDeveloperFile(starter(), "index.html", [
    "<main>Landing</main>",
    '<script src="./PRIVATE_UNRESOLVED_712.js"></script>',
  ].join("\n"));
  const report = await runDeveloperLocalReleaseHandoff(project);
  assert.equal(status(report, "cross-file-references").count, 1);
  assert.equal(status(report, "cross-file-references").status, "review-required");
  assert.equal(status(report, "preview-compatibility").status, "review-required");
  assert.ok(report.findings.some(item => item.file === "index.html" &&
    item.rule === "missing-local-reference" && item.line === 2));
  assert.ok(!JSON.stringify(report.findings).includes("PRIVATE_UNRESOLVED_712"));
});

test("literal import cycles and unsupported preview CSS imports are recorded but never executed", async () => {
  let p = addDeveloperFile(starter(), "theme.css", '@import "./styles.css";');
  p = editDeveloperFile(p, "styles.css", '@import "./theme.css";');
  const report = await runDeveloperLocalReleaseHandoff(p);
  assert.equal(status(report, "cross-file-references").status, "passed");
  assert.equal(status(report, "import-cycle-review").count, 1);
  assert.equal(status(report, "import-cycle-review").status, "review-required");
  assert.equal(status(report, "preview-compatibility").status, "review-required");
  assert.ok(report.findings.some(f => f.rule === "css-import-cycle" && f.file === "styles.css"));
});

test("same project and saved baseline report no edits; actual edits count affected dependents", async () => {
  let p = starter();
  p = addDeveloperFile(p, "helper.js", "export const y = 1");
  p = editDeveloperFile(p, "index.html", '<script src="./app.js"></script>');
  p = editDeveloperFile(p, "app.js", 'import "./helper.js";');
  const unchanged = await runDeveloperLocalReleaseHandoff(p, p);
  assert.equal(unchanged.changedFileCount, 0);
  assert.equal(unchanged.potentiallyAffectedFileCount, 0);
  const updated = editDeveloperFile(p, "helper.js", "export const y = 2");
  const changed = await runDeveloperLocalReleaseHandoff(updated, p);
  assert.equal(changed.baselineCompared, true);
  assert.equal(changed.changedFileCount, 1);
  assert.equal(changed.potentiallyAffectedFileCount, 2);
  assert.ok(changed.checks.slice(6).every(c => c.status === "not-verified"));
});

test("export uses strictly fixed keys and strips all source, paths, lines and credentials", async () => {
  let p = starter();
  p = editDeveloperFile(p, "app.js", 'const PRIVATE_TOKEN_132 = "SENSITIVE_VALUE_987";');
  p = editDeveloperFile(p, "index.html", '<script src="./PRIVATE_REFERENCE_356.js"></script>');
  const report = await runDeveloperLocalReleaseHandoff(p);
  const raw = exportDeveloperLocalReleaseHandoff(report);
  const evidence = JSON.parse(raw);
  assert.equal(evidence.schema, DEVELOPER_RELEASE_HANDOFF_SCHEMA);
  assert.equal(evidence.releaseDecision, "HOLD_HOSTED_RELEASE");
  assert.equal(evidence.productionVerified, false);
  assert.equal(evidence.localVerdict, "local-review-required");
  assert.equal(evidence.findingsCount, report.findings.length);
  assert.ok(evidence.checks.slice(6).every(item => item.status === "not-verified"));
  for (const text of ["PRIVATE_TOKEN_132", "SENSITIVE_VALUE_987", "PRIVATE_REFERENCE_356", "app.js",
    "index.html", "files", "line", "reference-case-mismatch", "userId", "path"]) {
    if (text === "files") continue; // 'filesChecked' is an intentional count-only field.
    assert.ok(!raw.includes(text), "Unexpected evidence data: " + text);
  }
  assert.ok(!Object.hasOwn(evidence, "findings"));
  assert.ok(!Object.hasOwn(evidence, "project"));
});

test("export fails closed for unknown checks and forces false hosted success back to not-verified", async () => {
  const report = await runDeveloperLocalReleaseHandoff(starter());
  assert.throws(() => exportDeveloperLocalReleaseHandoff({ schema: "unknown", checks: report.checks }), /current, valid/);
  assert.throws(() => exportDeveloperLocalReleaseHandoff({ ...report, checks: report.checks.slice(1) }), /current, valid/);
  assert.throws(() => exportDeveloperLocalReleaseHandoff({ ...report,
    checks: report.checks.map((c, i) => i === 0 ? { ...c, id: "injected" } : c),
  }), /current, valid/);
  const hostile = { ...report, source: "PRIVATE_SOURCE_999",
    checks: report.checks.map((c, i) => i >= 6 ? { ...c, status: "passed", count: 42,
      credentials: "DO_NOT_EXPORT" } : c),
    findings: [{ file: "PRIVATE_SOURCE_999", source: "DO_NOT_EXPORT" }],
  };
  const text = exportDeveloperLocalReleaseHandoff(hostile);
  assert.ok(!text.includes("PRIVATE_SOURCE_999"));
  assert.ok(!text.includes("DO_NOT_EXPORT"));
  assert.ok(JSON.parse(text).checks.slice(6).every(c => c.status === "not-verified" && c.count === null));
  assert.equal(JSON.parse(text).releaseDecision, "HOLD_HOSTED_RELEASE");
});

test("UI is explicit, stale-safe, navigable and never deploys or fetches", () => {
  const page = readFileSync(new URL("../src/pages/DeveloperProjectLab.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/developer/ProjectReleaseHandoffPanel.tsx", import.meta.url), "utf8");
  assert.match(page, /<ProjectReleaseHandoffPanel project=\{project\} baseline=\{savedBaseline\} onJump=\{jumpToMatch\}/);
  assert.match(panel, /Run local release review/);
  assert.match(panel, /Project or baseline changed\. Release review is stale/);
  assert.match(panel, /disabled=\{!report \|\| stale \|\| running\}/);
  assert.match(panel, /Export redacted handoff/);
  assert.match(panel, /developerLinePosition/);
  assert.match(panel, /Open review location/);
  assert.match(panel, /Run the review explicitly/);
  assert.doesNotMatch(panel, /\bfetch\(|eval\(|allow-same-origin|runPreview\(/);
});
