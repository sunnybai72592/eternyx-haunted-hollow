import fs from "node:fs";
import { verifyDeveloperStagingEnvelope } from "./developer-staging-envelope.mjs";
import net from "node:net";
import { verifyHostedDeveloperReleaseObservations, verifyHostedDeveloperRuntimeSafety } from "./developer-staging-provenance.mjs";
import { verifyDeveloperHostedHeaders, summarizeDeveloperReleaseDecision } from "./developer-staging-headers.mjs";
import { verifyHostedDeveloperDeepLinkObservations } from "./developer-staging-deeplink.mjs";

export const DEVELOPER_STAGING_CONFIRMATION = "RUN_DEVELOPER_STAGING_READ_ONLY";
export const DEVELOPER_BROWSER_CASES = Object.freeze([
  "create-save-reload-reopen", "editor-search-format-replace-restore",
  "js-preflight-source-free-report", "explicit-isolated-preview",
  "checksum-recovery-and-tamper", "project-linked-api-suite", "unsafe-import-rejected",
]);
export const DEVELOPER_BROWSER_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);

const unsafeHost = /(^localhost$|\.localhost$|\.local$|\.internal$|\.test$|\.invalid$)/i;
const stageLabel = /(^|[.-])stag(?:e|ing)([.-]|$)/i;
const expectedSha = /^[a-f0-9]{40}$/;
function fail(message) { throw new Error("Developer staging gate: " + message); }

export function checkDeveloperStagingConfig(config) {
  const { origin, expectedHost, confirmation } = config || {};
  if (confirmation !== DEVELOPER_STAGING_CONFIRMATION) fail("operator approval phrase is required.");
  if (typeof origin !== "string" || typeof expectedHost !== "string" ||
      origin.length > 250 || expectedHost.length > 250) fail("both pinned repository staging variables are required.");
  if (origin.trim() !== origin || expectedHost.trim() !== expectedHost) fail("whitespace in staging configuration is not allowed.");
  let parsed;
  try { parsed = new URL(origin); }
  catch { fail("staging origin is not a valid URL."); }
  const host = parsed.hostname;
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== "/" || parsed.port || (origin !== parsed.origin && origin !== parsed.origin + "/")) {
    fail("staging target must be a canonical HTTPS origin without credentials, port, query, path or fragment.");
  }
  if (host !== expectedHost || host.length < 7 || host.length > 253 ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) || net.isIP(host) ||
      unsafeHost.test(host) || !stageLabel.test(host)) {
    fail("origin hostname must exactly match an approved, public staging hostname.");
  }
  if (host.includes("..") || host.split(".").some(label=>label.startsWith("-") || label.endsWith("-"))) {
    fail("invalid staging DNS labels.");
  }
  return { origin: parsed.origin, host };
}

export function verifyDeveloperStagingEvidence(value, config, sourceCommit, currentTime = Date.now(), expectedRun = null) {
  const target = checkDeveloperStagingConfig(config);
  if (!expectedSha.test(sourceCommit || "")) fail("source revision is not a full git SHA.");
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.schema !== "eternyx-developer-browser-acceptance-v1" ||
      value.environment !== "operator-specified staging" || value.staging_executed !== true ||
      value.production_verified !== false || value.browser !== "Chrome" ||
      value.target_host !== target.host || value.network_scope !== "same-origin only" ||
      value.api_requests_executed !== false || value.commit !== sourceCommit) {
    fail("staging evidence has an invalid environment, revision, scope or target.");
  }
  const attempt = verifyDeveloperStagingEnvelope(value, expectedRun, currentTime);
  if (!Array.isArray(value.cases) || value.cases.length !== 14) {
    fail("all seven cases at two screen sizes are required; partial evidence is not passing evidence.");
  }
  const expected = new Set(DEVELOPER_BROWSER_VIEWPORTS.flatMap(
    viewport=>DEVELOPER_BROWSER_CASES.map(name=>viewport + "/" + name)));
  const observed = new Set();
  for (const result of value.cases) {
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        Object.keys(result).sort().join(",") !== "case,result,viewport" ||
        result.result !== "passed" || !expected.has(result.viewport + "/" + result.case) ||
        observed.has(result.viewport + "/" + result.case)) {
      fail("staging evidence contains failed, duplicated or unexpected case results.");
    }
    observed.add(result.viewport + "/" + result.case);
  }
  if (observed.size !== expected.size) fail("incomplete staging case coverage.");
  const release = verifyHostedDeveloperReleaseObservations(value.release_observations, sourceCommit);
  const deepLink = verifyHostedDeveloperDeepLinkObservations(value.deep_link_observations);
  const runtime = verifyHostedDeveloperRuntimeSafety(value);
  const headers = verifyDeveloperHostedHeaders(value.header_observations);
  const releaseDecision = summarizeDeveloperReleaseDecision({developer_case_count:observed.size},release,runtime,headers);
  return {
    result: "browser-acceptance-passed",
    environment: "operator-specified staging",
    target_host: target.host,
    checked_source_revision: sourceCommit,
    workflow_attempt: attempt,
    developer_case_count: observed.size,
    viewports: DEVELOPER_BROWSER_VIEWPORTS,
    observed_release: release,
    verified_deep_link: deepLink,
    runtime_safety: runtime,
    hosting_https_headers: headers,
    release_decision: releaseDecision,
    notes: "Observed public root and direct Project Lab route, matching HTML/JavaScript and release manifest against the checkout. This is unsigned release provenance, not a signed deployment attestation; protected backend and production readiness are unverified.",
    production_verified: false,
  };
}

