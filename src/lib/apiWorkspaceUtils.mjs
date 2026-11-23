import { validateApiRequest } from "./apiWorkbenchUtils.mjs";

export const API_COLLECTION_SCHEMA = "eternyx-api-collections-v1";
export const API_COLLECTION_STORAGE = "eternyx:api-collections:v1";
export const API_HISTORY_STORAGE = "eternyx:api-history:v1";
export const MAX_API_TEMPLATES = 30;
export const MAX_API_HISTORY = 25;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const TEMPLATE_BASE = /^\{\{([A-Za-z][A-Za-z0-9_]{0,31})\}\}(?:\/[^?#\s]*)?$/;

function boundedText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function sanitizedApiLocation(raw, { originOnly = false } = {}) {
  const input = boundedText(raw, 4096);
  if (!input) throw new Error("Enter a request URL before saving.");
  if (TEMPLATE_BASE.test(input)) return originOnly ? "{{environment}}" : input;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("A saved request needs an HTTP(S) URL or a {{baseUrl}} placeholder.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Saved URLs must use HTTP(S) without embedded credentials.");
  }
  // Query strings, fragments, and userinfo are never persisted; query tokens are common secrets.
  return originOnly ? url.origin : url.origin + url.pathname;
}

export function sanitizeApiTemplate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid API template.");
  const name = boundedText(input.name, 80);
  if (!name) throw new Error("Give the request a name (up to 80 characters).");
  const method = boundedText(input.method || "GET", 12).toUpperCase();
  if (!METHODS.has(method)) throw new Error("Unsupported HTTP method.");
  const url = sanitizedApiLocation(input.url);
  const id = boundedText(input.id, 64);
  if (id && !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid template identifier.");
  return { id, name, method, url };
}

export function normalizeApiTemplates(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  const ids = new Set();
  for (const raw of value.slice(0, MAX_API_TEMPLATES)) {
    try {
      const item = sanitizeApiTemplate(raw);
      if (!item.id || ids.has(item.id)) continue;
      output.push(item);
      ids.add(item.id);
    } catch {
      // Treat imported browser storage as untrusted; omit invalid rows.
    }
  }
  return output;
}

export function exportApiCollections(value) {
  const requests = normalizeApiTemplates(value).map(({ name, method, url }) => ({ name, method, url }));
  return JSON.stringify({ schema: API_COLLECTION_SCHEMA, requests }, null, 2);
}

export function importApiCollections(text) {
  if (typeof text !== "string" || text.length > 100_000) throw new Error("Collection import is too large.");
  let document;
  try { document = JSON.parse(text); }
  catch { throw new Error("Import must be valid JSON."); }
  if (!document || document.schema !== API_COLLECTION_SCHEMA || !Array.isArray(document.requests)) {
    throw new Error("Not an ETERNYX sanitized API collection export.");
  }
  if (document.requests.length > MAX_API_TEMPLATES) throw new Error("Import exceeds the 30-request limit.");
  return document.requests.map((item) => sanitizeApiTemplate(item));
}

export function parseApiEnvironment(text) {
  if (typeof text !== "string" || text.length > 8192) throw new Error("Environment input is too long.");
  const variables = Object.create(null);
  const rows = text.split(/\r?\n/);
  if (rows.length > 30) throw new Error("Use no more than 30 environment lines.");
  let count = 0;
  for (const [i, row] of rows.entries()) {
    if (!row.trim() || row.trim().startsWith("#")) continue;
    const divider = row.indexOf("=");
    if (divider < 1) throw new Error("Environment line " + (i + 1) + " must be NAME=value.");
    const name = row.slice(0, divider).trim();
    const value = row.slice(divider + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)) {
      throw new Error("Environment line " + (i + 1) + " has an invalid name.");
    }
    if (Object.hasOwn(variables, name)) throw new Error("Duplicate environment variable: " + name);
    if (value.length > 2048) throw new Error("Environment value is too long.");
    variables[name] = value;
    if (++count > 24) throw new Error("Use at most 24 variables.");
  }
  return variables;
}

