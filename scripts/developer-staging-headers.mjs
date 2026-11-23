/**
 * Evaluate observed public HTTPS response headers from real browser navigation.
 * Only allowlisted boolean results and HTTP status are accepted, not raw headers.
 * This evaluates the tested staging origin, not the complete ETERNYX ecosystem.
 */
export const DEVELOPER_HEADERS_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);
export const DEVELOPER_HEADERS_PHASES = Object.freeze(["before", "after"]);
export const DEVELOPER_HEADER_CONTROLS = Object.freeze([
  "content_security_policy", "csp_no_unsafe_eval", "frame_protection",
  "hsts_one_year", "html_content_type", "nosniff", "referrer_restricted",
]);
const OBSERVATION_KEYS = [...DEVELOPER_HEADER_CONTROLS,"http_status","phase","viewport"].sort().join(",");

export function verifyDeveloperHostedHeaders(observations) {
  if (!Array.isArray(observations) || observations.length !== 4) {
    throw new Error("Developer HTTPS headers: missing browser observations for two viewports before and after.");
  }
  const expected = new Set(DEVELOPER_HEADERS_VIEWPORTS.flatMap(
    viewport => DEVELOPER_HEADERS_PHASES.map(phase => viewport + "/" + phase)));
  const seen = new Set();
  for (const observation of observations) {
    if (!observation || typeof observation !== "object" || Array.isArray(observation) ||
        Object.keys(observation).sort().join(",") !== OBSERVATION_KEYS) {
      throw new Error("Developer HTTPS headers: unexpected or unsafe evidence fields.");
    }
    const key = observation.viewport + "/" + observation.phase;
    if (!expected.has(key) || seen.has(key)) {
      throw new Error("Developer HTTPS headers: duplicate or unsupported browser observation.");
    }
    seen.add(key);
    if (observation.http_status !== 200) {
      throw new Error("Developer HTTPS headers: staging document HTTP status is not 200 at " + key + ".");
    }
    for (const control of DEVELOPER_HEADER_CONTROLS) {
      if (observation[control] !== true) {
        throw new Error("Developer HTTPS headers: " + control + " is missing or inadequate at " + key + ".");
      }
    }
  }
  if (seen.size !== expected.size) {
    throw new Error("Developer HTTPS headers: incomplete observations.");
  }
  return Object.freeze({
    status: "passed",
    evaluated_responses: seen.size,
    required_controls: Object.freeze([...DEVELOPER_HEADER_CONTROLS]),
    scope: "Observed HTTPS response headers on the public staging root only, not all services or API endpoints.",
  });
}

/**
 * A successful staging browser run is never a production launch approval.
 * Missing authenticated/backend/provider tests are explicit release blockers.
 */
export function summarizeDeveloperReleaseDecision(browser, hosted, runtime, headers) {
  if (!browser || browser.developer_case_count !== 14 ||
      !hosted || hosted.observations !== 4 || !runtime ||
      runtime.blocked_write_attempts !== 0 || runtime.runtime_exceptions !== 0 ||
      runtime.failed_first_party_assets !== 0 || !headers ||
      headers.status !== "passed" || headers.evaluated_responses !== 4) {
    throw new Error("Developer release review: missing verified staging evidence.");
  }
  return Object.freeze({
    staging_public_ui: "passed",
    staging_release_identity: "source-matched-self-reported",
    staging_https_posture: "passed-for-observed-root",
    protected_backend: "not-tested",
    authenticated_roles_and_rls: "not-tested",
    production_deployment_and_provider_integrations: "not-tested",
    decision: "HOLD_PRODUCTION",
    rationale: "Staging public UI and release markers are necessary but insufficient for production approval.",
  });
}
