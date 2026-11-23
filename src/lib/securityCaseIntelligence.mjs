import { validateAssessmentFinding } from "./securityAssessmentUtils.mjs";

const ACTIVE = new Set(["open", "in-progress", "blocked"]);
const POINTS = Object.freeze({ critical: 8, high: 5, medium: 3, low: 1 });
const FIELDS = ["title", "severity", "evidence", "recommendation", "owner", "status", "dueDate", "retestNote", "riskAcceptanceNote"];

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Analyst-entered triage only. Never a CVSS risk score or independent target assessment. */
export function summarizeCaseTriage(findings, asOf = new Date().toISOString()) {
  if (!Array.isArray(findings) || findings.length > 100) throw new Error("Invalid case findings.");
  const day = validDay(String(asOf).slice(0, 10));
  if (!day) throw new Error("Invalid review date.");
  const summary = { total: 0, active: 0, overdue: 0, blocked: 0, verified: 0, accepted: 0, unassigned: 0, invalidDueDate: 0, criticalActive: 0, highActive: 0, priorityPoints: 0 };
  for (const raw of findings) {
    const item = validateAssessmentFinding(raw);
    summary.total++;
    if (!item.owner) summary.unassigned++;
    if (item.status === "blocked") summary.blocked++;
    if (item.status === "verified") summary.verified++;
    if (item.status === "accepted") summary.accepted++;
    if (!ACTIVE.has(item.status)) continue;
    summary.active++;
    summary.priorityPoints += POINTS[item.severity];
    if (item.severity === "critical") summary.criticalActive++;
    if (item.severity === "high") summary.highActive++;
    if (item.dueDate) {
      const due = validDay(item.dueDate);
      if (!due) summary.invalidDueDate++;
      else if (due < day) summary.overdue++;
    }
  }
  return summary;
}

export function compareCaseSnapshots(from, to) {
  if (!from || !to || !from.ownerId || from.ownerId !== to.ownerId
      || !from.engagementId || from.engagementId !== to.engagementId
      || !from.asset?.target || from.asset.target !== to.asset?.target) {
    throw new Error("Only snapshots for the same owner, engagement and scoped asset can be compared.");
  }
  if (!Array.isArray(from.findings) || !Array.isArray(to.findings)
      || from.findings.length > 100 || to.findings.length > 100) {
    throw new Error("Malformed comparison: bounded findings are required.");
  }
  const old = new Map(from.findings.map((f) => [f.id, f]));
  const current = new Map(to.findings.map((f) => [f.id, f]));
  if (old.size !== from.findings.length || current.size !== to.findings.length) {
    throw new Error("Duplicate finding IDs make this comparison ambiguous.");
  }
  const changes = [];
  for (const [id, item] of current) {
    if (!old.has(id)) {
      changes.push({ id, kind: "added", title: item.title, fields: ["finding"], previousStatus: null, nextStatus: item.status });
      continue;
    }
    const before = old.get(id);
    const fields = FIELDS.filter((field) => before[field] !== item[field]);
    if (fields.length) changes.push({ id, kind: "updated", title: item.title, fields, previousStatus: before.status, nextStatus: item.status });
  }
  for (const [id, item] of old) {
    if (!current.has(id)) changes.push({ id, kind: "removed", title: item.title, fields: ["finding"], previousStatus: item.status, nextStatus: null });
  }
  const assetFields = ["criticality", "steward", "notes"].filter((key) => from.asset[key] !== to.asset[key]);
  return {
    engagementId: from.engagementId, target: from.asset.target,
    fromDate: from.capturedAt, toDate: to.capturedAt,
    changes, assetFields, titleChanged: from.assessmentName !== to.assessmentName,
    added: changes.filter((change) => change.kind === "added").length,
    removed: changes.filter((change) => change.kind === "removed").length,
    updated: changes.filter((change) => change.kind === "updated").length,
  };
}

export function exportCaseComparison(diff) {
  const report = [
    "# ETERNYX Security Case Version Review", "",
    "Target: " + diff.target,
    "From: " + diff.fromDate,
    "To: " + diff.toDate,
    "Added / removed / updated: " + diff.added + " / " + diff.removed + " / " + diff.updated,
    "Asset metadata changes: " + (diff.assetFields.join(", ") || "none"),
    "Assessment title changed: " + (diff.titleChanged ? "yes" : "no"), "",
    "Only changes in analyst-entered case versions are shown. A version transition is not independent proof of remediation.", "",
  ];
  for (const item of diff.changes) {
    report.push("## " + item.kind.toUpperCase() + ": " + item.title,
      "Fields: " + item.fields.join(", "),
      "Status: " + (item.previousStatus ?? "not recorded") + " → " + (item.nextStatus ?? "not recorded"), "");
  }
  if (!diff.changes.length && !diff.assetFields.length && !diff.titleChanged) report.push("No recorded changes found.");
  return report.join("\n");
}

export function exportCaseTriage(snapshot, summary, asOf) {
  return [
    "# ETERNYX Analyst Remediation Triage", "",
    "Assessment: " + snapshot.assessmentName,
    "Scoped asset: " + snapshot.asset.target,
    "Date (UTC): " + String(asOf).slice(0, 10),
    "Unresolved: " + summary.active,
    "Overdue: " + summary.overdue,
    "Blocked: " + summary.blocked,
    "Unassigned: " + summary.unassigned,
    "Critical unresolved: " + summary.criticalActive,
    "High unresolved: " + summary.highActive,
    "Priority points (not CVSS): " + summary.priorityPoints, "",
    "This report summarizes analyst-supplied observations only. No scan, live detection, independent validation, or risk certification was performed.",
  ].join("\n");
}
