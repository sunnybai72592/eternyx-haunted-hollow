import { normalizeDeveloperProject } from "./developerProjectLab.mjs";
import { normalizeDeveloperTestSuite } from "./developerProjectTests.mjs";
import { analyzeDeveloperProjectDependencies } from "./developerProjectDependencies.mjs";

export const DEVELOPER_RELEASE_TRIAGE_SCHEMA = "eternyx-developer-release-triage-v1";

export const DEVELOPER_TRIAGE_RULES = Object.freeze([
  "parser-or-static-error", "failed-saved-assertion", "unresolved-local-reference",
  "literal-import-cycle", "restricted-preview-warning", "uncovered-changed-file",
  "uncovered-dependent-file", "deleted-baseline-file", "weak-change-assertion",
  "duplicate-plan-assertion", "missing-plan-file", "untested-project-file",
  "baseline-not-available",
]);

const SEVERITY = Object.freeze({
  "parser-or-static-error": "blocker",
  "failed-saved-assertion": "blocker",
  "unresolved-local-reference": "blocker",
  "literal-import-cycle": "review",
  "restricted-preview-warning": "review",
  "uncovered-changed-file": "review",
  "uncovered-dependent-file": "review",
  "deleted-baseline-file": "review",
  "weak-change-assertion": "review",
  "duplicate-plan-assertion": "review",
  "missing-plan-file": "review",
  "untested-project-file": "info",
  "baseline-not-available": "info",
});

export const DEVELOPER_TRIAGE_ADVICE = Object.freeze({
  "parser-or-static-error": "Open the flagged source location, fix the parser or structural error, then rerun local preflight.",
  "failed-saved-assertion": "Review the failed saved assertion and its source location, then explicitly save and rerun the corrected plan.",
  "unresolved-local-reference": "Check the referenced local filename, spelling and supported flat-file path. Filename presence is not runtime loading.",
  "literal-import-cycle": "Inspect the reported JS or CSS import cycle and decide whether the relationship is intentional. The restricted preview does not execute module loading.",
  "restricted-preview-warning": "Remove unsupported preview resource access or test the behavior separately in an approved hosted environment.",
  "uncovered-changed-file": "Add and save a relevant assertion for this changed file. A basic existence check alone is not full behavior coverage.",
  "uncovered-dependent-file": "Add a saved assertion for this possibly affected dependent file and inspect its changed behavior.",
  "deleted-baseline-file": "Review consumers of the deleted file, remove stale references and update saved assertions.",
  "weak-change-assertion": "Add a content, selector, JSON-path or integration assertion. Existence-only checks do not demonstrate behavior.",
  "duplicate-plan-assertion": "Review repeated identical checks. Use limited plan slots for distinct, meaningful assertions.",
  "missing-plan-file": "Restore this file or explicitly revise and save the test plan. Do not silently skip the assertion.",
  "untested-project-file": "Consider a relevant saved assertion for this file; no assertion targets it in this plan.",
  "baseline-not-available": "Save or reopen a project to enable before/after changed-file and dependent-file coverage checks.",
});

const MEANINGFUL_KINDS = new Set([
  "text-contains", "text-absent", "json-path-equals", "json-array-length",
  "html-anchor-exists", "css-selector-exists",
  "html-image-alt", "html-lang-present",
  "html-title-present", "html-meta-viewport",
  "html-local-anchors-resolve", "html-duplicate-ids-absent",
  "html-local-files-resolve", "css-local-files-resolve", "js-local-imports-resolve",
]);
const MAX_TRIAGE_ITEMS = 64;

function lineNumber(value) { return Number.isSafeInteger(value) && value > 0 ? value : 0; }
function ruleOrder(code) { return DEVELOPER_TRIAGE_RULES.indexOf(code); }

/**
 * Uses only local project, the already executed combined-review results, and
 * exact saved assertions. Never re-runs user code, makes requests or infers
 * a completed hosted/staging check. File names are in-memory for navigation.
 */
