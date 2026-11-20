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
  // Optional diagnostics contain ONLY bounded, sanitized classifications;
  // never accept full redirect URLs, query strings, response bodies or IDs.
  const allowedReasons = new Set(["unexpected-redirect", "missing-expected-ui", "browser-action-failure"]);
  const allowedJsErrors = new Set(["none", "missing-supabase-config", "module-load-error",
    "module-resolution-error", "javascript-reference-error", "javascript-type-error", "other-js-error"]);
  const allowedHeadingClasses = new Set(["none", "other", "explore", "sign-in", "not-found", "registry"]);
  const pathPattern = /^\/(?:[a-zA-Z0-9_-]{1,32}(?:\/\[redacted\])?)?$/;
  function validateSafePath(value) {
    return value === "[different-host]" || value === "[external]" ||
      (typeof value === "string" && pathPattern.test(value));
  }
  const telemetry = report.blocked_telemetry_attempts ?? 0;
  if (!Number.isSafeInteger(telemetry) || telemetry < 0) invalid("invalid known telemetry count");
  const jsCategories = report.javascript_error_categories ?? [];
  if (!Array.isArray(jsCategories) || jsCategories.length > 16 ||
      !jsCategories.every(item => allowedJsErrors.has(item) && item !== "none")) {
    invalid("unsafe JS exception diagnostic");
  }
  const assetFailures = report.asset_http_failures ?? [];
  if (!Array.isArray(assetFailures) || assetFailures.length > 16 ||
      !assetFailures.every(item => item &&
        ["script", "document"].includes(item.resource_type) &&
        Number.isSafeInteger(item.http_status) && item.http_status >= 400 && item.http_status <= 599)) {
    invalid("unsafe asset HTTP diagnostic");
  }
  const pageObservations = report.page_observations ?? [];
  const blockedSamples = report.blocked_samples ?? [];
  if (!Array.isArray(pageObservations) || pageObservations.length > 16 ||
      !Array.isArray(blockedSamples) || blockedSamples.length > 16) {
    invalid("too many or invalid diagnostics");
  }
  for (const item of pageObservations) {
    if (!item || !REMOTE_CASES.includes(item.case) || !REMOTE_VIEWPORTS.includes(item.viewport) ||
        !allowedReasons.has(item.reason) || typeof item.on_approved_host !== "boolean" ||
        !validateSafePath(item.path) || typeof item.root_present !== "boolean" ||
        !allowedHeadingClasses.has(item.heading_class) ||
        (item.http_status !== null &&
         (!Number.isSafeInteger(item.http_status) || item.http_status < 100 || item.http_status > 599)) ||
        (item.root_has_children !== undefined && typeof item.root_has_children !== "boolean") ||
        (item.last_js_error_category !== undefined && !allowedJsErrors.has(item.last_js_error_category)) ||
        (item.script_http_failures !== undefined &&
         (!Number.isSafeInteger(item.script_http_failures) || item.script_http_failures < 0 ||
          item.script_http_failures > 16))) {
      invalid("unsafe page observation");
    }
  }
  for (const item of blockedSamples) {
    if (!item || !["cross-origin", "write-blocked", "telemetry-blocked"].includes(item.reason) ||
        !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "other"].includes(item.method) ||
        !validateSafePath(item.path) ||
        !["document", "stylesheet", "script", "image", "font", "xhr", "fetch", "other"].includes(item.resource_type)) {
      invalid("unsafe blocked-request sample");
    }
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
    blockedKnownTelemetry: telemetry,
    jsErrorCategories: Object.freeze([...jsCategories]),
    assetHttpFailures: Object.freeze(assetFailures.map(item => Object.freeze({ ...item }))),
    pageObservations: Object.freeze(pageObservations.map(item => Object.freeze({ ...item }))),
    blockedSamples: Object.freeze(blockedSamples.map(item => Object.freeze({ ...item }))),
    allBrowserJourneysPassed,
    productionVerified: false,
    approvedForLivePayments: false,
    deploymentRevisionKnown: false,
    nextAction: allBrowserJourneysPassed
      ? "Review the deployed build revision and obtain independent release acceptance."
      : "Investigate failing, missing or unsafe journeys before accepting the hosted frontend.",
  });
}
