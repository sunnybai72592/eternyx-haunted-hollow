import { sanitizedApiLocation } from "./apiWorkspaceUtils.mjs";

export const PROJECT_API_SUITE_KEY = "eternyx:developer-project-api-suites:v1";
export const PROJECT_API_REPORT_SCHEMA = "eternyx-project-api-report-v1";
export const PROJECT_API_IMPORT_SCHEMA = "eternyx-project-api-suite-v1";
export const MAX_PROJECT_SCENARIOS = 8;
export const MAX_TOTAL_SCENARIOS = 30;
const PROJECT_ID = /^[a-z0-9-]{1,64}$/i;
const SCENARIO_ID = /^[a-z0-9-]{1,64}$/i;
const MAX_RUNTIME_MS = 20_000;

function projectId(value) {
  if (typeof value !== "string" || !PROJECT_ID.test(value)) throw new Error("Save a valid local project before linking API checks.");
  return value;
}

export function normalizeProjectApiScenario(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid API scenario.");
  const id = typeof item.id === "string" && SCENARIO_ID.test(item.id) ? item.id : "";
  const linkedProjectId = projectId(item.projectId);
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name || name.length > 72) throw new Error("Scenario name must contain 1–72 characters.");
  const method = String(item.method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(method)) throw new Error("Only GET and HEAD are supported for API smoke checks.");
  const url = sanitizedApiLocation(item.url);
  if (url.startsWith("{{")) throw new Error("Use a complete HTTP(S) URL; runtime variables are not persisted in project suites.");
  // URL query and fragment are omitted from persisted scenarios, including import.
  const expectedStatus = Number(item.expectedStatus);
  if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
    throw new Error("Expected status must be an HTTP status between 100 and 599.");
  }
  const maxDurationMs = Number(item.maxDurationMs);
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > MAX_RUNTIME_MS) {
    throw new Error("Maximum response time must be 1–20000 ms.");
  }
  return { id, projectId: linkedProjectId, name, method, url, expectedStatus, maxDurationMs };
}

export function normalizeProjectApiScenarios(value, validProjectIds) {
  if (!Array.isArray(value)) return [];
  const projects = validProjectIds ? new Set(validProjectIds) : null;
  const ids = new Set();
  const perProject = new Map();
  const clean = [];
  for (const item of value.slice(0, MAX_TOTAL_SCENARIOS)) {
    try {
      const scenario = normalizeProjectApiScenario(item);
      if (!scenario.id || ids.has(scenario.id)) continue;
      if (projects && !projects.has(scenario.projectId)) continue;
      const count = perProject.get(scenario.projectId) || 0;
      if (count >= MAX_PROJECT_SCENARIOS) continue;
      ids.add(scenario.id);
      perProject.set(scenario.projectId, count + 1);
      clean.push(scenario);
    } catch { /* Browser storage is untrusted: drop invalid entries. */ }
  }
  return clean;
}

export function addProjectApiScenario(collection, input, projectIds) {
  const safe = normalizeProjectApiScenarios(collection, projectIds);
  const candidate = normalizeProjectApiScenario(input);
  if (!candidate.id) throw new Error("Scenario identifier is required.");
  if (projectIds && !new Set(projectIds).has(candidate.projectId)) throw new Error("Project is not saved in this browser.");
  if (safe.some((item) => item.id === candidate.id)) throw new Error("Duplicate scenario ID.");
  if (safe.filter((item) => item.projectId === candidate.projectId).length >= MAX_PROJECT_SCENARIOS) {
    throw new Error("Maximum 8 scenarios per project.");
  }
  if (safe.length >= MAX_TOTAL_SCENARIOS) throw new Error("Maximum 30 scenarios per browser.");
  return [...safe, candidate];
}

export function exportProjectApiSuite(collection, id) {
  const linkedId = projectId(id);
  const scenarios = normalizeProjectApiScenarios(collection)
    .filter((item) => item.projectId === linkedId)
    .map(({ name, method, url, expectedStatus, maxDurationMs }) =>
      ({ name, method, url, expectedStatus, maxDurationMs }));
  return JSON.stringify({ schema: PROJECT_API_IMPORT_SCHEMA, scenarios }, null, 2);
}

