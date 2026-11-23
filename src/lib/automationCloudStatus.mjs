/** Safe, side-effect-free interpretation of Automation control requests.
 * HTTP status distinguishes a missing Edge deployment from auth or workflow errors.
 * Never include response bodies, URLs, JWTs, or arbitrary server details in UI text.
 */
export function automationControlFailure(action, status) {
  if (status === 401) return {
    kind: "sign_in_required", message: "Your Automation session was rejected. Sign in again, then retry.",
    retryable: false,
  };
  if (status === 403) return {
    kind: "permission_denied", message: "This account cannot perform that Automation action.",
    retryable: false,
  };
  if (status === 404 && action === "list") return {
    kind: "backend_missing",
    message: "The Automation control API is not available in this deployment. Your local workflow runner still works.",
    retryable: true,
  };
  if (status === 404) return {
    kind: "resource_unavailable", message: "The saved workflow or requested Automation record is unavailable.",
    retryable: false,
  };
  if (status === 409) return {
    kind: "conflict", message: "Automation data changed or the request conflicts with current state. Reload and review it.",
    retryable: false,
  };
  if (status === 429) return {
    kind: "limit", message: "The Automation request limit has been reached. Try again later.",
    retryable: false,
  };
  if (status === 502 || status === 503 || status === 504) return {
    kind: "backend_unavailable",
    message: "The Automation backend cannot complete requests right now. Check deployment and database connectivity; local workflows still work.",
    retryable: true,
  };
  if (status === null || status === undefined || status === 0) return {
    kind: "network_unavailable",
    message: "The Automation server could not be reached. Check your connection or deployment. The local runner still works.",
    retryable: true,
  };
  return {
    kind: "request_error",
    message: "The Automation server rejected this request. Review the saved workflow and try again.",
    retryable: false,
  };
}

export function shouldInvalidateAutomationCloud(kind) {
  return ["backend_missing", "backend_unavailable", "network_unavailable",
    "sign_in_required"].includes(kind);
}

const RUN_FIELDS = new Set([
  "id","workflow_id","workflow_revision","status","trigger_type",
  "webhook_trigger_id","schedule_id","input_lines","output_lines",
  "input_characters","output_characters","trace","created_at",
]);
const RAW_FIELDS = new Set(["input", "output", "raw_input", "raw_output",
  "input_ciphertext", "output_ciphertext", "secret", "token"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeCount = x => Number.isSafeInteger(x) && x >= 0;
export function verifyAutomationRunHistory(raw) {
  if (!Array.isArray(raw) || raw.length > 20) throw Error("Invalid authenticated run history.");
  const ids = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.id !== "string" || !UUID.test(entry.id) || ids.has(entry.id.toLowerCase()) ||
        !(entry.workflow_id === null || typeof entry.workflow_id === "string" && UUID.test(entry.workflow_id)) ||
        !Number.isSafeInteger(entry.workflow_revision) || entry.workflow_revision < 1 ||
        entry.status !== "completed" ||
        !["manual", "webhook", "scheduled"].includes(entry.trigger_type) ||
        typeof entry.created_at !== "string" || !Number.isFinite(Date.parse(entry.created_at)) ||
        !["input_lines","output_lines","input_characters","output_characters"].every(k => safeCount(entry[k])) ||
        Object.keys(entry).some(k => !RUN_FIELDS.has(k) || RAW_FIELDS.has(k)) ||
        !Array.isArray(entry.trace) || entry.trace.length > 12 ||
        entry.trace.some(t => !t || typeof t !== "object" || Array.isArray(t) ||
          Object.keys(t).some(k => RAW_FIELDS.has(k)))) {
      throw Error("Unverified or unsafe authenticated run-history record.");
    }
    ids.add(entry.id.toLowerCase());
  }
  return raw;
}
