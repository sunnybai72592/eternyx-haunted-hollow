const REF_PART = /^[A-Za-z0-9._/-]{1,200}$/;

export function normalizeGitHubRef(value, label = "Git ref") {
  if (typeof value !== "string") throw new Error(label + " must be text.");
  const ref = value.trim();
  if (!ref || ref.length > 200 || !REF_PART.test(ref) ||
      ref.startsWith("/") || ref.endsWith("/") || ref.includes("//") ||
      ref.split("/").some((part) => !part || part === "." || part === ".." || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock") || part.includes("@{")) ||
      /[~^:?*\[\]\\]/.test(ref) || /\s/.test(ref) || ref.endsWith(".")) {
    throw new Error("Enter a valid branch, tag, or commit reference for " + label.toLowerCase() + ".");
  }
  return ref;
}

export function buildGitHubComparePath(base, head) {
  const safeBase = normalizeGitHubRef(base, "Base ref");
  const safeHead = normalizeGitHubRef(head, "Compare ref");
  if (safeBase === safeHead) throw new Error("Choose two different refs to compare.");
  return "compare/" + encodeURIComponent(safeBase) + "..." + encodeURIComponent(safeHead);
}

export function summarizeGitHubComparison(comparison) {
  if (!comparison || !["ahead", "behind", "identical", "diverged"].includes(comparison.status)) {
    throw new Error("GitHub returned an unsupported comparison status.");
  }
  const totalCommits = comparison.total_commits;
  if (!Number.isSafeInteger(totalCommits) || totalCommits < 0) {
    throw new Error("GitHub returned an invalid commit count.");
  }
  const files = Array.isArray(comparison.files) ? comparison.files : [];
  const commits = Array.isArray(comparison.commits) ? comparison.commits : [];
  return {
    status: comparison.status,
    aheadBy: Number.isSafeInteger(comparison.ahead_by) ? comparison.ahead_by : 0,
    behindBy: Number.isSafeInteger(comparison.behind_by) ? comparison.behind_by : 0,
    totalCommits,
    returnedCommits: commits.length,
    filesChanged: files.length,
    additions: files.reduce((sum, file) => sum + (Number.isSafeInteger(file.additions) ? file.additions : 0), 0),
    deletions: files.reduce((sum, file) => sum + (Number.isSafeInteger(file.deletions) ? file.deletions : 0), 0),
    truncatedFiles: files.length >= 300,
    truncatedCommits: totalCommits > commits.length,
  };
}
