import { normalizeDeveloperProject } from "./developerProjectLab.mjs";
import {
  DEVELOPER_TEST_STORAGE, MAX_DEVELOPER_TESTS, TEST_KINDS,
  normalizeDeveloperTestSuite, runDeveloperLocalTests,
} from "./developerProjectTests.mjs";
import { analyzeDeveloperProjectDependencies } from "./developerProjectDependencies.mjs";
import {
  exportDeveloperLocalReleaseHandoff, runDeveloperLocalReleaseHandoff,
} from "./developerProjectReleaseHandoff.mjs";

export const DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA = "eternyx-developer-saved-plan-review-v1";
export const DEVELOPER_RELEASE_EVIDENCE_PACK_SCHEMA = "eternyx-developer-release-evidence-pack-v1";
export const DEVELOPER_RELEASE_PLAN_STORAGE_KEY = DEVELOPER_TEST_STORAGE;

const MAX_STORAGE_BYTES = 45000;
const PLAN_ID = /^[a-z0-9-]{1,64}$/i;

/**
 * Fail closed for missing, corrupt and wrong-project plans. The existing
 * general-purpose plan reader intentionally skips invalid entries; a release
 * gate must never silently substitute defaults when the selected plan fails.
 */
export function readDeveloperReleaseSavedPlan(raw, projectId) {
  if (!PLAN_ID.test(projectId || "")) throw new Error("Release plan project identifier is invalid.");
  if (typeof raw !== "string" || raw.length > MAX_STORAGE_BYTES) {
    throw new Error("Saved release plan storage is unavailable or exceeds its limit.");
  }
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Saved release plan storage is invalid JSON."); }
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error("Saved release plan storage has an unsupported structure.");
  }
  const matching = value.filter(row => row && !Array.isArray(row) && row.projectId === projectId);
  if (matching.length === 0) throw new Error("Save a project test plan before opting into this release review.");
  if (matching.length !== 1) throw new Error("Duplicate saved release plans for this project must be resolved.");
  const tests = normalizeDeveloperTestSuite(matching[0].tests);
  if (tests.length < 1 || tests.length > MAX_DEVELOPER_TESTS) {
    throw new Error("Saved release plan has an invalid assertion count.");
  }
  return tests;
}

function classifyCoverage(project, baseline, cases) {
  const current = normalizeDeveloperProject(project);
  const previous = baseline === null ? null : normalizeDeveloperProject(baseline);
  if (previous && previous.id !== current.id) {
    throw new Error("The saved baseline belongs to a different project.");
  }
  const graph = analyzeDeveloperProjectDependencies(current, previous);
  const currentFiles = new Map(current.files.map(f => [f.name.toLowerCase(), f.name]));
  const covered = new Set(cases.map(c => c.file.toLowerCase()));
  const changed = graph.impact?.changed || [];
  const affected = graph.impact?.affected || [];
  const uncoveredChanged = changed.filter(name => currentFiles.has(name.toLowerCase()) && !covered.has(name.toLowerCase()));
  const uncoveredAffected = affected.filter(name => !covered.has(name.toLowerCase()));
  const deleted = changed.filter(name => !currentFiles.has(name.toLowerCase()));
  const uncoveredFiles = current.files.filter(f => !covered.has(f.name.toLowerCase()));
  return {
    fileCount: current.files.length,
    testedFileCount: current.files.length - uncoveredFiles.length,
    untestedFileCount: uncoveredFiles.length,
    baselineCompared: previous !== null,
    changedFileCount: previous ? changed.length : null,
    potentiallyAffectedFileCount: previous ? affected.length : null,
    uncoveredChangedFileCount: previous ? uncoveredChanged.length : null,
    uncoveredAffectedFileCount: previous ? uncoveredAffected.length : null,
    deletedFileCount: previous ? deleted.length : null,
    // In memory only: filenames support actual editor navigation.
    uncoveredChanged, uncoveredAffected, deleted, uncoveredFiles: uncoveredFiles.map(f => f.name),
  };
}

/**
 * Runs the exact explicitly saved declarative assertions against current
 * files. Never saves or executes user JS, invokes providers, or contacts hosts.
 */
