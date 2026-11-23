import { checkProjectFileName, normalizeDeveloperProject } from "./developerProjectLab.mjs";
import { runDeveloperPreflight } from "./developerProjectPreflight.mjs";
import { DEVELOPER_HTML_QUALITY_KINDS, DEVELOPER_CSS_QUALITY_KINDS,
  checkDeveloperHtmlQuality, checkDeveloperCssSelector, isSafeDeveloperCssSelector,
} from "./developerProjectQuality.mjs";
import { DEVELOPER_INTEGRATION_KINDS, checkDeveloperProjectIntegration, developerIntegrationKindForFile } from "./developerProjectIntegration.mjs";

export const DEVELOPER_TEST_SUITE_SCHEMA = "eternyx-developer-local-tests-v1";
export const DEVELOPER_TEST_REPORT_SCHEMA = "eternyx-developer-local-test-results-v1";
export const DEVELOPER_TEST_STORAGE = "eternyx:developer-local-tests:v1";
export const MAX_DEVELOPER_TESTS = 16;
export const MAX_TEST_SUITE_BYTES = 9000;
export const TEST_KINDS = Object.freeze([
  "file-exists", "file-nonempty", "text-contains", "text-absent",
  "json-valid", "json-path-equals", "json-array-length", "html-anchor-exists",
  ...DEVELOPER_HTML_QUALITY_KINDS, ...DEVELOPER_CSS_QUALITY_KINDS,
  ...DEVELOPER_INTEGRATION_KINDS,
]);

const PROJECT_ID = /^[a-z0-9-]{1,64}$/i;
const CASE_ID = /^[a-z0-9-]{1,64}$/i;
const JSON_PATH = /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,3}$/;
const SAFE_ANCHOR = /^[a-zA-Z][\w:.-]{0,79}$/;
const DEFAULT_CASES = Object.freeze([
  Object.freeze({ id: "entry-exists", kind: "file-exists", file: "index.html", expected: "", path: "" }),
  Object.freeze({ id: "entry-not-blank", kind: "file-nonempty", file: "index.html", expected: "", path: "" }),
]);

export function defaultDeveloperTests() {
  return DEFAULT_CASES.map(c => ({ ...c }));
}

export function normalizeDeveloperTestCase(testCase) {
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase) ||
      !CASE_ID.test(testCase.id || "") || !TEST_KINDS.includes(testCase.kind)) {
    throw new Error("Unsupported local test identifier or check kind.");
  }
  const file = checkProjectFileName(testCase.file);
  const expected = testCase.expected ?? "";
  const path = testCase.path ?? "";
  if (typeof expected !== "string" || expected.length > 120 ||
      typeof path !== "string" || path.length > 100) {
    throw new Error("Local test assertion fields exceed their limits.");
  }
  if (["text-contains", "text-absent"].includes(testCase.kind) && !expected.length) {
    throw new Error("Text assertion must contain 1–120 literal characters.");
  }
  if (["json-valid", "json-path-equals", "json-array-length"].includes(testCase.kind)) {
    if (!file.toLowerCase().endsWith(".json")) throw new Error("JSON checks require a .json file.");
  }
  if (testCase.kind === "json-path-equals" || testCase.kind === "json-array-length") {
    if (!JSON_PATH.test(path)) throw new Error("JSON path supports up to four simple safe object keys.");
    if (testCase.kind === "json-array-length") {
      if (!/^(0|[1-9]\d{0,4})$/.test(expected)) {
        throw new Error("JSON array length expects a nonnegative integer up to 99999.");
      }
    } else {
    let scalar;
    try { scalar = JSON.parse(expected); }
    catch { throw new Error("JSON expected value must be a valid JSON scalar."); }
    if (scalar !== null && typeof scalar === "object") throw new Error("JSON expected value must be a scalar.");
    }
  }
  if (DEVELOPER_HTML_QUALITY_KINDS.includes(testCase.kind)) {
    if (file.toLowerCase() !== "index.html") throw new Error("HTML quality checks require index.html.");
  }
  if (DEVELOPER_CSS_QUALITY_KINDS.includes(testCase.kind)) {
    if (!file.toLowerCase().endsWith(".css") || !isSafeDeveloperCssSelector(expected)) {
      throw new Error("CSS selector checks require a .css file and safe literal selector.");
    }
  }
  if (DEVELOPER_INTEGRATION_KINDS.includes(testCase.kind) && developerIntegrationKindForFile(file) !== testCase.kind) {
    throw new Error("Integration checks require index.html, a .css source or a .js source, respectively.");
  }
  if (testCase.kind === "html-anchor-exists") {
    if (file.toLowerCase() !== "index.html" || !SAFE_ANCHOR.test(expected)) {
      throw new Error("Anchor checks require index.html and a simple HTML id.");
    }
  }
  return { id: testCase.id, kind: testCase.kind, file, expected, path };
}

