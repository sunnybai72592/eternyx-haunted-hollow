import { parseWorkspaceRestore } from "./workspaceRestore.mjs";
import { parseWorkspaceFullBackup, WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES } from "./workspaceFullBackup.mjs";
import { parseWorkspaceArchiveV3 } from "./workspaceChecklistArchive.mjs";
import { validateWorkspaceRecoveryForkHeader } from "./workspaceRecoveryFork.mjs";
import { verifyWorkspaceReviewedArchive } from "./workspaceReconciliationVerification.mjs";
import { sha256Hex } from "./workspaceImportRecovery.mjs";

const MAX_BYTES = WORKSPACE_BACKUP_MAX_DOCUMENT_BYTES;

// Reads an archive completely in the browser; never uploads or stores bytes.
// A successful result verifies file-internal consistency, NOT authorship,
// provenance, production DB migration status or historic download completion.
export async function auditWorkspaceBackupBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES) {
    throw new Error("Select an ETERNYX Workspace archive between 1 byte and 24 MiB");
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  let header;
  try { header = JSON.parse(raw); }
  catch { throw new Error("The archive is not valid JSON"); }
  if (!header || header.format !== "eternyx.workspace.project" ||
      ![1, 2, 3].includes(header.format_version)) {
    throw new Error("File is not a supported ETERNYX Workspace v1/v2/v3 archive");
  }
  const version = header.format_version;
  const parsed = version === 3
    ? await parseWorkspaceArchiveV3(raw)
    : version === 2
      ? await parseWorkspaceFullBackup(raw)
      : parseWorkspaceRestore(raw);
  const fork = validateWorkspaceRecoveryForkHeader(header.recovery_fork);
  const reviewed = header.reviewed_reconciliation
    ? await verifyWorkspaceReviewedArchive(raw, null, bytes)
    : null;
  const hash = await sha256Hex(bytes);
  const includedFiles = parsed.files?.length ?? 0;
  const skippedFiles = parsed.filesSkipped ?? 0;
  return {
    version,
    archiveMode: version === 3 ? parsed.archiveMode :
      version === 2 ? "files" : "metadata",
    projectName: parsed.project.name,
    taskCount: parsed.tasks.length,
    checklistCount: parsed.stepCount ?? 0,
    savedItemCount: parsed.items.length,
    includedFiles,
    skippedFiles,
    actualFileBytes: parsed.files?.reduce((sum, file) => sum + file.bytes.length, 0) ?? 0,
    archiveBytes: bytes.byteLength,
    sha256: hash,
    isRecoveryCopy: Boolean(fork),
    reviewedMarkerVersion: reviewed?.version ?? null,
    reviewedPayloadVerified: reviewed?.verifiedPayload === true,
    limitations: "Local archive structure and included file bytes are validated. No production database records were read. This is not a signed authenticity check, a full audit-history backup, or proof of successful import.",
  };
}