export async function runDeveloperSavedPlanReleaseReview(project, savedRaw, baseline = null) {
  const current = normalizeDeveloperProject(project);
  const cases = readDeveloperReleaseSavedPlan(savedRaw, current.id);
  const coverage = classifyCoverage(current, baseline, cases);
  const evidence = await runDeveloperLocalTests(current, cases);
  const failures = evidence.results.filter(result => result.status === "failed")
    .map(result => ({
      file: result.file, line: result.line, kind: result.kind, reason: result.reason,
    }));
  const coverageGaps = coverage.baselineCompared && (
    coverage.uncoveredChangedFileCount > 0 || coverage.uncoveredAffectedFileCount > 0 ||
    coverage.deletedFileCount > 0);
  const status = evidence.status === "passed" && !coverageGaps ?
    "passed" : "review-required";
  const kinds = TEST_KINDS.filter(kind => cases.some(item => item.kind === kind))
    .map(kind => ({ kind, count: cases.filter(item => item.kind === kind).length }));
  return {
    schema: DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA,
    createdAt: new Date().toISOString(),
    status,
    assertionCount: cases.length,
    passedAssertions: evidence.passed,
    failedAssertions: evidence.failed,
    preflightPassed: evidence.preflightPassed,
    preflightErrors: evidence.preflightErrors,
    preflightTruncated: evidence.preflightTruncated,
    kinds,
    coverage,
    failures,
    scope: "Explicitly saved per-project declarative test plan, plus static/parser preflight and baseline coverage. Local only; no runtime or hosted verification.",
  };
}

function nonnegative(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function exportDeveloperSavedPlanReview(report) {
  if (!report || report.schema !== DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA ||
      !["passed", "review-required"].includes(report.status) ||
      !Array.isArray(report.kinds) ||
      !report.kinds.every(entry => TEST_KINDS.includes(entry.kind) && nonnegative(entry.count) !== null)) {
    throw new Error("Run an actual saved-plan review before exporting.");
  }
  const coverage = report.coverage || {};
  return {
    schema: DEVELOPER_SAVED_PLAN_REVIEW_SCHEMA,
    status: report.status,
    assertionCount: nonnegative(report.assertionCount),
    passedAssertions: nonnegative(report.passedAssertions),
    failedAssertions: nonnegative(report.failedAssertions),
    preflightPassed: report.preflightPassed === true,
    preflightErrors: nonnegative(report.preflightErrors),
    preflightTruncated: report.preflightTruncated === true,
    kinds: report.kinds.map(entry => ({ kind: entry.kind, count: nonnegative(entry.count) })),
    coverage: {
      fileCount: nonnegative(coverage.fileCount),
      testedFileCount: nonnegative(coverage.testedFileCount),
      untestedFileCount: nonnegative(coverage.untestedFileCount),
      baselineCompared: coverage.baselineCompared === true,
      changedFileCount: nonnegative(coverage.changedFileCount),
      potentiallyAffectedFileCount: nonnegative(coverage.potentiallyAffectedFileCount),
      uncoveredChangedFileCount: nonnegative(coverage.uncoveredChangedFileCount),
      uncoveredAffectedFileCount: nonnegative(coverage.uncoveredAffectedFileCount),
      deletedFileCount: nonnegative(coverage.deletedFileCount),
    },
    failureCount: Array.isArray(report.failures) ? report.failures.length : null,
  };
}

/** Independent local evidence sources, never a remote release credential. */
export async function runDeveloperCombinedReleaseReview(project, savedRaw, baseline = null) {
  const current = normalizeDeveloperProject(project);
  // Parse and validate before running the default preflight; failed plan
  // selection cannot silently turn into the default-only green verdict.
  readDeveloperReleaseSavedPlan(savedRaw, current.id);
  const [local, savedPlan] = await Promise.all([
    runDeveloperLocalReleaseHandoff(current, baseline),
    runDeveloperSavedPlanReleaseReview(current, savedRaw, baseline),
  ]);
  return { local, savedPlan };
}

export function exportDeveloperReleaseEvidencePack(local, savedPlan) {
  // Reuse the 3.7 redactor rather than trusting raw findings or user text.
  const localEvidence = JSON.parse(exportDeveloperLocalReleaseHandoff(local));
  const planEvidence = exportDeveloperSavedPlanReview(savedPlan);
  const localReady = localEvidence.localVerdict === "local-checks-passed" &&
    planEvidence.status === "passed";
  return JSON.stringify({
    schema: DEVELOPER_RELEASE_EVIDENCE_PACK_SCHEMA,
    createdAt: new Date().toISOString(),
    scope: "Local only: default source/preflight and explicitly saved custom assertions. Browser runtime, hosted staging, protected backend and production not verified.",
    localVerdict: localReady ? "local-checks-passed" : "local-review-required",
    defaultReview: localEvidence,
    savedPlanReview: planEvidence,
    releaseDecision: "HOLD_HOSTED_RELEASE",
    hostedStagingVerified: false,
    protectedBackendVerified: false,
    productionVerified: false,
  }, null, 2);
}
