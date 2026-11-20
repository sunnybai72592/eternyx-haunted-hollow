import { readFileSync } from "node:fs";
import { evaluateSupabaseSecurityInventory } from "../src/lib/supabaseSecurityInventory.mjs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/review-supabase-security.mjs <private-catalog-export.json>");
  process.exitCode = 2;
} else {
  try {
    const report = evaluateSupabaseSecurityInventory(JSON.parse(readFileSync(path, "utf8")));
    const lines = [
      "# ETERNYX — Supabase read-only metadata review",
      "Public tables inspected: " + report.publicTables,
      "RLS-disabled tables: " + report.rlsDisabled,
      "SECURITY DEFINER functions: " + report.privilegedFunctions,
      "Policies inspected: " + report.reviewedPolicies,
      "Release security gate: " + report.releaseGate,
      "Production certification: NO",
      "End-to-end tenant isolation: NOT TESTED",
      "",
      "## Critical metadata findings",
      ...(report.critical.length ? report.critical.map(x => "- " + x) : ["- None detected by these narrow checks"]),
      "",
      "## Review required",
      ...(report.review.length ? report.review.map(x => "- " + x) : ["- None detected by these narrow checks"]),
      "",
      "## Intentional server-only restrictions",
      ...(report.observations.length ? report.observations.map(x => "- " + x) : ["- None detected by these narrow checks"]),
      "",
      report.nextStep,
    ];
    process.stdout.write(lines.join("\n") + "\n");
    // No CI secret or live database connection is involved.
    // A blocking issue fails. Warnings remain review-required rather than
    // being misreported as independently confirmed exploitation.
    if (report.critical.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid audit metadata");
    process.exitCode = 1;
  }
}
