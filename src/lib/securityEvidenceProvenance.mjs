import { inspectUnifiedEvidence, validateUnifiedCaseDownload } from "./securityUnifiedCases.mjs";
import { INVESTIGATION_MARKER } from "./securityInvestigationUtils.mjs";

export const MAX_PROVENANCE_BYTES = 20 * 1024 * 1024;
export const PROVENANCE_SCHEMA = "eternyx.private-evidence-provenance.v1";
export const MAX_VERIFIED_RECORDS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;
const MIME = new Set([
  "application/pdf", "application/json", "text/plain", "text/csv",
  "image/jpeg", "image/png", "image/webp",
]);

export function validatePrivateEvidenceMetadata(record, engagement, ownerId) {
  if (!UUID.test(ownerId || "") || !engagement ||
      engagement.owner_id !== ownerId || !UUID.test(engagement.id || "") ||
      !record || record.owner_id !== ownerId || record.engagement_id !== engagement.id) {
    throw new Error("Private evidence is not owned by this account and engagement.");
  }
  if (!UUID.test(record.id || "") || !MIME.has(record.mime_type) ||
      !Number.isSafeInteger(record.file_size) || record.file_size < 1 ||
      record.file_size > MAX_PROVENANCE_BYTES ||
      typeof record.storage_path !== "string" ||
      !record.storage_path.startsWith(ownerId + "/" + engagement.id + "/") ||
      !Number.isFinite(Date.parse(record.created_at || ""))) {
    throw new Error("Private evidence metadata violates the storage, size, type or timestamp boundary.");
  }
  const suffix = record.storage_path.slice((ownerId + "/" + engagement.id + "/").length);
  if (!suffix || suffix.length > 500 || suffix === "." || suffix === ".." ||
      suffix.includes("/") || suffix.includes("\\") || /[\x00-\x1f]/.test(suffix)) {
    throw new Error("Private evidence object key contains an unsafe path.");
  }
  return {
    id: record.id, ownerId, engagementId: engagement.id, objectPath: record.storage_path,
    size: record.file_size, mime: record.mime_type, registeredAt: record.created_at,
    isInvestigation: record.description === INVESTIGATION_MARKER,
  };
}

export function normalizeExpectedSha256(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const clean = String(value).trim().toLowerCase();
  if (!HEX.test(clean)) throw new Error("Expected SHA-256 must be exactly 64 hexadecimal characters.");
  return clean;
}

export async function calculateSha256(bytes, subtle = globalThis.crypto?.subtle) {
  if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw new Error("Hash input must be an ArrayBuffer or typed byte array.");
  }
  const length = bytes.byteLength;
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_PROVENANCE_BYTES) {
    throw new Error("Hash input is empty or exceeds the 20 MiB private evidence limit.");
  }
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("SHA-256 is unavailable in this browser security context.");
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}

export function comparisonStatus(actual, baseline = null, expected = null) {
  if (!HEX.test(actual || "")) throw new Error("Computed SHA-256 is invalid.");
  const previous = baseline ? normalizeExpectedSha256(baseline) : null;
  const provided = normalizeExpectedSha256(expected);
  return {
    baseline: previous === null ? "first-observation" : (previous === actual ? "match" : "mismatch"),
    expected: provided === null ? "not-provided" : (provided === actual ? "match" : "mismatch"),
    // Mismatch signals different bytes or a wrong expected value. It does not prove tampering.
    integrityClaim: "locally-observed-only",
  };
}

export async function hashOwnedEvidenceBytes(data, record, engagement, ownerId, options = {}) {
  const meta = validatePrivateEvidenceMetadata(record, engagement, ownerId);
  if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
    throw new Error("Private evidence download is not a byte buffer.");
  }
  if (data.byteLength !== meta.size) {
    throw new Error("Downloaded private evidence byte count differs from registered metadata.");
  }
  const sha256 = await calculateSha256(data, options.subtle);
  return {
    evidenceId: meta.id,
    ownerId: meta.ownerId,
    engagementId: meta.engagementId,
    size: meta.size,
    mime: meta.mime,
    registeredAt: meta.registeredAt,
    observedAt: options.observedAt || new Date().toISOString(),
    sha256,
    comparison: comparisonStatus(sha256, options.baseline, options.expected),
  };
}

/**
 * Verify investigation references with owner-scoped DB rows before reporting
 * any cross-case evidence relationship. A shared target alone is not a link.
 */
