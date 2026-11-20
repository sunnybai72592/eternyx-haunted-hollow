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
      "Blocked HTTP write attempts (non-telemetry): " + summary.blockedWrites,
      "Known Lovable telemetry POST attempts blocked: " + summary.blockedKnownTelemetry,
      "JavaScript startup error categories: " + (
        summary.jsErrorCategories.length ? [...new Set(summary.jsErrorCategories)].join(", ") : "none observed"
      ),
      "First-party script/document HTTP failures: " + summary.assetHttpFailures.length,
      "Read-only hosted frontend: " + (summary.allBrowserJourneysPassed ? "passed" : "NOT verified"),
      "Build fingerprint: " + (summary.releaseEvidence.build_id ?? "not available"),
      "HTML + JavaScript match manifest: " +
        (summary.releaseEvidence.html_matches && summary.releaseEvidence.client_matches),
      "Hosted release provenance: " + summary.releaseEvidence.status,
      "Source commit claimed by build: " + (summary.releaseEvidence.source_sha ?? "not available"),
      "GitHub checkout SHA matched: " + summary.releaseEvidence.matches_checkout,
      "Production build revision: " +
        (summary.deploymentRevisionKnown ? "reported source SHA matched the checkout" : "not verified"),
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
        "; React root populated: " + (first.root_has_children ?? "not recorded") +
        "; reason: " + first.reason);
      lines.push("Latest classified JavaScript error: " +
        (first.last_js_error_category ?? "not recorded") +
        "; script error responses: " + (first.script_http_failures ?? "not recorded"));
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
