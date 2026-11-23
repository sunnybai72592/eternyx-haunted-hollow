// Presentation of genuine owner-scoped import integrity receipts. No data is
// invented, and this is *not* a physical file or cryptographic content audit.
export function recoveryIntegrityState(integrity) {
  if (!integrity || typeof integrity !== "object" ||
    typeof integrity.status !== "string" ||
    typeof integrity.content_matches !== "boolean" ||
    typeof integrity.baseline_known !== "boolean") {
    return { label: "Integrity not checked", canResume: false, warning: true };
  }
  if (integrity.status === "held") {
    return { label: "Protected — import writes paused", canResume: false, warning: false };
  }
  if (integrity.status === "discarding") {
    return { label: "Sealed for empty-project disposal", canResume: false, warning: true };
  }
  if (integrity.status === "complete") {
    return { label: "Restore completed", canResume: false, warning: false };
  }
  if (!integrity.baseline_known || !integrity.content_matches) {
    return {
      label: "Project content changed since server checkpoint",
      canResume: false, warning: true,
    };
  }
  return { label: "Project records match last server checkpoint", canResume: true, warning: false };
}

export function recoverySafetyWarnings(report, integrity) {
  const notices = [];
  if (!integrity) return ["Import content has not been inspected yet; do not assume a safe resume."];
  const state = recoveryIntegrityState(integrity);
  if (state.warning) notices.push(state.label + ". Preserve a project backup before changing anything.");
  if (integrity.status === "held") {
    notices.push("The import is on hold. Work already saved in this project is kept; imports cannot continue until protection is released.");
  }
  if (report && report.receipt_counts_match === true &&
      integrity.baseline_known && integrity.content_matches === false) {
    notices.push("Record totals still match, but task, checklist, note, link or project content changed.");
  }
  return notices;
}

const finiteCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function buildWorkspaceRecoveryReport(report, integrity) {
  if (!report || !integrity || integrity.session_id !== report.session_id) {
    throw new Error("Recovery diagnostic requires one verified private session");
  }
  const countNames = [
    "expected_tasks","expected_steps","expected_items","expected_files",
    "committed_tasks","committed_steps","committed_items","committed_files",
    "actual_tasks","actual_steps","actual_items","stored_objects",
    "file_claims","pending_uploads","missing_registered_files","unclaimed_objects",
  ];
  const counts = {};
  for (const field of countNames) {
    const value = finiteCount(report[field]);
    if (value === null) throw new Error("Recovery report is missing verified server counts");
    counts[field] = value;
  }
  if (!["active","held","complete","discarding"].includes(integrity.status) ||
      typeof integrity.content_matches !== "boolean" ||
      typeof integrity.baseline_known !== "boolean") {
    throw new Error("Import integrity status is unavailable");
  }
  return JSON.stringify({
    format: "eternyx.workspace.recovery.diagnostic",
    version: 1,
    session_status: integrity.status,
    project_status: report.project_status,
    archive_version: report.source_version,
    ledger_counts_match: report.receipt_counts_match === true,
    database_content_matches_checkpoint: integrity.content_matches,
    baseline_known: integrity.baseline_known,
    checkpoint_at: integrity.checkpoint_at ?? null,
    held_at: integrity.held_at ?? null,
    counts,
    note: "Diagnostic of DB metadata/counts only; no file bytes, task texts, credentials, paths, IDs or archive hashes. Not a backup.",
  }, null, 2);
}