export function importProjectApiSuite(raw, id, createId) {
  const linkedId = projectId(id);
  if (typeof raw !== "string" || raw.length > 40_000) throw new Error("Suite import exceeds 40 KB.");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("Suite import must be valid JSON."); }
  if (!data || data.schema !== PROJECT_API_IMPORT_SCHEMA || !Array.isArray(data.scenarios) ||
      data.scenarios.length > MAX_PROJECT_SCENARIOS) {
    throw new Error("Unsupported suite format or more than 8 scenarios.");
  }
  return data.scenarios.map((item) => normalizeProjectApiScenario({ ...item, projectId: linkedId, id: createId() }));
}

function safeResult(item) {
  const scenarioId = typeof item.scenarioId === "string" && SCENARIO_ID.test(item.scenarioId) ? item.scenarioId : "";
  const method = ["GET", "HEAD"].includes(item.method) ? item.method : "GET";
  const status = Number.isInteger(item.status) && item.status >= 100 && item.status <= 599 ? item.status : null;
  const elapsedMs = Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 ? Math.min(Math.round(item.elapsedMs), MAX_RUNTIME_MS + 1000) : 0;
  const passed = item.passed === true;
  const reason = ["passed", "status-mismatch", "slow-response", "network-or-cors-error", "timed-out", "cancelled"].includes(item.reason)
    ? item.reason : "network-or-cors-error";
  const origin = sanitizedApiLocation(item.origin, { originOnly: true });
  return { scenarioId, method, origin, status, elapsedMs, passed, reason };
}

export function summarizeProjectApiResults(results) {
  const completed = results.filter((item) => item.reason !== "cancelled");
  return { total: results.length, passed: completed.filter((item) => item.passed).length,
    failed: completed.filter((item) => !item.passed).length, cancelled: results.length - completed.length };
}

export function exportProjectApiReport(results) {
  if (!Array.isArray(results) || results.length > MAX_PROJECT_SCENARIOS) throw new Error("Report must contain at most 8 results.");
  const cases = results.map(safeResult);
  return JSON.stringify({ schema: PROJECT_API_REPORT_SCHEMA, generatedAt: new Date().toISOString(),
    summary: summarizeProjectApiResults(cases), cases }, null, 2);
}

export async function runProjectApiSuite(scenarios, options = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > MAX_PROJECT_SCENARIOS) {
    throw new Error("Select 1–8 saved scenarios.");
  }
  const normalized = scenarios.map(normalizeProjectApiScenario);
  const fetcher = options.fetcher || fetch;
  const notify = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const now = typeof options.now === "function" ? options.now : () => performance.now();
  const signal = options.signal;
  const results = [];
  for (const scenario of normalized) {
    if (signal?.aborted) break;
    const timer = new AbortController();
    const abort = () => timer.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => timer.abort(), scenario.maxDurationMs);
    const started = now();
    let row;
    try {
      const response = await fetcher(scenario.url, {
        method: scenario.method,
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: timer.signal,
      });
      const elapsedMs = Math.max(0, Math.round(now() - started));
      const passed = response.status === scenario.expectedStatus && elapsedMs <= scenario.maxDurationMs;
      row = { scenarioId: scenario.id, method: scenario.method, origin: new URL(scenario.url).origin,
        status: response.status, elapsedMs, passed,
        reason: response.status !== scenario.expectedStatus ? "status-mismatch" : elapsedMs > scenario.maxDurationMs ? "slow-response" : "passed" };
    } catch {
      row = { scenarioId: scenario.id, method: scenario.method, origin: new URL(scenario.url).origin,
        status: null, elapsedMs: Math.max(0, Math.round(now() - started)), passed: false,
        reason: signal?.aborted ? "cancelled" : timer.signal.aborted ? "timed-out" : "network-or-cors-error" };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
    const safe = safeResult(row);
    results.push(safe);
    notify(safe, [...results]);
    if (signal?.aborted) break;
  }
  return results;
}