function attemptLabel(attempt) { return attempt.run_id + " / " + attempt.run_attempt; }

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--source-check") {
    const config = {origin:"https://developer.staging.example.org",expectedHost:"developer.staging.example.org",confirmation:DEVELOPER_STAGING_CONFIRMATION};
    const result = checkDeveloperStagingConfig(config);
    if (result.host !== config.expectedHost) fail("offline staging source check failed.");
    process.stdout.write("Developer staging source guard syntax and sample canonical origin validated (no remote test).\n");
    return;
  }
  const config = {
    origin:process.env.DEVELOPER_STAGING_ORIGIN,
    expectedHost:process.env.DEVELOPER_STAGING_HOST,
    confirmation:process.env.DEVELOPER_STAGING_CONFIRM,
  };
  if (args.length === 1 && args[0] === "--check-config") {
    const result = checkDeveloperStagingConfig(config);
    process.stdout.write("Approved read-only staging target configured: " + result.host +
      ". No remote test has been run.\n");
    return;
  }
  if (args.length === 2 && args[0] === "--verify-report") {
    checkDeveloperStagingConfig(config);
    const path = args[1];
    const stats = fs.statSync(path);
    if (stats.size < 200 || stats.size > 50_000) fail("acceptance evidence is missing or unexpectedly large.");
    const report = JSON.parse(fs.readFileSync(path,"utf8"));
    const summary = verifyDeveloperStagingEvidence(report, config, process.env.GITHUB_SHA, Date.now(), {
      runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    });
    const output = JSON.stringify(summary,null,2) + "\n";
    process.stdout.write(output);
    if (process.env.DEVELOPER_VERIFIED_SUMMARY_PATH) {
      fs.writeFileSync(process.env.DEVELOPER_VERIFIED_SUMMARY_PATH, output, { flag: "wx" });
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [
        "## ETERNYX Developer Studio — hosted staging acceptance",
        "",
        "Target host: " + summary.target_host,
        "Workflow run / attempt: " + attemptLabel(summary.workflow_attempt),
        "Browser observation duration: " + summary.workflow_attempt.elapsed_seconds + " seconds",
        "Developer Chrome journeys: " + summary.developer_case_count + "/14 passed",
        "Observed public build ID: " + summary.observed_release.build_id,
        "Manifest, HTML and JS match checkout SHA: YES",
        "Direct Project Lab route: " + summary.verified_deep_link.observations + "/4 observations passed (no redirects, correct rendered page and matching HTML/JS markers)",
        "Runtime exceptions / first-party asset failures / attempted writes: 0 / 0 / 0",
        "Blocked external requests: " + summary.runtime_safety.blocked_external_requests,
        "Root document HTTPS security controls: " + summary.hosting_https_headers.required_controls.length + "/7 checked at 4 observations",
        "",
        "Staging UI acceptance: PASS (observed, unsigned release metadata)",
        "Release decision: HOLD_PRODUCTION (backend/roles/providers not tested)",
        "Protected backend verification: NOT TESTED",
        "Production certification: NO",
        "",
      ];
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
    }
    return;
  }
  fail("use --source-check, --check-config or --verify-report <file>.");
}

if (process.argv[1]?.endsWith("developer-staging-gate.mjs")) {
  try { main(); }
  catch (error) { process.stderr.write((error?.message || "Staging gate failed.") + "\n"); process.exitCode = 1; }
}