export function normalizeDeveloperTestSuite(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DEVELOPER_TESTS) {
    throw new Error("Local test suite must contain 1–16 checks.");
  }
  const ids = new Set();
  return raw.map(rawCase => {
    const testCase = normalizeDeveloperTestCase(rawCase);
    if (ids.has(testCase.id)) throw new Error("Duplicate local test identifier.");
    ids.add(testCase.id);
    return testCase;
  });
}

function scalarEqual(actual, expected) {
  return actual === expected || (actual === null && expected === null);
}

function checkOne(file, testCase, project) {
  if (testCase.kind === "file-exists") return { ok: !!file, reason: file ? "file-present" : "missing-file", line: file ? 1 : 0 };
  if (!file) return { ok: false, reason: "missing-file", line: 0 };
  if (testCase.kind === "file-nonempty") return {
    ok: !!file.content.trim(), reason: file.content.trim() ? "nonempty" : "empty-file", line: 1,
  };
  if (testCase.kind === "text-contains" || testCase.kind === "text-absent") {
    const index = file.content.indexOf(testCase.expected);
    const contains = index >= 0;
    const ok = testCase.kind === "text-contains" ? contains : !contains;
    return { ok, reason: ok ? "assertion-met" : (contains ? "forbidden-text-present" : "required-text-missing"),
      line: index >= 0 ? file.content.slice(0, index).split("\n").length : 0 };
  }
  if (["json-valid", "json-path-equals", "json-array-length"].includes(testCase.kind)) {
    let value;
    try { value = JSON.parse(file.content); }
    catch { return { ok: false, reason: "invalid-json", line: 1 }; }
    if (testCase.kind === "json-valid") return { ok: true, reason: "valid-json", line: 1 };
    for (const segment of testCase.path.split(".")) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) {
        return { ok: false, reason: "json-path-missing", line: 0 };
      }
      value = value[segment];
    }
    if (testCase.kind === "json-array-length") {
      const pass = Array.isArray(value) && value.length === Number(testCase.expected);
      return { ok: pass, reason: pass ? "json-array-length-matched" :
        (Array.isArray(value) ? "json-array-length-different" : "json-value-not-array"), line: 0 };
    }
    const pass = scalarEqual(value, JSON.parse(testCase.expected));
    return { ok: pass, reason: pass ? "json-value-matched" : "json-value-different", line: 0 };
  }
  if (DEVELOPER_HTML_QUALITY_KINDS.includes(testCase.kind)) {
    return checkDeveloperHtmlQuality(file.content, testCase.kind);
  }
  if (DEVELOPER_CSS_QUALITY_KINDS.includes(testCase.kind)) {
    return checkDeveloperCssSelector(file.content, testCase.expected);
  }
  if (DEVELOPER_INTEGRATION_KINDS.includes(testCase.kind)) {
    return checkDeveloperProjectIntegration(project, testCase.kind, testCase.file);
  }
  if (testCase.kind === "html-anchor-exists") {
    const ids = /\bid\s*=\s*(["'])([^"']+)\1/gi;
    for (const match of file.content.matchAll(ids)) {
      if (match[2] === testCase.expected) {
        return { ok: true, reason: "anchor-found", line: file.content.slice(0, match.index).split("\n").length };
      }
    }
    return { ok: false, reason: "anchor-not-found", line: 0 };
  }
  throw new Error("Unsupported local test kind.");
}

export async function runDeveloperLocalTests(project, tests) {
  const valid = normalizeDeveloperProject(project);
  const cases = normalizeDeveloperTestSuite(tests);
  // Real static findings and JavaScript parser checks; do not evaluate source.
  const preflight = await runDeveloperPreflight(valid);
  const results = cases.map((item, index) => {
    const file = valid.files.find(candidate => candidate.name.toLowerCase() === item.file.toLowerCase()) || null;
    const outcome = checkOne(file, item, valid);
    return { index: index + 1, kind: item.kind, file: item.file, status: outcome.ok ? "passed" : "failed",
      reason: outcome.reason, line: outcome.line };
  });
  const failed = results.filter(item => item.status === "failed").length;
  const preflightPassed = preflight.errors === 0 && !preflight.truncated;
  const report = {
    schema: DEVELOPER_TEST_REPORT_SCHEMA,
    createdAt: new Date().toISOString(),
    results, passed: results.length - failed, failed,
    preflightPassed, preflightErrors: preflight.errors, preflightWarnings: preflight.warnings,
    preflightTruncated: preflight.truncated,
    status: failed === 0 && preflightPassed ? "passed" : "review-required",
    scope: "Actual local file/text/JSON/anchor and bounded cross-file reference assertions plus static/parser preflight. No code execution, resource loading, backend tests, or deployment approval.",
  };
  return report;
}

export function exportDeveloperLocalTestReport(report) {
  if (!report || report.schema !== DEVELOPER_TEST_REPORT_SCHEMA || !Array.isArray(report.results)) {
    throw new Error("Run current local tests before exporting results.");
  }
  // Filter all source-bearing and attacker-supplied fields, including expectation,
  // label, JSON value, path, error messages, test ID, and file contents.
  return JSON.stringify({
    schema: DEVELOPER_TEST_REPORT_SCHEMA,
    createdAt: report.createdAt,
    status: report.status,
    passed: report.passed, failed: report.failed,
    preflightPassed: report.preflightPassed, preflightErrors: report.preflightErrors,
    preflightWarnings: report.preflightWarnings, preflightTruncated: report.preflightTruncated,
    scope: "Browser-local declarative assertions and parser preflight only; source strings and expected values excluded.",
    results: report.results.map(({ index, kind, status, reason, line }) =>
      ({ index, kind, status, reason, line })),
  }, null, 2);
}

export function exportDeveloperTestSuite(tests) {
  return JSON.stringify({ schema: DEVELOPER_TEST_SUITE_SCHEMA, tests: normalizeDeveloperTestSuite(tests) }, null, 2);
}

export function importDeveloperTestSuite(raw) {
  if (typeof raw !== "string" || raw.length > MAX_TEST_SUITE_BYTES) {
    throw new Error("Local test plan must be under 9,000 characters.");
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Test plan is not valid JSON."); }
  if (!parsed || parsed.schema !== DEVELOPER_TEST_SUITE_SCHEMA) throw new Error("Unsupported local test plan.");
  return normalizeDeveloperTestSuite(parsed.tests);
}

export function readSavedDeveloperTestSuites(raw) {
  if (typeof raw !== "string" || raw.length > 45000) return [];
  let list;
  try { list = JSON.parse(raw); }
  catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const valid = [];
  for (const item of list.slice(0, 5)) {
    try {
      if (!PROJECT_ID.test(item?.projectId || "") || seen.has(item.projectId)) continue;
      valid.push({ projectId: item.projectId, tests: normalizeDeveloperTestSuite(item.tests) });
      seen.add(item.projectId);
    } catch { /* Invalid browser data is never trusted. */ }
  }
  return valid;
}

export function upsertSavedDeveloperTestSuite(saved, projectId, tests) {
  if (!PROJECT_ID.test(projectId || "")) throw new Error("Invalid test suite project identifier.");
  const valid = normalizeDeveloperTestSuite(tests);
  const current = readSavedDeveloperTestSuites(JSON.stringify(saved));
  const index = current.findIndex(item => item.projectId === projectId);
  if (index >= 0) return current.map(item => item.projectId === projectId ? { projectId, tests: valid } : item);
  if (current.length >= 5) throw new Error("At most five local project test suites can be saved.");
  return [...current, { projectId, tests: valid }];
}
