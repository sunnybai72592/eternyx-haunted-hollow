/** Only evaluates anonymous frontend navigation, never proves backend RLS. */
export const ANONYMOUS_AUTH_CASES = Object.freeze([
  "auth-entry", "account", "notifications", "profile", "settings",
  "ai-image", "ai-video", "pentest-workbench", "private-bug-history",
]);
export const AUTH_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);
export const AUTH_ALLOWED_HOSTS = Object.freeze({
  "lovable-preview": "id-preview--4e3226d5-080f-4830-8446-9d86452bdf76.lovable.app",
  "public-domain-candidate": "eternyx-haunted-hollow.lovable.app",
});
const requireValid = (ok, what) => {
  if (!ok) throw new Error("Invalid anonymous route audit: " + what);
};
export function evaluateAnonymousRouteAudit(report) {
  requireValid(report && typeof report === "object" && !Array.isArray(report), "report");
  requireValid(report.schema === 1, "schema");
  requireValid(Object.prototype.hasOwnProperty.call(AUTH_ALLOWED_HOSTS, report.target), "target");
  requireValid(report.hostname === AUTH_ALLOWED_HOSTS[report.target], "host");
  requireValid(report.environment === "hosted ETERNYX anonymous frontend route guards", "environment");
  requireValid(report.network_policy === "GET/HEAD to one exact approved HTTPS host", "network policy");
  requireValid(report.production_verified === false &&
    report.server_rls_verified === false &&
    report.authenticated_user_flow_verified === false &&
    report.credentials_used === false, "prohibited verification claim");
  for (const key of ["blocked_writes", "blocked_external", "blocked_telemetry"]) {
    requireValid(Number.isSafeInteger(report[key]) && report[key] >= 0, key);
  }
  const expected = ANONYMOUS_AUTH_CASES.length * AUTH_VIEWPORTS.length;
  requireValid(report.expected === expected && Array.isArray(report.cases), "expected case count");
  requireValid(report.cases.length <= expected, "excess cases");
  const seen = new Set();
  let passed = 0;
  for (const row of report.cases) {
    requireValid(row && ANONYMOUS_AUTH_CASES.includes(row.case) &&
      AUTH_VIEWPORTS.includes(row.viewport) &&
      ["passed", "failed"].includes(row.result), "case");
    const key = row.viewport + ":" + row.case;
    requireValid(!seen.has(key), "duplicate case");
    seen.add(key);
    if (row.result === "passed") passed++;
  }
  const missing = expected - seen.size;
  const failed = seen.size - passed;
  const frontEndAnonymousGuardPassed = passed === expected && missing === 0 &&
    failed === 0 && report.blocked_writes === 0;
  return Object.freeze({
    target: report.target,
    expected,
    passed,
    failed,
    missing,
    blockedWrites: report.blocked_writes,
    blockedTelemetry: report.blocked_telemetry,
    blockedExternal: report.blocked_external,
    frontEndAnonymousGuardPassed,
    productionVerified: false,
    serverRlsVerified: false,
    authenticatedUserFlowVerified: false,
  });
}