export function verifyInvestigationReferences(raw, snapshotRecord, engagement, ownerId, evidenceRows) {
  const marker = inspectUnifiedEvidence(snapshotRecord, engagement, ownerId);
  if (!marker || marker.kind !== "investigation") {
    throw new Error("A private investigation snapshot is required for reference verification.");
  }
  const parsed = validateUnifiedCaseDownload(raw, snapshotRecord, engagement, ownerId);
  if (parsed.kind !== "investigation") throw new Error("Unexpected case snapshot type.");
  if (!Array.isArray(evidenceRows)) throw new Error("Owned evidence metadata lookup did not complete.");
  const references = parsed.snapshot.evidenceIds;
  const rows = new Map();
  for (const row of evidenceRows) {
    const checked = validatePrivateEvidenceMetadata(row, engagement, ownerId);
    if (rows.has(checked.id)) throw new Error("Duplicate evidence metadata returned from server.");
    rows.set(checked.id, checked);
  }
  if (rows.size !== references.length || references.some((id) => !rows.has(id))) {
    throw new Error("One or more investigation evidence references are missing from this owned engagement.");
  }
  return {
    investigationId: parsed.id, engagementId: engagement.id, target: parsed.target,
    referencedIds: [...references], capturedAt: parsed.capturedAt,
    statement: "Metadata references verified; referenced file bytes are not thereby authenticated.",
  };
}

/** Never export object paths, names, raw evidence bytes or incident narratives. */
export function createProvenanceManifest(engagement, ownerId, entries, references = [], generatedAt = new Date().toISOString()) {
  if (!engagement || engagement.owner_id !== ownerId || !UUID.test(engagement.id || "") ||
      !Array.isArray(entries) || entries.length < 1 || entries.length > MAX_VERIFIED_RECORDS ||
      !Array.isArray(references) || references.length > MAX_VERIFIED_RECORDS ||
      !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("Manifest requires a bounded set of private observations from one owned engagement.");
  }
  const seen = new Set();
  const observations = entries.map((entry) => {
    if (!entry || entry.ownerId !== ownerId || entry.engagementId !== engagement.id ||
        !UUID.test(entry.evidenceId || "") || !HEX.test(entry.sha256 || "") ||
        !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > MAX_PROVENANCE_BYTES ||
        !MIME.has(entry.mime) || !Number.isFinite(Date.parse(entry.observedAt || "")) ||
        !Number.isFinite(Date.parse(entry.registeredAt || ""))) {
      throw new Error("Manifest entry has an invalid owner, engagement, byte count or digest.");
    }
    if (seen.has(entry.evidenceId)) throw new Error("Manifest evidence IDs must be unique.");
    seen.add(entry.evidenceId);
    const check = entry.comparison;
    if (!check || !["first-observation", "match", "mismatch"].includes(check.baseline) ||
        !["not-provided", "match", "mismatch"].includes(check.expected)) {
      throw new Error("Manifest comparison status was not recorded.");
    }
    return {
      evidenceId: entry.evidenceId, mimeType: entry.mime, bytes: entry.size,
      registeredAt: entry.registeredAt, locallyObservedAt: entry.observedAt,
      sha256: entry.sha256, baselineComparison: check.baseline,
      suppliedDigestComparison: check.expected,
    };
  }).sort((a,b) => a.evidenceId.localeCompare(b.evidenceId));
  const crossReferences = references.map((ref) => {
    if (!ref || !UUID.test(ref.investigationId || "") || ref.engagementId !== engagement.id ||
        !Array.isArray(ref.referencedIds) || ref.referencedIds.length > 20 ||
        ref.referencedIds.some((id) => !UUID.test(id)) ||
        new Set(ref.referencedIds).size !== ref.referencedIds.length) {
      throw new Error("Invalid private investigation reference set.");
    }
    return {
      investigationId: ref.investigationId, target: String(ref.target || "").slice(0,500),
      referencedIds: [...ref.referencedIds].sort(),
      referencedByteDigestsInThisExport: ref.referencedIds.filter((id) => seen.has(id)).length,
    };
  }).sort((a,b) => a.investigationId.localeCompare(b.investigationId));
  return {
    schema: PROVENANCE_SCHEMA,
    generatedAt: new Date(generatedAt).toISOString(),
    engagementId: engagement.id,
    collection: "session-only local SHA-256 from explicitly downloaded private objects",
    limitations: [
      "This report is not digitally signed or independently attested.",
      "No server-side immutable hash baseline or verified chain of custody is provided.",
      "An observed hash match does not establish original authenticity, author identity or remediation.",
      "Only explicitly reviewed records are included; unreviewed objects have unknown status.",
    ],
    totalHashed: observations.length, observations, investigationReferences: crossReferences,
  };
}
