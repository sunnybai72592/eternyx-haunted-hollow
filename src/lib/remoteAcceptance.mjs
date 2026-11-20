/** ETERNYX remote-hosted acceptance reports are read-only evidence, never production certification. */
export const REMOTE_HOSTS = Object.freeze({
  "lovable-preview": "id-preview--4e3226d5-080f-4830-8446-9d86452bdf76.lovable.app",
  "public-domain-candidate": "eternyx-haunted-hollow.lovable.app",
});
export const REMOTE_CASES = Object.freeze([
  "registry-landing",
  "registry-filter",
  "developer-json",
  "developer-base64",
  "developer-url",
  "developer-uuid",
  "developer-jwt",
  "automation-local",
]);
export const REMOTE_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);

function invalid(message) {
  throw new Error("Invalid remote acceptance evidence: " + message);
}
export function evaluateRemoteAcceptance(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) invalid("expected object");
  const hostname = REMOTE_HOSTS[report.target];
  if (!hostname || report.hostname !== hostname) invalid("unknown target or host");
  if (report.environment !== "remote ETERNYX hosted frontend, anonymous, read-only") invalid("untrusted environment");
  if (report.production_verified !== false || report.payment_or_provider_verified !== false) invalid("unjustified certification");
  if (report.mocked_responses !== false) invalid("provider data cannot be claimed real");
  if (report.git_revision_under_test !== "unverified: hosting release SHA not exposed") invalid("unknown deployed revision");
  if (report.network_policy !== "GET/HEAD to exact allowlisted first-party HTTPS host only") invalid("network policy mismatch");
  for (const key of ["blocked_external_requests", "blocked_write_attempts"]) {
    if (!Number.isSafeInteger(report[key]) || report[key] < 0) invalid("invalid blocked count");
  }
  const expected = REMOTE_CASES.length * REMOTE_VIEWPORTS.length;
  if (report.expected_cases !== expected || !Array.isArray(report.cases)) invalid("invalid expected cases");
  const seen = new Set();
  let passed = 0;
  let failed = 0;
  for (const item of report.cases) {
    if (!item || !REMOTE_CASES.includes(item.case) || !REMOTE_VIEWPORTS.includes(item.viewport)) {
      invalid("unknown case or viewport");
    }
    if (item.result !== "passed" && item.result !== "failed") invalid("unknown case result");
    const id = item.viewport + ":" + item.case;
    if (seen.has(id)) invalid("duplicated case result");
    seen.add(id);
    item.result === "passed" ? passed++ : failed++;
  }
  const missing = expected - seen.size;
  const allBrowserJourneysPassed =
    failed === 0 && missing === 0 && passed === expected && report.blocked_write_attempts === 0;
  return Object.freeze({
    environment: report.target,
    attempted: seen.size,
    expected,
    passed,
    failed,
    missing,
    blockedExternal: report.blocked_external_requests,
    blockedWrites: report.blocked_write_attempts,
    allBrowserJourneysPassed,
    productionVerified: false,
    approvedForLivePayments: false,
    deploymentRevisionKnown: false,
    nextAction: allBrowserJourneysPassed
      ? "Review the deployed build revision and obtain independent release acceptance."
      : "Investigate failing, missing or unsafe journeys before accepting the hosted frontend.",
  });
}
