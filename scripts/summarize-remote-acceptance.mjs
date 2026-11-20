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
    if (summary.pageObservations.length > 0) {
      const first = summary.pageObservations[0];
      lines.push("");
      lines.push("First failed UI case: " + first.case + " (" + first.viewport + ")");
      lines.push("Observed page: " + first.path + "; HTTP " +
        (first.http_status ?? "unknown") + "; heading class: " + first.heading_class);
      lines.push("Approved host: " + first.on_approved_host +
        "; React root present: " + first.root_present +
        "; reason: " + first.reason);
      lines.push("Page observations captured: " + summary.pageObservations.length);
    }
    if (summary.blockedSamples.length > 0) {
      lines.push("");
      lines.push("First blocked request (query omitted):");
      const first = summary.blockedSamples[0];
      lines.push(first.reason + " — " + first.method + " " + first.path +
        " (" + first.resource_type + ")");
      lines.push("Blocked request samples: " + summary.blockedSamples.length +
        " (bounded; no payloads)");
    }
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
