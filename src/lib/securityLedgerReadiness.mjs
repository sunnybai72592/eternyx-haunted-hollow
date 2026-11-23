export const SECURITY_LEDGER_TABLES = Object.freeze([
  "security_case_assets",
  "security_case_findings",
  "security_case_finding_evidence",
  "security_case_finding_history",
]);

/**
 * Availability probe, NOT a substitute for two-account staging RLS acceptance.
 * The UI fails closed on partial, absent, malformed, or unreachable API results.
 */
export function evaluateLedgerReadiness({ userId, engagements, tableResults } = {}) {
  if (typeof userId !== "string" || !userId.trim()) {
    return { ready: false, reason: "An authenticated account is required." };
  }
  if (!engagements || engagements.error || !Array.isArray(engagements.data)) {
    return { ready: false, reason: "Private engagement access was not confirmed." };
  }
  if (!tableResults || typeof tableResults !== "object") {
    return { ready: false, reason: "The required table access probes did not complete." };
  }
  for (const table of SECURITY_LEDGER_TABLES) {
    const result = tableResults[table];
    if (!result || result.error || !Array.isArray(result.data)) {
      return { ready: false, reason: "The " + table + " table is unavailable or access was denied." };
    }
  }
  return { ready: true, reason: "All required data endpoints responded." };
}
