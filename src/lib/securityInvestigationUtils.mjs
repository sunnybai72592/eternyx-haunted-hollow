import { engagementMaySaveCase, validateScopedAsset } from "./securityCaseSnapshot.mjs";

export const INVESTIGATION_SCHEMA = "eternyx.security-investigation.v1";
export const INVESTIGATION_MARKER = "ETERNYX private security investigation v1";
export const INVESTIGATION_MAX_BYTES = 256 * 1024;
export const INVESTIGATION_STATUSES = ["open", "investigating", "contained", "monitoring", "resolved", "closed"];
export const INVESTIGATION_PRIORITIES = ["low", "medium", "high", "critical"];
export const INVESTIGATION_EVENTS = ["observation", "action", "decision", "handoff", "retest"];
const ACTION_STATUSES = ["open", "in-progress", "done", "cancelled"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 100, MAX_ACTIONS = 50, MAX_EVIDENCE = 20;

function textField(value, label, max, required = false) {
  if (typeof value !== "string") throw new Error(label + " must be text.");
  const clean = value.trim();
  if (clean.length > max || (required && !clean)) throw new Error(label + " must be nonempty and at most " + max + " characters.");
  return clean;
}
function uuidField(value, label) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(label + " must be a UUID.");
  return value;
}
function dateField(value, label) {
  const timestamp = textField(value, label, 40, true);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(timestamp)) throw new Error(label + " must be an ISO timestamp.");
  return new Date(parsed).toISOString();
}
function dueField(value) {
  const date = textField(value ?? "", "Action due date", 10);
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date + "T00:00:00.000Z").toISOString().slice(0, 10) !== date) {
    throw new Error("Action due date must be a real YYYY-MM-DD date.");
  }
  return date;
}
function unique(list, key, label) {
  const seen = new Set();
  for (const entry of list) {
    if (seen.has(entry[key])) throw new Error(label + " identifiers must be unique.");
    seen.add(entry[key]);
  }
}
export function validateInvestigation(input, engagement, currentOwnerId, knownEvidenceIds = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Investigation is not an object.");
  if (input.schema !== INVESTIGATION_SCHEMA) throw new Error("Unsupported investigation schema.");
  const ownerId = uuidField(currentOwnerId, "Account");
  const engagementId = uuidField(engagement?.id, "Engagement");
  if (engagement?.owner_id !== ownerId || input.ownerId !== ownerId || input.engagementId !== engagementId)
    throw new Error("Investigation ownership or engagement does not match this signed-in account.");
  if (!engagementMaySaveCase(engagement)) throw new Error("An attested scoped engagement is required.");
  const target = validateScopedAsset(engagement, input.target);
  const title = textField(input.title, "Investigation title", 180, true);
  const summary = textField(input.summary ?? "", "Investigation summary", 4000);
  const investigator = textField(input.investigator ?? "", "Lead investigator", 120);
  const closureNote = textField(input.closureNote ?? "", "Closure note", 4000);
  if (!INVESTIGATION_PRIORITIES.includes(input.priority)) throw new Error("Unknown investigation priority.");
  if (!INVESTIGATION_STATUSES.includes(input.status)) throw new Error("Unknown investigation status.");
  const createdAt = dateField(input.createdAt, "Created at");
  const capturedAt = dateField(input.capturedAt, "Captured at");
  if (!Array.isArray(input.timeline) || input.timeline.length > MAX_EVENTS) throw new Error("Investigation supports up to 100 timeline events.");
  if (!Array.isArray(input.actions) || input.actions.length > MAX_ACTIONS) throw new Error("Investigation supports up to 50 actions.");
  if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length > MAX_EVIDENCE) throw new Error("Investigation supports up to 20 evidence links.");
  const timeline = input.timeline.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Malformed timeline event.");
    const id = uuidField(item.id, "Timeline event ID");
    if (!INVESTIGATION_EVENTS.includes(item.type)) throw new Error("Unknown timeline event type.");
    return { id, type: item.type, occurredAt: dateField(item.occurredAt, "Timeline date"),
      description: textField(item.description, "Timeline description", 2000, true),
      actor: textField(item.actor ?? "", "Timeline actor", 120) };
  });
  unique(timeline, "id", "Timeline");
  const actions = input.actions.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Malformed investigation action.");
    const id = uuidField(item.id, "Action ID");
    if (!ACTION_STATUSES.includes(item.status)) throw new Error("Unknown action status.");
    return { id, title: textField(item.title, "Action title", 180, true),
      owner: textField(item.owner ?? "", "Action owner", 120),
      dueDate: dueField(item.dueDate), status: item.status };
  });
  unique(actions, "id", "Action");
  const evidenceIds = input.evidenceIds.map((id) => uuidField(id, "Evidence reference"));
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error("Evidence references must be unique.");
  if (knownEvidenceIds !== null) {
    const owned = new Set(knownEvidenceIds);
    for (const id of evidenceIds) {
      if (!owned.has(id)) throw new Error("Evidence reference was not confirmed in this owned engagement.");
    }
  }
  if (["resolved", "closed"].includes(input.status)) {
    if (closureNote.length < 20 || evidenceIds.length === 0 ||
        !timeline.some((item) => ["decision", "retest"].includes(item.type))) {
      throw new Error("Resolution requires a substantive closure note, private evidence and a recorded decision or retest.");
    }
  }
  if (input.status === "closed" && actions.some((item) => !["done", "cancelled"].includes(item.status))) {
    throw new Error("Close all outstanding actions before closing this investigation.");
  }
  const result = {
    schema: INVESTIGATION_SCHEMA, ownerId, engagementId, target, title, summary,
    investigator, priority: input.priority, status: input.status, closureNote,
    createdAt, capturedAt, timeline, actions, evidenceIds,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > INVESTIGATION_MAX_BYTES) {
    throw new Error("Investigation snapshot exceeds 256 KiB.");
  }
  return result;
}
export function createInvestigation(data, engagement, ownerId, knownEvidenceIds) {
  const now = new Date().toISOString();
  return validateInvestigation({
    ...data, schema: INVESTIGATION_SCHEMA, ownerId, engagementId: engagement.id,
    createdAt: data.createdAt || now, capturedAt: now,
  }, engagement, ownerId, knownEvidenceIds);
}
export function parseInvestigation(raw, engagement, ownerId, knownEvidenceIds = null) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > INVESTIGATION_MAX_BYTES)
    throw new Error("Investigation JSON is invalid or oversized.");
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Investigation JSON cannot be parsed."); }
  return validateInvestigation(parsed, engagement, ownerId, knownEvidenceIds);
}
export function investigationTriage(data, now = new Date().toISOString()) {
  const today = now.slice(0, 10);
  return {
    timelineEvents: data.timeline.length, linkedEvidence: data.evidenceIds.length,
    pending: data.actions.filter((a) => a.status === "open" || a.status === "in-progress").length,
    overdue: data.actions.filter((a) => ["open","in-progress"].includes(a.status) && a.dueDate && a.dueDate < today).length,
    complete: data.actions.filter((a) => a.status === "done").length,
  };
}
const escapeMarkdown = (value) => String(value).replace(/([\\*_{}\[\]()#+.!>|~-])/g, "\\$1").replace(/\n/g, " ");
export function investigationReport(data) {
  const triage = investigationTriage(data);
  const lines = [
    "# ETERNYX — Private Security Investigation Report", "",
    "**Investigation:** " + escapeMarkdown(data.title),
    "**Target in declared scope:** " + escapeMarkdown(data.target),
    "**Engagement ID:** " + data.engagementId,
    "**Status / priority:** " + data.status + " / " + data.priority,
    "**Investigator:** " + escapeMarkdown(data.investigator || "Unassigned"),
    "**Captured:** " + data.capturedAt,
    "**Actions:** " + triage.pending + " pending, " + triage.overdue + " overdue",
    "**Private evidence references:** " + triage.linkedEvidence, "",
    "## Summary", escapeMarkdown(data.summary || "Not supplied"), "",
    "## Timeline",
    ...data.timeline.map((e) => "- " + e.occurredAt + " · " + e.type + " · " +
      escapeMarkdown(e.actor || "Unassigned") + ": " + escapeMarkdown(e.description)),
    "", "## Actions",
    ...data.actions.map((a) => "- [" + (a.status === "done" ? "x" : " ") + "] " +
      escapeMarkdown(a.title) + " (" + a.status + ", owner " + escapeMarkdown(a.owner || "unassigned") +
      ", due " + (a.dueDate || "unspecified") + ")"),
    "", "## Private evidence metadata IDs", ...data.evidenceIds.map((id) => "- " + id),
    "", "## Resolution or closure narrative", escapeMarkdown(data.closureNote || "Not yet provided"), "",
    "All observations, authorization claims and closure decisions are analyst-recorded, not independently validated by ETERNYX.",
  ];
  return lines.join("\n");
}
