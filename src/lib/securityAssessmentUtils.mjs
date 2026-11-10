const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "in-progress", "blocked", "verified", "accepted"];
const LIMIT = 100;

export function validateAssessmentFinding(input = {}) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const severity = String(input.severity || "").toLowerCase();
  const evidence = typeof input.evidence === "string" ? input.evidence.trim() : "";
  const recommendation = typeof input.recommendation === "string" ? input.recommendation.trim() : "";
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const status = String(input.status || "open").toLowerCase();
  const dueDate = typeof input.dueDate === "string" ? input.dueDate.trim() : "";
  if (!title) throw new Error("Add a clear finding title.");
  if (title.length > 180) throw new Error("Finding title must be 180 characters or fewer.");
  if (!SEVERITIES.includes(severity)) throw new Error("Choose a valid severity.");
  if (evidence.length > 4000 || recommendation.length > 4000 || owner.length > 120) throw new Error("Evidence, recommendation, or owner exceeds its length limit.");
  if (!STATUSES.includes(status)) throw new Error("Choose a valid remediation status.");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Due date must use YYYY-MM-DD.");
  return { title, severity, evidence, recommendation, owner, status, dueDate };
}

export function summarizeAssessment(findings = []) {
  if (!Array.isArray(findings) || findings.length > LIMIT) throw new Error("Assessment must contain no more than 100 findings.");
  const summary = { total: findings.length, critical: 0, high: 0, medium: 0, low: 0, open: 0, inProgress: 0, blocked: 0, verified: 0, accepted: 0 };
  for (const finding of findings) {
    const item = validateAssessmentFinding(finding);
    summary[item.severity] += 1;
    summary[item.status === "in-progress" ? "inProgress" : item.status] += 1;
  }
  return summary;
}

export function buildAssessmentReport({ assessmentName = "Security assessment", target = "", findings = [] } = {}) {
  if (typeof assessmentName !== "string" || assessmentName.trim().length > 160) throw new Error("Assessment name must be 160 characters or fewer.");
  if (typeof target !== "string" || target.length > 500) throw new Error("Target or scope must be 500 characters or fewer.");
  const normalized = findings.map(validateAssessmentFinding);
  summarizeAssessment(normalized);
  const lines = ["# ETERNYX Security Assessment & Remediation Register", "", "**Assessment:** " + (assessmentName.trim() || "Security assessment"), "**Target / scope:** " + (target.trim() || "Not supplied"), "**Findings:** " + normalized.length, "", "This register is analyst-maintained. Entries are not independently verified by ETERNYX.", ""];
  for (const [index, item] of normalized.entries()) {
    lines.push("## " + (index + 1) + ". [" + item.severity.toUpperCase() + "] " + item.title, "", "- Status: " + item.status, "- Owner: " + (item.owner || "Unassigned"), "- Due date: " + (item.dueDate || "Not set"), "", "**Evidence / observation**", item.evidence || "Not supplied", "", "**Recommended action**", item.recommendation || "Not supplied", "");
  }
  lines.push("## Validation note", "Mark a finding verified only after recording and reviewing evidence that the remediation is effective. Accepted risk should have documented approval from the responsible risk owner.");
  return lines.join("\n");
}
