/**
 * Pure, testable contract for the authenticated range control-plane.
 * This module NEVER provisions instances or handles production credentials.
 */
export const RANGE_PACK = "http-basics-v1";
export const RANGE_ACTIVE_STATES = Object.freeze(["queued", "provisioning", "running", "stopping"]);

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRangeRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false };
  }
  const action = input.action;
  const keys = Object.keys(input);
  if (action === "status" || action === "sessions") {
    return keys.length === 1 ? { ok: true, action } : { ok: false };
  }
  if (action === "request") {
    return keys.length === 2 && input.pack === RANGE_PACK && keys.every((key) => key === "action" || key === "pack")
      ? { ok: true, action, pack: RANGE_PACK } : { ok: false };
  }
  if (action === "stop") {
    return keys.length === 2 && typeof input.sessionId === "string" && ID_PATTERN.test(input.sessionId) &&
      keys.every((key) => key === "action" || key === "sessionId")
      ? { ok: true, action, sessionId: input.sessionId } : { ok: false };
  }
  return { ok: false };
}

export function providerIsOnline(provider, now = new Date()) {
  if (!provider || provider.enabled !== true || provider.ingress_approved !== true ||
      !Number.isInteger(provider.max_active_sessions) ||
      provider.max_active_sessions < 1 || provider.max_active_sessions > 3) {
    return false;
  }
  const heartbeat = typeof provider.last_heartbeat_at === "string"
    ? Date.parse(provider.last_heartbeat_at) : NaN;
  const current = now instanceof Date ? now.getTime() : NaN;
  return Number.isFinite(heartbeat) && Number.isFinite(current) &&
    current - heartbeat >= -5000 && current - heartbeat < 60000;
}

const SESSION_FIELDS = [
  "id", "challenge_pack", "status", "requested_at", "updated_at",
  "expires_at", "started_at", "finished_at",
];

export function publicRangeSession(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Invalid session record");
  }
  // Never emit user_id, provider_instance_ref, internal endpoints, tokens or worker identifiers.
  return Object.fromEntries(SESSION_FIELDS.map((key) => [key, record[key] ?? null]));
}
