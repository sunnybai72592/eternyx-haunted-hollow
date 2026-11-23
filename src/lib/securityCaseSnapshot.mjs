import { buildAssessmentReport, validateAssessmentFinding } from "./securityAssessmentUtils.mjs";

export const CASE_SCHEMA = "eternyx.security-case.v1";
export const CASE_MARKER = "ETERNYX security case snapshot v1";
export const MAX_CASE_BYTES = 256 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["authorized", "in_progress", "on_hold", "completed"]);
const CRITICALITIES = new Set(["low", "medium", "high", "critical"]);

function limitedText(value, label, max) {
  if (typeof value !== "string") throw new Error(label + " must be text.");
  const text = value.trim();
  if (text.length > max) throw new Error(label + " must be at most " + max + " characters.");
  return text;
}

export function engagementMaySaveCase(engagement) {
  return Boolean(engagement?.authorization_attested === true
    && engagement.authorization_attested_at
    && STATUSES.has(engagement.status)
    && Array.isArray(engagement.scope_targets)
    && engagement.scope_targets.length > 0);
}

export function validateScopedAsset(engagement, target) {
  if (!engagementMaySaveCase(engagement)) {
    throw new Error("An attested, active or completed scoped engagement is required before saving a private case.");
  }
  if (typeof target !== "string" || target.length > 500 || !target.trim()) {
    throw new Error("Select a valid in-scope target.");
  }
  if (!engagement.scope_targets.includes(target) || (engagement.excluded_targets || []).includes(target)) {
    throw new Error("This target is not in the currently attested engagement scope.");
  }
  return target;
}

export function validateCaseSnapshot(input, engagement, currentUserId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid security case.");
  if (input.schema !== CASE_SCHEMA) throw new Error("Unsupported security case version.");
  if (!UUID.test(currentUserId || "") || input.ownerId !== currentUserId
      || input.engagementId !== engagement?.id) throw new Error("Case ownership or engagement does not match this account.");
  if (typeof input.capturedAt !== "string" || !Number.isFinite(Date.parse(input.capturedAt))) {
    throw new Error("Case timestamp is invalid.");
  }
  const assessmentName = limitedText(input.assessmentName, "Assessment name", 160);
  if (!assessmentName) throw new Error("Assessment name is required.");
  if (!input.asset || typeof input.asset !== "object" || Array.isArray(input.asset)) throw new Error("Case asset is missing.");
  const target = validateScopedAsset(engagement, input.asset.target);
  const steward = limitedText(input.asset.steward ?? "", "Asset owner", 120);
  const notes = limitedText(input.asset.notes ?? "", "Asset notes", 2000);
  if (!CRITICALITIES.has(input.asset.criticality)) throw new Error("Asset criticality is invalid.");
  if (!Array.isArray(input.findings) || input.findings.length > 100) throw new Error("Cases support up to 100 findings.");
  const seen = new Set();
  const findings = input.findings.map((finding) => {
    if (!finding || typeof finding !== "object" || !UUID.test(finding.id || "") || seen.has(finding.id)) {
      throw new Error("Case finding identifiers must be unique UUIDs.");
    }
    seen.add(finding.id);
    const normalized = validateAssessmentFinding(finding);
    const retestNote = limitedText(finding.retestNote ?? "", "Retest evidence", 2000);
    const riskAcceptanceNote = limitedText(finding.riskAcceptanceNote ?? "", "Risk acceptance reference", 2000);
    if (normalized.status === "verified" && (retestNote.length < 12 || normalized.evidence.length < 10)) {
      throw new Error("Verified findings require original evidence and a documented retest note.");
    }
    if (normalized.status === "accepted" && riskAcceptanceNote.length < 12) {
      throw new Error("Accepted risks require a documented approval reference.");
    }
    return { id: finding.id, ...normalized, retestNote, riskAcceptanceNote };
  });
  const result = {
    schema: CASE_SCHEMA, ownerId: currentUserId, engagementId: engagement.id,
    capturedAt: input.capturedAt, assessmentName,
    asset: { target, steward, criticality: input.asset.criticality, notes },
    findings,
  };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_CASE_BYTES) {
    throw new Error("Security case exceeds the 256 KiB snapshot limit.");
  }
  return result;
}

export function createCaseSnapshot({ engagement, ownerId, assessmentName, asset, findings, capturedAt }) {
  return validateCaseSnapshot({
    schema: CASE_SCHEMA, engagementId: engagement.id, ownerId,
    assessmentName, asset, findings, capturedAt: capturedAt || new Date().toISOString(),
  }, engagement, ownerId);
}

export function parseCaseSnapshot(raw, engagement, ownerId) {
  if (typeof raw !== "string" || new TextEncoder().encode(raw).length > MAX_CASE_BYTES) {
    throw new Error("Invalid or oversized case snapshot.");
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Snapshot is not valid JSON."); }
  return validateCaseSnapshot(value, engagement, ownerId);
}

export function caseReport(snapshot) {
  const base = buildAssessmentReport({
    assessmentName: snapshot.assessmentName, target: snapshot.asset.target, findings: snapshot.findings,
  });
  return [
    base, "", "## Engagement and asset context",
    "- Engagement ID: " + snapshot.engagementId,
    "- Snapshot date: " + snapshot.capturedAt,
    "- Asset criticality (analyst assigned): " + snapshot.asset.criticality,
    "- Responsible asset owner: " + (snapshot.asset.steward || "Not specified"),
    "- Asset notes: " + (snapshot.asset.notes || "None"), "",
    "## Analyst-provided retest and acceptance records",
    ...snapshot.findings.flatMap((finding, index) => [
      "### " + (index + 1) + ". " + finding.title,
      "- Remediation status: " + finding.status,
      "- Retest evidence: " + (finding.retestNote || "Not provided"),
      "- Risk acceptance approval: " + (finding.riskAcceptanceNote || "Not provided"), "",
    ]),
    "These are user-recorded statements, not independent proof of authorization, remediation, or risk acceptance.",
  ].join("\n");
}
