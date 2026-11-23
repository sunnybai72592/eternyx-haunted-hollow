import { parseWorkspaceRestore, WORKSPACE_RESTORE_MAX_BYTES } from "./workspaceRestore.mjs";
import { parseWorkspaceFullBackup, WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "./workspaceFullBackup.mjs";
import { parseWorkspaceArchiveV3 } from "./workspaceChecklistArchive.mjs";
import { sha256Hex } from "./workspaceImportRecovery.mjs";

// Recovery copies are *explicitly changed* portable archives. The distinct
// exact-byte SHA-256 gives the Phase 9 import ledger a new key/project.
// We never change the original source or the previously edited project.
export const WORKSPACE_RECOVERY_FORK_VERSION = 1;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const suffix = " (Recovery copy)";
const bytes = value => new TextEncoder().encode(value).length;

export function validateWorkspaceRecoveryForkHeader(header) {
  if (header === undefined) return null;
  if (!header || typeof header !== "object" || Array.isArray(header) ||
      Object.keys(header).sort().join("|") !==
        ["created_at","fork_id","source_sha256","version"].sort().join("|") ||
      header.version !== WORKSPACE_RECOVERY_FORK_VERSION ||
      typeof header.source_sha256 !== "string" || !HASH.test(header.source_sha256) ||
      typeof header.fork_id !== "string" || !UUID.test(header.fork_id) ||
      typeof header.created_at !== "string" || !Number.isFinite(Date.parse(header.created_at)) ||
      new Date(header.created_at).toISOString() !== header.created_at) {
    throw new Error("The recovery copy has an invalid or forged-format provenance marker");
  }
  return header;
}

export async function parsePortableWorkspaceArchive(raw) {
  if (typeof raw !== "string") throw new Error("Workspace source must be UTF-8 JSON");
  let doc;
  try { doc = JSON.parse(raw); }
  catch { throw new Error("Workspace source contains invalid JSON"); }
  if (!doc || typeof doc !== "object" || Array.isArray(doc) ||
      doc.format !== "eternyx.workspace.project" ||
      ![1,2,3].includes(doc.format_version)) {
    throw new Error("Recovery copies require a supported v1, v2 or v3 Workspace archive");
  }
  const marker = validateWorkspaceRecoveryForkHeader(doc.recovery_fork);
  const parsed = doc.format_version === 3
    ? await parseWorkspaceArchiveV3(raw)
    : doc.format_version === 2
      ? await parseWorkspaceFullBackup(raw)
      : parseWorkspaceRestore(raw);
  return { doc, parsed, version: doc.format_version, forkMarker: marker };
}

export async function createWorkspaceRecoveryFork(raw, sourceSha256, forkId, createdAt) {
  if (typeof sourceSha256 !== "string" || !HASH.test(sourceSha256) ||
      typeof forkId !== "string" || !UUID.test(forkId) ||
      typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt) {
    throw new Error("Cannot create a recovery copy without valid source identity and UTC timestamp");
  }
  if (await sha256Hex(raw) !== sourceSha256) {
    throw new Error("Recovery source has changed since it was selected; no copy was created");
  }
  const { doc, parsed, version, forkMarker } = await parsePortableWorkspaceArchive(raw);
  if (forkMarker) {
    throw new Error("This is already a recovery copy. Use the original archive to create a separate recovery branch");
  }
  const originalName = parsed.project.name;
  const newName = originalName.slice(0, 120 - suffix.length).trimEnd() + suffix;
  const forkDoc = {
    ...doc,
    project: { ...doc.project, name: newName },
    recovery_fork: {
      version: WORKSPACE_RECOVERY_FORK_VERSION,
      source_sha256: sourceSha256,
      fork_id: forkId,
      created_at: createdAt,
    },
  };
  const result = JSON.stringify(forkDoc);
  const max = version === 1 ? WORKSPACE_RESTORE_MAX_BYTES : WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES;
  if (bytes(result) > max) {
    throw new Error("Recovery copy exceeds the archive format's size limit; no incomplete file was created");
  }
  const checked = await parsePortableWorkspaceArchive(result);
  if (checked.parsed.tasks.length !== parsed.tasks.length ||
      checked.parsed.items.length !== parsed.items.length ||
      (checked.parsed.files?.length ?? 0) !== (parsed.files?.length ?? 0) ||
      (checked.parsed.stepCount ?? 0) !== (parsed.stepCount ?? 0) ||
      checked.parsed.project.name !== newName) {
    throw new Error("Recovery copy verification failed; the source was not changed");
  }
  // Deep equality checks the validated task/item structures, including
  // checklist states; parsed full-file bytes remain verified by existing SHA.
  if (JSON.stringify(checked.parsed.tasks) !== JSON.stringify(parsed.tasks) ||
      JSON.stringify(checked.parsed.items) !== JSON.stringify(parsed.items)) {
    throw new Error("Recovery copy unexpectedly modified task or saved-item data");
  }
  for (let index = 0; index < (parsed.files?.length ?? 0); index++) {
    const a = parsed.files[index], b = checked.parsed.files[index];
    if (a.title !== b.title || a.mime_type !== b.mime_type ||
      a.size_bytes !== b.size_bytes || await sha256Hex(a.bytes) !== await sha256Hex(b.bytes)) {
      throw new Error("Recovery copy changed an embedded private file");
    }
  }
  const forkSha256 = await sha256Hex(result);
  if (forkSha256 === sourceSha256) throw new Error("Recovery copy was not distinct from the source");
  return {
    content: result, version,
    fingerprint: forkSha256,
    sourceFingerprint: sourceSha256,
    originalProjectName: originalName,
    projectName: newName,
    taskCount: parsed.tasks.length,
    stepCount: parsed.stepCount ?? 0,
    itemCount: parsed.items.length,
    fileCount: parsed.files?.length ?? 0,
  };
}
