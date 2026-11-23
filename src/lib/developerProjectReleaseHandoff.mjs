import { normalizeDeveloperProject } from "./developerProjectLab.mjs";
import { runDeveloperPreflight } from "./developerProjectPreflight.mjs";
import { defaultDeveloperTests, runDeveloperLocalTests } from "./developerProjectTests.mjs";
import { analyzeDeveloperProjectDependencies } from "./developerProjectDependencies.mjs";

export const DEVELOPER_RELEASE_HANDOFF_SCHEMA = "eternyx-developer-local-handoff-v1";
export const DEVELOPER_RELEASE_CHECK_IDS = Object.freeze([
  "entry-structure", "static-and-js-preflight", "default-local-smoke",
  "cross-file-references", "import-cycle-review", "preview-compatibility",
  "hosted-staging", "protected-backend", "production",
]);

const REVIEW_STATUSES = new Set(["passed", "review-required", "not-verified"]);
const MAX_REVIEW_FINDINGS = 48;
const PREVIEW_COMPATIBILITY_RULES = new Set([
  "blocked-css-import", "blocked-css-url", "blocked-network",
  "blocked-script-src", "blocked-stylesheet-link",
]);

function entryResult(project) {
  const entry = project.files.find(file => file.name.toLowerCase() === "index.html");
  return { ok: Boolean(entry?.content.trim()), file: entry?.name || null };
}

function check(id, status, count = null) {
  return { id, status, count };
}

function reviewFindings(preflight, graph) {
  const findings = [];
  const seen = new Set();
  const add = (level, rule, file, line, column = 1) => {
    const key = [rule, file, line, column].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    if (findings.length < MAX_REVIEW_FINDINGS) findings.push({
      level, rule, file, line, column,
    });
  };
  for (const issue of preflight.syntaxFindings) {
    add("error", "js-parser-" + String(issue.code), issue.file, issue.line, issue.column);
  }
  for (const finding of preflight.staticFindings) {
    if (finding.level !== "info") add(finding.level, finding.rule, finding.file, finding.line);
  }
  for (const item of graph.references) {
    if (item.reason !== "resolved") add("warning", item.reason, item.from, item.line);
  }
  for (const cycle of graph.cycles) {
    for (const file of cycle.files) add("warning", cycle.kind + "-import-cycle", file, 1);
  }
  return { findings, truncated: seen.size > findings.length };
}

/**
 * All checks are browser-local; no source is evaluated, uploaded, deployed, or
 * used for HTTP requests. Passing local checks never clears the three mandatory
 * independently verified hosted/backend/production stages.
 */
export async function runDeveloperLocalReleaseHandoff(project, baseline = null) {
  const valid = normalizeDeveloperProject(project);
  const before = baseline === null ? null : normalizeDeveloperProject(baseline);
  const [preflight, smoke] = await Promise.all([
    runDeveloperPreflight(valid),
    runDeveloperLocalTests(valid, defaultDeveloperTests()),
  ]);
  const graph = analyzeDeveloperProjectDependencies(valid, before);
  const entry = entryResult(valid);
  const previewWarnings = preflight.staticFindings.filter(item =>
    PREVIEW_COMPATIBILITY_RULES.has(item.rule)).length;
  const localChecks = [
    check("entry-structure", entry.ok ? "passed" : "review-required", entry.ok ? 0 : 1),
    check("static-and-js-preflight",
      preflight.errors === 0 && preflight.warnings === 0 && !preflight.truncated ? "passed" : "review-required",
      preflight.errors + preflight.warnings + Number(preflight.truncated)),
    check("default-local-smoke", smoke.status === "passed" ? "passed" : "review-required",
      smoke.failed + Number(!smoke.preflightPassed)),
    check("cross-file-references", graph.unresolvedCount === 0 ? "passed" : "review-required", graph.unresolvedCount),
    check("import-cycle-review", graph.cycles.length === 0 ? "passed" : "review-required", graph.cycles.length),
    check("preview-compatibility", previewWarnings === 0 ? "passed" : "review-required", previewWarnings),
  ];
  const checks = [
    ...localChecks,
    check("hosted-staging", "not-verified"),
    check("protected-backend", "not-verified"),
    check("production", "not-verified"),
  ];
  const detailed = reviewFindings(preflight, graph);
  return {
    schema: DEVELOPER_RELEASE_HANDOFF_SCHEMA,
    createdAt: new Date().toISOString(),
    scope: "Browser-local source heuristics and parser plus the two default entry smoke assertions. Not the editable custom test suite, actual browser behavior, staging, backend access or production approval.",
    localVerdict: localChecks.every(item => item.status === "passed") ?
      "local-checks-passed" : "local-review-required",
    checks,
    filesChecked: valid.files.length,
    defaultSmokeAssertions: smoke.results.length,
    baselineCompared: before !== null,
    changedFileCount: graph.impact?.changed.length ?? null,
    potentiallyAffectedFileCount: graph.impact?.affected.length ?? null,
    findings: detailed.findings,
    findingsTruncated: detailed.truncated,
  };
}

/**
 * Whitelist only fixed identifiers/statuses/numeric counts. Source-bearing
 * filenames and line-level findings remain in-memory, never in portable JSON.
 * The UI separately refuses export when source or saved baseline changed.
 */
export function exportDeveloperLocalReleaseHandoff(report) {
  if (!report || report.schema !== DEVELOPER_RELEASE_HANDOFF_SCHEMA ||
      !Array.isArray(report.checks) || report.checks.length !== DEVELOPER_RELEASE_CHECK_IDS.length ||
      !DEVELOPER_RELEASE_CHECK_IDS.every((id, i) => report.checks[i]?.id === id &&
        REVIEW_STATUSES.has(report.checks[i].status))) {
    throw new Error("Run a current, valid local release handoff review first.");
  }
  const statuses = report.checks.map((item, index) => {
    const count = Number.isSafeInteger(item.count) && item.count >= 0 ? item.count : null;
    return { id: DEVELOPER_RELEASE_CHECK_IDS[index], status: item.status, count };
  });
  // Never trust a report claiming verification of remote scopes. This project
  // only supports local inspection and cannot attest to hosted readiness.
  for (const result of statuses.slice(6)) {
    result.status = "not-verified";
    result.count = null;
  }
  const localVerdict = statuses.slice(0, 6).every(result => result.status === "passed") ?
    "local-checks-passed" : "local-review-required";
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return JSON.stringify({
    schema: DEVELOPER_RELEASE_HANDOFF_SCHEMA,
    createdAt: typeof report.createdAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(report.createdAt) &&
      Number.isFinite(Date.parse(report.createdAt)) ?
      report.createdAt : null,
    scope: "Local static/parser/default-smoke evidence only; no source or filenames exported. Staging, backend, production NOT VERIFIED.",
    localVerdict,
    checks: statuses,
    filesChecked: count(report.filesChecked),
    defaultSmokeAssertions: count(report.defaultSmokeAssertions),
    baselineCompared: report.baselineCompared === true,
    changedFileCount: count(report.changedFileCount),
    potentiallyAffectedFileCount: count(report.potentiallyAffectedFileCount),
    findingsCount: Array.isArray(report.findings) ? report.findings.length : null,
    findingsTruncated: report.findingsTruncated === true,
    releaseDecision: "HOLD_HOSTED_RELEASE",
    productionVerified: false,
  }, null, 2);
}
