/**
 * Automation Phase 2I: immutable server catalog and privacy-keyed preview
 * receipts. Never trust executable workflow steps provided by the browser.
 */
import { normalizeWorkflowSteps, runLocalWorkflow } from "../../../src/lib/automationWorkflow.mjs";
const allowedCategories = new Set(["operations","developer","security","engineering"]);
export function createTemplateCards(rows) {
  if (!Array.isArray(rows) || rows.length > 16) throw Error("invalid_catalog");
  const ids = new Set();
  return rows.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.id !== "string" || !/^[a-z][a-z0-9-]{2,40}$/.test(row.id) ||
        ids.has(row.id) || row.version !== 1 ||
        typeof row.name !== "string" || row.name.length > 80 ||
        typeof row.description !== "string" || row.description.length > 240 ||
        !allowedCategories.has(row.category) ||
        typeof row.sample_input !== "string" ||
        new TextEncoder().encode(row.sample_input).byteLength > 2000) {
      throw Error("invalid_catalog");
    }
    ids.add(row.id);
    const steps = normalizeWorkflowSteps(row.steps);
    if (!steps.length) throw Error("invalid_catalog");
    const actual = runLocalWorkflow(row.sample_input, steps);
    return {
      id:row.id, version:1, name:row.name, category:row.category,
      description:row.description, stepCount:steps.length,
      sampleInput:row.sample_input, sampleOutput:actual.output,
      operations:steps.map(step=>step.kind),
      source:"server_curated_catalog",
    };
  });
}
export async function fingerprintPreview(masterHex,userId,workflowId,revision,input) {
  if(typeof masterHex!=="string"||!/^[0-9a-f]{64}$/i.test(masterHex)||
     typeof userId!=="string"||typeof workflowId!=="string"||
     !Number.isInteger(revision)||revision<1||typeof input!=="string") {
    throw Error("preview_key_unconfigured");
  }
  const bytes = new Uint8Array(masterHex.match(/../g).map(pair=>parseInt(pair,16)));
  const key = await crypto.subtle.importKey("raw",bytes,
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const encoded = new TextEncoder().encode(JSON.stringify([
    "eternyx:workflow-preview:v1",userId,workflowId,revision,input,
  ]));
  const result = await crypto.subtle.sign("HMAC",key,encoded);
  return [...new Uint8Array(result)].map(v=>v.toString(16).padStart(2,"0")).join("");
}
