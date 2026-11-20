/**
 * Offline shape/consistency validator for the staging RLS runner's sanitized report.
 * It does NOT independently verify a database, identities or the provenance of JSON.
 * A green workflow requires both the live runner and this verifier to succeed.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const expectedCases = Object.freeze([
  "two-distinct-authenticated-staging-users",
  "non-admin-user-1", "non-admin-user-2",
  "profiles.own-private-read", "profiles.cross-user-read-denied",
  "profiles.anonymous-read-denied",
  ...["conversation_sessions", "chat_history", "pentest_engagements"].flatMap(table => [
    table + ".fixtures-created", table + ".own-read",
    table + ".cross-read-denied", table + ".anon-read-denied",
    table + ".forged-owner-insert-denied",
    ...(table === "chat_history" ? [] : [table + ".cross-update-denied"]),
    table + ".cross-delete-denied",
  ]),
  "staging-sign-out",
]);

const expectedTables = ["conversation_sessions", "chat_history", "pentest_engagements"];
function validKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

export function validateStagingEvidence(report) {
  const rootKeys = ["schema", "environment", "approval", "production_tested",
    "stage_fixture_cleanup_failed", "tested_tables", "expected_tables",
    "configured_account_slots", "authenticated_accounts", "expected_cases",
    "attempted_cases", "passed_cases", "results", "production_certified"];
  if (!validKeys(report, rootKeys)) return false;
  if (report.schema !== 1 || report.environment !== "isolated-supabase-staging" ||
      report.approval !== "isolated staging only: manual fixture writes" ||
      report.production_tested !== false || report.production_certified !== false ||
      report.stage_fixture_cleanup_failed !== false ||
      report.configured_account_slots !== 2 || report.authenticated_accounts !== 2 ||
      report.expected_cases !== expectedCases.length ||
      report.attempted_cases !== expectedCases.length ||
      report.passed_cases !== expectedCases.length) return false;
  for (const field of ["tested_tables", "expected_tables"]) {
    if (!Array.isArray(report[field]) ||
        report[field].length !== expectedTables.length ||
        !expectedTables.every((t, i) => report[field][i] === t)) return false;
  }
  if (!Array.isArray(report.results) || report.results.length !== expectedCases.length) return false;
  const seen = new Set();
  for (const result of report.results) {
    if (!validKeys(result, ["case", "result"]) ||
        !expectedCases.includes(result.case) || seen.has(result.case) ||
        result.result !== "passed") return false;
    seen.add(result.case);
  }
  return seen.size === expectedCases.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let valid = false;
  try {
    const path = process.argv[2] || "test-results/staging-rls-isolation.json";
    valid = validateStagingEvidence(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    valid = false;
  }
  process.stdout.write(valid
    ? "PASS staging report consistency (not independent production certification)\n"
    : "FAIL incomplete or inconsistent staging evidence\n");
  if (!valid) process.exitCode = 1;
}
