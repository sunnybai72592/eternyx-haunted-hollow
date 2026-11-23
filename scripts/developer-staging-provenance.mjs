/**
 * Fail-closed verification of PUBLIC observed hosted build markers.
 * This is not a signature, deployment attestation or production certification.
 */
export const DEVELOPER_RELEASE_PHASES = Object.freeze(["before", "after"]);
export const DEVELOPER_RELEASE_VIEWPORTS = Object.freeze(["390x844", "1440x900"]);
const HEX32 = /^[a-f0-9]{32}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const KEYS = "build_id,client_matches,html_matches,matches_checkout,phase,source_sha,status,viewport";

export function verifyHostedDeveloperReleaseObservations(observations, sourceSha) {
  if (!HEX40.test(sourceSha || "")) throw new Error("Hosted release: expected source SHA must be a complete Git commit.");
  if (!Array.isArray(observations) || observations.length !== 4) {
    throw new Error("Hosted release: both before and after observations at two viewports are mandatory.");
  }
  const expected = new Set(DEVELOPER_RELEASE_VIEWPORTS.flatMap(
    viewport => DEVELOPER_RELEASE_PHASES.map(phase => viewport + "/" + phase)));
  const found = new Set();
  let buildId = null;
  for (const entry of observations) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== KEYS ||
        entry.status !== "source-matched" ||
        !HEX32.test(entry.build_id || "") || entry.source_sha !== sourceSha ||
        entry.html_matches !== true || entry.client_matches !== true ||
        entry.matches_checkout !== true) {
      throw new Error("Hosted release: unmatched, unsafe or missing HTML/JS/manifest/source fingerprint.");
    }
    const key = entry.viewport + "/" + entry.phase;
    if (!expected.has(key) || found.has(key)) {
      throw new Error("Hosted release: duplicate or unexpected release observation.");
    }
    found.add(key);
    if (buildId !== null && buildId !== entry.build_id) {
      throw new Error("Hosted release: the build changed during acceptance.");
    }
    buildId = entry.build_id;
  }
  if (found.size !== expected.size) throw new Error("Hosted release: incomplete release proof.");
  return { build_id: buildId, observed_source_sha: sourceSha, observations: found.size,
    scope: "Self-reported manifest matched HTML and client JS markers during the browser run, not an independent signed deployment attestation." };
}

export const DEVELOPER_RUNTIME_CLASSES = Object.freeze([
  "module-load-error", "javascript-reference-error", "javascript-type-error",
  "missing-frontend-config", "other-js-error",
]);

export function verifyHostedDeveloperRuntimeSafety(report) {
  if (!report || typeof report !== "object") throw new Error("Developer staging runtime: missing report.");
  const audit = report.network_audit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit) ||
      Object.keys(audit).sort().join(",") !== "blocked_external_requests,blocked_write_attempts" ||
      !Number.isSafeInteger(audit.blocked_external_requests) || audit.blocked_external_requests < 0 ||
      audit.blocked_external_requests > 100_000 ||
      audit.blocked_write_attempts !== 0) {
    throw new Error("Developer staging runtime: unexpected network writes or invalid network evidence.");
  }
  if (!Array.isArray(report.runtime_errors) || report.runtime_errors.length > 16 ||
      !report.runtime_errors.every(x => typeof x === "string" && DEVELOPER_RUNTIME_CLASSES.includes(x)) ||
      report.runtime_errors.length > 0) {
    throw new Error("Developer staging runtime: browser JavaScript exceptions were observed.");
  }
  if (!Array.isArray(report.asset_failures) || report.asset_failures.length > 16 ||
      !report.asset_failures.every(x=>x && typeof x === "object" &&
        Object.keys(x).sort().join(",") === "resource_type,status" &&
        ["script", "document"].includes(x.resource_type) &&
        Number.isSafeInteger(x.status) && x.status >= 400 && x.status <= 599) ||
      report.asset_failures.length > 0) {
    throw new Error("Developer staging runtime: failed script or document loads.");
  }
  return { blocked_external_requests: audit.blocked_external_requests, blocked_write_attempts: 0,
    runtime_exceptions: 0, failed_first_party_assets: 0 };
}
