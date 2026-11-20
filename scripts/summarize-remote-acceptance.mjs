import { readFileSync } from "node:fs";
import { evaluateRemoteAcceptance } from "../src/lib/remoteAcceptance.mjs";

const file = process.argv[2];
if (!file) {
  process.stderr.write("Usage: node scripts/summarize-remote-acceptance.mjs <report.json>\n");
  process.exitCode = 2;
} else {
  try {
    const report = JSON.parse(readFileSync(file, "utf8"));
    const summary = evaluateRemoteAcceptance(report);
    const lines = [
      "# ETERNYX hosted front-end smoke audit",
      "",
      "Target: " + summary.environment,
      "Browser journeys: " + summary.passed + "/" + summary.expected + " passed",
      "Failed: " + summary.failed + "; missing: " + summary.missing,
      "Blocked external requests: " + summary.blockedExternal,
      "Blocked HTTP write attempts: " + summary.blockedWrites,
      "Read-only hosted frontend: " + (summary.allBrowserJourneysPassed ? "passed" : "NOT verified"),
      "Production build revision: not verified",
      "Production certification: NO",
      "Live payments and AI provider operations: NOT tested",
      "",
      summary.nextAction,
    ];
    const md = lines.join("\n") + "\n";
    process.stdout.write(md);
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import("node:fs");
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    }
    if (!summary.allBrowserJourneysPassed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(String(error instanceof Error ? error.message : "Invalid report") + "\n");
    process.exitCode = 1;
  }
}
