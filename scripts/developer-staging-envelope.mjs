/**
 * Strict envelope for a single hosted browser acceptance attempt.
 * Run identifiers are correlation metadata, NOT cryptographic attestation.
 */
const NOTE = "Only case names/outcomes recorded; project source, URLs, tokens and downloaded artifacts excluded.";
const FIELDS = [
  "schema","environment","production_verified","staging_executed","browser",
  "target_host","network_scope","release_observations","deep_link_observations",
  "header_observations","runtime_errors","asset_failures","network_audit",
  "api_requests_executed","started_at","finished_at","commit","cases","note",
  "run_id","run_attempt",
].sort().join(",");
const RUN_ID = /^[1-9][0-9]{0,19}$/;
const ATTEMPT = /^[1-9][0-9]{0,5}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
function fail(message) { throw new Error("Developer staging gate: " + message); }
function validTime(value) {
  if (typeof value !== "string" || !UTC.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().replace(".000Z","Z") === value ? time : null;
}
export function verifyDeveloperStagingEnvelope(report, expectedRun, currentTime = Date.now()) {
  if (!report || typeof report !== "object" || Array.isArray(report) ||
      Object.keys(report).sort().join(",") !== FIELDS || report.note !== NOTE) {
    fail("unexpected, incomplete or unsafe staging report envelope.");
  }
  if (!expectedRun || typeof expectedRun.runId !== "string" || !RUN_ID.test(expectedRun.runId) ||
      typeof expectedRun.runAttempt !== "string" || !ATTEMPT.test(expectedRun.runAttempt) ||
      report.run_id !== expectedRun.runId || report.run_attempt !== expectedRun.runAttempt) {
    fail("report must match the current GitHub Actions run ID and attempt.");
  }
  const start = validTime(report.started_at);
  const finish = validTime(report.finished_at);
  if (!Number.isFinite(currentTime) || start === null || finish === null ||
      finish < start || finish - start > 15 * 60_000 ||
      finish > currentTime + 60_000 || currentTime - finish > 60 * 60_000) {
    fail("invalid, stale or excessively long browser observation window.");
  }
  return {
    run_id: report.run_id, run_attempt: report.run_attempt,
    started_at: report.started_at, finished_at: report.finished_at,
    elapsed_seconds: (finish - start) / 1000,
    scope: "Correlated to the current workflow attempt; unsigned browser observations.",
  };
}
