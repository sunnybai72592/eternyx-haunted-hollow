import { readFileSync, appendFileSync } from "node:fs";
import { evaluateAnonymousRouteAudit } from "../src/lib/anonymousRouteAcceptance.mjs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/summarize-anonymous-routes.mjs <report.json>");
  process.exit(2);
}
try {
  const summary = evaluateAnonymousRouteAudit(JSON.parse(readFileSync(path, "utf8")));
  const lines = [
    "## ETERNYX anonymous hosted route guards",
    "",
    "Target: " + summary.target,
    "Signed-out browser routes passed: " + summary.passed + "/" + summary.expected,
    "Failed: " + summary.failed + "; missing: " + summary.missing,
    "Unexpected HTTP writes blocked: " + summary.blockedWrites,
    "Known Lovable telemetry requests blocked: " + summary.blockedTelemetry,
    "External requests blocked: " + summary.blockedExternal,
    "Anonymous FRONTEND route protection: " + (summary.frontEndAnonymousGuardPassed ? "passed" : "NOT verified"),
    "Authenticated login and account isolation: NOT tested",
    "Supabase server RLS: NOT tested",
    "Production certification: NO",
    "",
    "Passing redirects cannot substitute for server-side database authorization tests.",
  ];
  const message = lines.join("\n") + "\n";
  process.stdout.write(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
  if (!summary.frontEndAnonymousGuardPassed) process.exitCode = 1;
} catch (error) {
  process.stderr.write("Invalid anonymous route evidence: " +
    (error instanceof Error ? error.message : "unknown") + "\n");
  process.exitCode = 1;
}
