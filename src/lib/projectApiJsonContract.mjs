import { readBoundedApiBody } from "./apiWorkbenchTransport.mjs";

export const JSON_CONTRACT_MAX_BYTES = 65_536;
export const JSON_CONTRACT_TYPES = Object.freeze(["exists","string","number","boolean","object","array","null"]);
const forbidden = new Set(["__proto__","prototype","constructor"]);

export function normalizeJsonContract(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(k => !["path","type"].includes(k))) throw new Error("Invalid JSON field contract.");
  const path = value.path;
  if (typeof path !== "string" || path.length > 120 || !/^(?:[A-Za-z_$][A-Za-z0-9_$]*|0|[1-9]\d*)(?:\.(?:[A-Za-z_$][A-Za-z0-9_$]*|0|[1-9]\d*))*$/.test(path) ||
      path.split(".").length > 12 || path.split(".").some(p => forbidden.has(p))) throw new Error("Use a safe dotted JSON path (up to 12 segments).");
  if (!JSON_CONTRACT_TYPES.includes(value.type)) throw new Error("Unsupported JSON field type.");
  return {path,type:value.type};
}

export function evaluateJsonContract(document, input) {
  const contract = normalizeJsonContract(input);
  let node = document;
  for (const part of contract.path.split(".")) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node,part) ||
        (Array.isArray(node) && !/^(?:0|[1-9]\d*)$/.test(part))) return "missing";
    node = node[part];
  }
  const type = node === null ? "null" : Array.isArray(node) ? "array" : typeof node;
  return contract.type === "exists" || type === contract.type ? "passed" : "type-mismatch";
}

export async function inspectJsonContract(response, contract) {
  const normalized = normalizeJsonContract(contract);
  const received = await readBoundedApiBody(response, JSON_CONTRACT_MAX_BYTES);
  if (received.truncated) return "body-too-large";
  let parsed;
  try { parsed = JSON.parse(received.text); } catch { return "invalid-json"; }
  return evaluateJsonContract(parsed, normalized);
}