export function analyzeDeveloperReleaseTriage(project, tests, baseline, combined) {
  const current = normalizeDeveloperProject(project);
  const previous = baseline === null ? null : normalizeDeveloperProject(baseline);
  if (previous && previous.id !== current.id) throw new Error("The triage baseline belongs to another project.");
  const cases = normalizeDeveloperTestSuite(tests);
  if (!combined?.local?.checks || !combined?.savedPlan?.failures) {
    throw new Error("Run the local and saved-plan release checks before diagnostics.");
  }
  const graph = analyzeDeveloperProjectDependencies(current, previous);
  const files = new Map(current.files.map(f => [f.name.toLowerCase(), f.name]));
  const targets = new Map();
  const substantive = new Set();
  const exactCases = new Set();
  const duplicates = new Set();
  for (const item of cases) {
    const key = item.file.toLowerCase();
    targets.set(key, (targets.get(key) || 0) + 1);
    if (MEANINGFUL_KINDS.has(item.kind)) substantive.add(key);
    const signature = JSON.stringify([item.kind, key, item.expected, item.path]);
    if (exactCases.has(signature)) duplicates.add(key);
    exactCases.add(signature);
  }
  const list = [];
  const seen = new Set();
  const push = (code, file = "", line = 0, count = 1) => {
    const key = JSON.stringify([code, file.toLowerCase(), lineNumber(line)]);
    if (seen.has(key) || count <= 0) return;
    seen.add(key);
    list.push({ code, severity: SEVERITY[code], file, line: lineNumber(line), count });
  };
  for (const finding of combined.local.findings || []) {
    if (finding.level === "error") push("parser-or-static-error", finding.file || "", finding.line);
  }
  for (const failed of combined.savedPlan.failures) {
    push("failed-saved-assertion", failed.file || "", failed.line);
  }
  for (const ref of graph.references) {
    if (ref.reason !== "resolved") push("unresolved-local-reference", ref.from, ref.line);
  }
  for (const cycle of graph.cycles) {
    for (const file of cycle.files) push("literal-import-cycle", file);
  }
  const restricted = combined.local.checks.find(item => item.id === "preview-compatibility");
  if (restricted?.status === "review-required") {
    push("restricted-preview-warning", "", 0,
      Number.isSafeInteger(restricted.count) && restricted.count > 0 ? restricted.count : 1);
  }
  if (previous === null) push("baseline-not-available");
  else {
    const change = graph.impact || { changed: [], affected: [] };
    for (const name of change.changed) {
      const key = name.toLowerCase();
      if (!files.has(key)) { push("deleted-baseline-file", name); continue; }
      if (!targets.has(key)) push("uncovered-changed-file", name);
      else if (!substantive.has(key)) push("weak-change-assertion", name);
    }
    for (const name of change.affected) {
      const key = name.toLowerCase();
      if (!targets.has(key)) push("uncovered-dependent-file", name);
      else if (!substantive.has(key)) push("weak-change-assertion", name);
    }
  }
  for (const item of cases) {
    if (!files.has(item.file.toLowerCase())) push("missing-plan-file", item.file);
  }
  for (const key of duplicates) {
    push("duplicate-plan-assertion", files.get(key) || key);
  }
  for (const item of current.files) {
    if (!targets.has(item.name.toLowerCase())) push("untested-project-file", item.name);
  }
  list.sort((a, b) => ruleOrder(a.code) - ruleOrder(b.code) ||
    a.file.localeCompare(b.file) || a.line - b.line);
  const counts = Object.fromEntries(DEVELOPER_TRIAGE_RULES.map(code =>
    [code, list.filter(item => item.code === code).reduce((sum, item) => sum + item.count, 0)]));
  const severityCounts = {
    blocker: list.filter(item => item.severity === "blocker").length,
    review: list.filter(item => item.severity === "review").length,
    info: list.filter(item => item.severity === "info").length,
  };
  return {
    schema: DEVELOPER_RELEASE_TRIAGE_SCHEMA,
    verdict: severityCounts.blocker || severityCounts.review ? "review-required" : "no-triage-findings",
    // This is a source-derived review queue, not a security score or hosted release gate.
    totalItems: list.length,
    truncated: list.length > MAX_TRIAGE_ITEMS,
    items: list.slice(0, MAX_TRIAGE_ITEMS),
    counts, severityCounts,
    baselineCompared: previous !== null,
  };
}

const nonnegative = v => Number.isSafeInteger(v) && v >= 0 ? v : null;

/** Only known rule codes and numeric totals may cross the export boundary. */
export function exportDeveloperReleaseTriage(report) {
  if (!report || report.schema !== DEVELOPER_RELEASE_TRIAGE_SCHEMA ||
    !DEVELOPER_TRIAGE_RULES.every(code => nonnegative(report.counts?.[code]) !== null)) {
    throw new Error("Run the current saved-plan diagnostic triage before export.");
  }
  return JSON.stringify({
    schema: DEVELOPER_RELEASE_TRIAGE_SCHEMA,
    scope: "Local source/test-plan heuristics. No filenames, raw test expectations, source excerpts, runtime or hosted evidence.",
    verdict: DEVELOPER_TRIAGE_RULES.some(code =>
      SEVERITY[code] !== "info" && report.counts[code] > 0) ? "review-required" : "no-triage-findings",
    counts: Object.fromEntries(DEVELOPER_TRIAGE_RULES.map(code => [code, nonnegative(report.counts[code])])),
    totalItems: nonnegative(report.totalItems),
    truncated: report.truncated === true,
    baselineCompared: report.baselineCompared === true,
    releaseDecision: "HOLD_HOSTED_RELEASE",
    productionVerified: false,
  }, null, 2);
}

/** Counts-only diff against the prior explicit review. No source strings. */
export function compareDeveloperReleaseTriage(previous, current) {
  if (!previous || !current || previous.schema !== DEVELOPER_RELEASE_TRIAGE_SCHEMA ||
    current.schema !== DEVELOPER_RELEASE_TRIAGE_SCHEMA) return null;
  const changes = DEVELOPER_TRIAGE_RULES.map(code => ({
    code,
    previous: nonnegative(previous.counts?.[code]),
    current: nonnegative(current.counts?.[code]),
  }));
  if (changes.some(item => item.previous === null || item.current === null)) return null;
  return {
    improved: changes.filter(item => item.current < item.previous),
    regressed: changes.filter(item => item.current > item.previous),
    unchanged: changes.filter(item => item.current === item.previous).length,
  };
}
