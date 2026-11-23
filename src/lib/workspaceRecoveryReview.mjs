// View-only recovery helpers. Never infer successful imports from browser clicks
// or compute "health scores" unrelated to real owner-scoped server receipts.

export const WORKSPACE_RECOVERY_PAGE_SIZE = 20;

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function workspaceRecoveryMetrics(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Recovery inspection did not return a valid server report");
  }
  const fields = [
    ["Tasks", "committed_tasks", "expected_tasks", "actual_tasks"],
    ["Checklist steps", "committed_steps", "expected_steps", "actual_steps"],
    ["Saved notes/links", "committed_items", "expected_items", "actual_items"],
    ["Registered files", "committed_files", "expected_files", null],
  ];
  return fields.map(([label, committed, expected, actual]) => {
    const c = count(report[committed]);
    const e = count(report[expected]);
    const a = actual ? count(report[actual]) : null;
    if (c === null || e === null || (actual && a === null)) {
      throw new Error("Recovery report counts are invalid or incomplete");
    }
    return {
      label,
      committed: c,
      expected: e,
      actual: a,
      overExpected: c > e,
      differsFromLedger: a !== null && label !== "Saved notes/links" && a !== c,
    };
  });
}

export function workspaceRecoveryWarnings(report) {
  workspaceRecoveryMetrics(report);
  const warnings = [];
  if (report.receipt_counts_match !== true) {
    warnings.push("Current project rows differ from the committed import receipts. Inspect manual changes before retrying.");
  }
  for (const [key, message] of [
    ["pending_uploads", "Private uploaded objects are awaiting database registration; resume the exact archive."],
    ["missing_registered_files", "Some registered files are missing from private Storage; do not assume recovery is complete."],
    ["unclaimed_objects", "Private Storage contains objects outside this import's file claims. Manual review is needed."],
  ]) {
    const value = count(report[key]);
    if (value === null) throw new Error("Recovery inspection lacks physical file checks");
    if (value > 0) warnings.push(message + " Count: " + value + ".");
  }
  return warnings;
}

export function workspaceRecoveryPhase(status) {
  switch (status) {
    case "active": return "Unfinished — select the same archive to resume";
    case "held": return "Protected — import writes paused; saved work retained";
    case "complete": return "Complete — previously restored";
    case "discarding": return "Sealed — ready for final removal only after server recheck";
    default: return "Unknown status — refresh and review";
  }
}

export function workspaceRecoveryCanPrepare(report) {
  return report?.status === "active" && report?.can_prepare_discard === true;
}
export function workspaceRecoveryCanFinalize(report) {
  return report?.status === "discarding" && report?.can_finalize_discard === true;
}
