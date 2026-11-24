import { normalizeProjectApiScenario, isProjectApiRunComplete, projectApiSuiteSignature, MAX_PROJECT_SCENARIOS } from "./projectApiSuite.mjs";
import { normalizeApiEnvironment } from "./projectApiEnvironment.mjs";

export const API_BASELINE_KEY = "eternyx:project-api-regression-baselines:v1";
export const API_BASELINE_SCHEMA = "eternyx-project-api-regression-baseline-v1";
const ID = /^[a-z0-9-]{1,64}$/i;
const DIGEST = /^[a-f0-9]{64}$/;
const REASONS = ["passed","status-mismatch","slow-response","network-or-cors-error","timed-out","content-type-mismatch","content-type-unavailable","json-contract-failed"];
const CONTENT = ["passed","mismatch","unavailable"];
const JSON_CHECK = ["passed","missing","type-mismatch","invalid-json","body-too-large","not-run"];
const MAX_BASELINES = 20;

export async function fingerprintApiSuite(scenarios, cryptoProvider = globalThis.crypto) {
  if (!Array.isArray(scenarios) || !scenarios.length || scenarios.length > MAX_PROJECT_SCENARIOS) throw new Error("Select a saved suite.");
  const normalized = scenarios.map(normalizeProjectApiScenario);
  if (normalized.some(s=>!s.id || s.projectId !== normalized[0].projectId) ||
      new Set(normalized.map(s=>s.id)).size !== normalized.length) throw new Error("Invalid suite identity.");
  if (!cryptoProvider?.subtle) throw new Error("Secure browser context required for baseline fingerprints.");
  const digest = await cryptoProvider.subtle.digest("SHA-256",new TextEncoder().encode(projectApiSuiteSignature(normalized)));
  return Array.from(new Uint8Array(digest), b=>b.toString(16).padStart(2,"0")).join("");
}
function validTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function cleanRow(row) {
  if (!row || typeof row !== "object" || !ID.test(row.scenarioId || "") ||
      !Number.isInteger(row.elapsedMs) || row.elapsedMs < 0 || row.elapsedMs > 21000 ||
      !REASONS.includes(row.reason) || typeof row.passed !== "boolean" ||
      !(row.status === null || Number.isInteger(row.status) && row.status >= 100 && row.status <= 599) ||
      (row.contentTypeCheck !== undefined && !CONTENT.includes(row.contentTypeCheck)) ||
      (row.jsonCheck !== undefined && !JSON_CHECK.includes(row.jsonCheck))) throw new Error("Invalid baseline result.");
  if (row.passed !== (row.reason === "passed") || row.passed &&
      (row.status === null || row.contentTypeCheck && row.contentTypeCheck !== "passed" || row.jsonCheck && row.jsonCheck !== "passed")) {
    throw new Error("Inconsistent baseline result.");
  }
  return {scenarioId:row.scenarioId,status:row.status,elapsedMs:row.elapsedMs,passed:row.passed,reason:row.reason,
    ...(row.contentTypeCheck ? {contentTypeCheck:row.contentTypeCheck} : {}),
    ...(row.jsonCheck ? {jsonCheck:row.jsonCheck} : {})};
}
export function normalizeApiBaseline(value) {
  if (!value || value.schema !== API_BASELINE_SCHEMA || !ID.test(value.projectId || "") ||
      !DIGEST.test(value.fingerprint || "") || !validTime(value.savedAt) ||
      !Array.isArray(value.cases) || !value.cases.length || value.cases.length > MAX_PROJECT_SCENARIOS) throw new Error("Invalid API baseline.");
  const cases = value.cases.map(cleanRow);
  if (new Set(cases.map(r=>r.scenarioId)).size !== cases.length) throw new Error("Duplicate baseline results.");
  const environment = normalizeApiEnvironment(value.environment);
  return {schema:API_BASELINE_SCHEMA,projectId:value.projectId,environment,fingerprint:value.fingerprint,savedAt:value.savedAt,cases};
}
export function readApiBaselines(raw) {
  if (typeof raw !== "string" || raw.length > 150000) return [];
  try {
    const data=JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen=new Set(), result=[];
    for (const entry of data.slice(0,MAX_BASELINES)) {
      try {
        const item=normalizeApiBaseline(entry);
        const key = item.projectId + ":" + item.environment;
        if (!seen.has(key)) { seen.add(key); result.push(item); }
      } catch { /* malformed local records are not trusted */ }
    }
    return result;
  } catch { return []; }
}
export function storeApiBaseline(existing, baseline) {
  const item=normalizeApiBaseline(baseline);
  return [item,...existing.filter(v=>v.projectId!==item.projectId || normalizeApiEnvironment(v.environment)!==item.environment)].slice(0,MAX_BASELINES);
}
export function createApiBaseline(scenarios, results, fingerprint, savedAt = new Date().toISOString(), environment = "saved") {
  const normalized=scenarios.map(normalizeProjectApiScenario);
  if (!isProjectApiRunComplete(normalized,results) || !normalized.length ||
      normalized.some(s=>s.projectId!==normalized[0].projectId)) throw new Error("Only a completed current suite can become a baseline.");
  const cases=results.map(cleanRow);
  if (cases.some((row,i)=>row.passed && (row.status!==normalized[i].expectedStatus ||
      row.elapsedMs>normalized[i].maxDurationMs ||
      normalized[i].expectedContentType && row.contentTypeCheck!=="passed" ||
      normalized[i].jsonContract && row.jsonCheck!=="passed"))) throw new Error("Result does not satisfy its contract.");
  return normalizeApiBaseline({schema:API_BASELINE_SCHEMA,projectId:normalized[0].projectId,environment,fingerprint,savedAt,cases});
}
export function compareApiBaselines(previous,current) {
  const a=normalizeApiBaseline(previous), b=normalizeApiBaseline(current);
  if (a.projectId!==b.projectId || a.environment!==b.environment || a.fingerprint!==b.fingerprint ||
      a.cases.length!==b.cases.length || a.cases.some((row,i)=>row.scenarioId!==b.cases[i].scenarioId)) {
    return {state:"incompatible",cases:[]};
  }
  const cases=b.cases.map((row,i)=>{
    const prior=a.cases[i];
    const outcome=prior.passed && !row.passed ? "regressed" : !prior.passed && row.passed ? "recovered" :
      row.reason!==prior.reason || row.status!==prior.status ||
      row.contentTypeCheck!==prior.contentTypeCheck || row.jsonCheck!==prior.jsonCheck ? "changed" : "unchanged";
    const deltaMs=row.elapsedMs-prior.elapsedMs;
    // Single-run latency differences are observations, not statistical proof.
    const latencyIncrease=prior.passed && row.passed && deltaMs>=100 && row.elapsedMs>=prior.elapsedMs*1.5;
    return {scenarioId:row.scenarioId,outcome,deltaMs,latencyIncrease};
  });
  return {state:"comparable",cases,regressed:cases.filter(c=>c.outcome==="regressed").length,
    recovered:cases.filter(c=>c.outcome==="recovered").length,changed:cases.filter(c=>c.outcome==="changed").length,
    latencyIncreases:cases.filter(c=>c.latencyIncrease).length};
}
export function exportApiRegression(previous,current) {
  const compared=compareApiBaselines(previous,current);
  if(compared.state!=="comparable")throw new Error("Suite contracts changed; comparison unavailable.");
  return JSON.stringify({schema:"eternyx-api-regression-report-v1",baselineAt:previous.savedAt,currentAt:current.savedAt,
    scope:"local-browser-observations",environment:normalizeApiEnvironment(current.environment),productionVerified:false,summary:{regressed:compared.regressed,recovered:compared.recovered,changed:compared.changed,latencyIncreases:compared.latencyIncreases},
    cases:compared.cases},null,2);
}