export function expandApiVariables(value, vars) {
  if (typeof value !== "string" || value.length > 1_000_000) throw new Error("Request text is too long.");
  let count = 0;
  const expanded = value.replace(/\{\{([A-Za-z][A-Za-z0-9_]{0,31})\}\}/g, (_match, name) => {
    if (++count > 100) throw new Error("Too many template variables.");
    if (!Object.hasOwn(vars, name)) throw new Error("Missing environment value: " + name);
    return vars[name];
  });
  if (expanded.includes("{{") || expanded.includes("}}")) {
    throw new Error("Unresolved or nested request variable.");
  }
  if (expanded.length > 1_000_000) throw new Error("Expanded request is too large.");
  return expanded;
}

export function resolveApiDraft(draft, envText = "") {
  const vars = parseApiEnvironment(envText);
  return validateApiRequest({
    url: expandApiVariables(draft.url, vars),
    method: draft.method,
    headers: expandApiVariables(draft.headers || "", vars),
    body: expandApiVariables(draft.body || "", vars),
  });
}

export function safeApiHistoryRow({ url, method, status, durationMs, at }) {
  const normalizedMethod = boundedText(method, 12).toUpperCase();
  if (!METHODS.has(normalizedMethod)) throw new Error("Invalid history method.");
  const numericStatus = Number(status);
  const duration = Number(durationMs);
  if (!Number.isInteger(numericStatus) || numericStatus < 100 || numericStatus > 599) throw new Error("Invalid history status.");
  if (!Number.isFinite(duration) || duration < 0 || duration > 120_000) throw new Error("Invalid history duration.");
  const timestamp = typeof at === "string" && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  // Store origin, not path/query/headers/body. A URL path can itself contain credentials.
  return { method: normalizedMethod, origin: sanitizedApiLocation(url, { originOnly: true }), status: numericStatus,
    durationMs: Math.round(duration), at: timestamp };
}

export function normalizeApiHistory(value) {
  if (!Array.isArray(value)) return [];
  const output = [];
  for (const item of value.slice(0, MAX_API_HISTORY)) {
    try {
      output.push(safeApiHistoryRow({ ...item, url: item.origin }));
    } catch {
      // Ignore tampered or obsolete local history records.
    }
  }
  return output;
}

export function recordApiHistory(value, request) {
  const row = safeApiHistoryRow(request);
  return [row, ...normalizeApiHistory(value)].slice(0, MAX_API_HISTORY);
}

export function runApiAssertions(result, settings = {}) {
  if (!result) return [];
  const checks = [];
  const statusValue = String(settings.status ?? "").trim();
  if (statusValue) {
    const expected = Number(statusValue);
    const valid = Number.isInteger(expected) && expected >= 100 && expected <= 599;
    checks.push({ name: "HTTP status", passed: valid && result.status === expected,
      detail: valid ? "Expected " + expected + "; received " + result.status : "Expected status must be 100–599." });
  }
  const durationValue = String(settings.maxDurationMs ?? "").trim();
  if (durationValue) {
    const expected = Number(durationValue);
    const valid = Number.isInteger(expected) && expected >= 1 && expected <= 120_000;
    checks.push({ name: "Latency", passed: valid && result.durationMs <= expected,
      detail: valid ? "Limit " + expected + " ms; actual " + result.durationMs + " ms" : "Latency limit must be 1–120000 ms." });
  }
  const path = String(settings.jsonPath ?? "").trim();
  if (path) {
    let actual = undefined;
    let note = "";
    if (result.truncated) note = "Cannot assert JSON: displayed response was truncated.";
    else if (path.length > 160 || !/^(?:[A-Za-z_$][A-Za-z0-9_$]*|\d+)(?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|\d+))*$/.test(path) ||
      path.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part))) {
      note = "Invalid dotted JSON path.";
    } else {
      try {
        let node = JSON.parse(result.body);
        for (const part of path.split(".")) {
          if (node === null || typeof node !== "object" || !Object.hasOwn(node, part)) {
            node = undefined;
            break;
          }
          node = node[part];
        }
        actual = node;
      } catch { note = "Response is not valid JSON."; }
    }
    const expected = String(settings.equals ?? "");
    const actualText = actual === undefined ? "(missing)" : typeof actual === "string" ? actual : JSON.stringify(actual);
    checks.push({ name: "JSON path " + path.slice(0, 160), passed: !note && actual !== undefined && actualText === expected,
      detail: note || "Expected " + expected.slice(0, 100) + "; received " + String(actualText).slice(0, 100) });
  }
  return checks;
}
