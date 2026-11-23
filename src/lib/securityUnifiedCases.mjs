import { CASE_MARKER, MAX_CASE_BYTES, parseCaseSnapshot } from "./securityCaseSnapshot.mjs";
import { INVESTIGATION_MARKER, INVESTIGATION_MAX_BYTES, parseInvestigation, investigationTriage } from "./securityInvestigationUtils.mjs";
import { summarizeCaseTriage } from "./securityCaseIntelligence.mjs";

export const UNIFIED_REVIEW_BATCH = 6;
export const UNIFIED_MAX_REVIEWED = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = Object.freeze({
  [CASE_MARKER]: { kind: "assessment", maxBytes: MAX_CASE_BYTES },
  [INVESTIGATION_MARKER]: { kind: "investigation", maxBytes: INVESTIGATION_MAX_BYTES },
});

export function inspectUnifiedEvidence(record, engagement, ownerId) {
  if (!record || !engagement || !UUID.test(ownerId || "")
      || engagement.owner_id !== ownerId || record.owner_id !== ownerId
      || record.engagement_id !== engagement.id) {
    throw new Error("Private record does not belong to this account and engagement.");
  }
  const spec = TYPES[record.description];
  if (!spec || record.mime_type !== "application/json") return null;
  if (!UUID.test(record.id || "") || !Number.isFinite(Date.parse(record.created_at || ""))
      || typeof record.file_size !== "number" || record.file_size < 1
      || record.file_size > spec.maxBytes || typeof record.storage_path !== "string"
      || !record.storage_path.startsWith(ownerId + "/" + engagement.id + "/")) {
    throw new Error("Private snapshot metadata has an invalid size, owner path or timestamp.");
  }
  return { id: record.id, kind: spec.kind, maxBytes: spec.maxBytes,
    path: record.storage_path, ownerId, engagementId: engagement.id,
    metadataAt: record.created_at };
}

export function validateUnifiedCaseDownload(raw, record, engagement, ownerId) {
  const meta = inspectUnifiedEvidence(record, engagement, ownerId);
  if (!meta) throw new Error("Unsupported private case type.");
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > meta.maxBytes) {
    throw new Error("Private case content exceeds its allowed boundary.");
  }
  const snapshot = meta.kind === "assessment"
    ? parseCaseSnapshot(raw, engagement, ownerId)
    : parseInvestigation(raw, engagement, ownerId);
  return { ...meta, snapshot, target: meta.kind === "assessment" ? snapshot.asset.target : snapshot.target,
    title: meta.kind === "assessment" ? snapshot.assessmentName : snapshot.title,
    capturedAt: snapshot.capturedAt,
    analystStatus: meta.kind === "assessment" ? "assessment recorded" : snapshot.status };
}

const time = (v) => Date.parse(v) || 0;
/**
 * Group only by exact target within an engagement. Matching targets do not
 * establish a formal case relationship or prove that an incident exists.
 * Only the latest VALIDATED version of each type contributes to triage.
 */
export function groupValidatedCases(records, now = new Date().toISOString()) {
  if (!Array.isArray(records) || records.length > UNIFIED_MAX_REVIEWED)
    throw new Error("Review is limited to 200 validated private versions.");
  const map = new Map();
  for (const item of records) {
    if (!item || !UUID.test(item.id || "") || !["assessment", "investigation"].includes(item.kind)
        || !item.snapshot || !item.engagementId || !item.target
        || !Number.isFinite(Date.parse(item.capturedAt || ""))) {
      throw new Error("Only validated private case snapshots can be grouped.");
    }
    const key = item.engagementId + "\0" + item.target;
    if (!map.has(key)) map.set(key, {
      key, engagementId: item.engagementId, target: item.target,
      versions: [], assessment: null, investigation: null,
    });
    const group = map.get(key);
    group.versions.push(item);
    const previous = group[item.kind];
    if (!previous || time(item.capturedAt) > time(previous.capturedAt) ||
        (time(item.capturedAt) === time(previous.capturedAt) && item.id > previous.id)) {
      group[item.kind] = item;
    }
  }
  return [...map.values()].map((g) => {
    g.versions.sort((a,b) => time(b.capturedAt)-time(a.capturedAt) || b.id.localeCompare(a.id));
    const findings = g.assessment ? summarizeCaseTriage(g.assessment.snapshot.findings, now) : null;
    const tasks = g.investigation ? investigationTriage(g.investigation.snapshot, now) : null;
    return { ...g, versionsReviewed: g.versions.length, latestAt: g.versions[0].capturedAt,
      sharedTargetOnly: Boolean(g.assessment && g.investigation),
      unresolvedFindings: findings?.active ?? 0, overdueFindings: findings?.overdue ?? 0,
      pendingActions: tasks?.pending ?? 0, overdueActions: tasks?.overdue ?? 0 };
  }).sort((a,b) => time(b.latestAt)-time(a.latestAt) || a.target.localeCompare(b.target));
}

export function summarizeUnifiedCases(groups, candidateCount, validatedCount) {
  const total = (field) => groups.reduce((sum, g) => sum + g[field], 0);
  return { reviewedTargets: groups.length, validatedVersions: validatedCount,
    unreviewedCandidates: Math.max(0,candidateCount-validatedCount),
    unresolvedFindings: total("unresolvedFindings"), overdueFindings: total("overdueFindings"),
    pendingActions: total("pendingActions"), overdueActions: total("overdueActions"),
    sharedTargetPairs: groups.filter(g=>g.sharedTargetOnly).length };
}

// Export is intentionally a metadata-only rollup; no raw observations, notes,
// evidence contents or private storage object paths are included.
export function unifiedCaseReport(groups, summary, engagementName) {
  const escape = (value) => String(value ?? "").replace(/[\r\n\x00-\x1f]/g, " ")
    .replace(/([\\*_{}\[\]()#+.!>|~])/g, "\\$1").slice(0,180);
  const lines = [
    "# ETERNYX Private Case Dossier", "",
    "Engagement: " + escape(engagementName),
    "Reviewed targets: " + summary.reviewedTargets,
    "Validated case versions: " + summary.validatedVersions,
    "Unreviewed or rejected candidate versions: " + summary.unreviewedCandidates,
    "Unresolved findings from newest reviewed assessments: " + summary.unresolvedFindings,
    "Overdue findings: " + summary.overdueFindings,
    "Pending investigation actions: " + summary.pendingActions,
    "Overdue investigation actions: " + summary.overdueActions, "",
    "Counts reflect only case versions explicitly validated during this session.",
    "Matching target names do not establish a formal case link or incident causality.", "",
  ];
  for (const g of groups) lines.push(
    "## " + escape(g.target),
    "- Reviewed versions: " + g.versionsReviewed,
    "- Newest reviewed assessment: " + (g.assessment?.capturedAt || "Not reviewed"),
    "- Newest reviewed investigation: " + (g.investigation?.capturedAt || "Not reviewed"),
    "- Analyst unresolved findings: " + g.unresolvedFindings,
    "- Analyst pending actions: " + g.pendingActions,
    "- Same-target pairing: " + (g.sharedTargetOnly ? "Both categories present" : "One category present"), "");
  lines.push("No automated scanning, SOC detection, independently verified remediation or testing authorization took place.");
  return lines.join("\n");
}
