import fs from "node:fs";
import net from "node:net";

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

export function verifyDeveloperStagingEvidence(value, config, sourceCommit, currentTime = Date.now()) {
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
  if (typeof value.finished_at !== "string" || !Number.isFinite(Date.parse(value.finished_at))) {
    fail("staging report has no valid completion timestamp.");
  }
  const age = currentTime - Date.parse(value.finished_at);
  if (age < -60_000 || age > 60 * 60_000) fail("staging evidence is not recent.");
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
  return {
    result: "browser-acceptance-passed",
    environment: "operator-specified staging",
    target_host: target.host,
    checked_source_revision: sourceCommit,
    developer_case_count: observed.size,
    viewports: DEVELOPER_BROWSER_VIEWPORTS,
    notes: "Real hosted public Project Lab browser flows only; deployed artifact identity, protected backend and production readiness are unverified.",
    production_verified: false,
  };
}

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
    const summary = verifyDeveloperStagingEvidence(report, config, process.env.GITHUB_SHA);
    process.stdout.write(JSON.stringify(summary,null,2) + "\n");
    return;
  }
  fail("use --source-check, --check-config or --verify-report <file>.");
}

if (process.argv[1]?.endsWith("developer-staging-gate.mjs")) {
  try { main(); }
  catch (error) { process.stderr.write((error?.message || "Staging gate failed.") + "\n"); process.exitCode = 1; }
}
