/**
 * Trusted cyber-range provider protocol. This is NOT a browser API.
 * No caller can specify a Docker image, host, port, command or customer identity.
 */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refPattern = /^cr-[0-9a-f]{32}$/;
export const WORKER_REPORT_STATES = Object.freeze(["running", "stopped", "failed", "expired"]);
export const WORKER_SESSION_STATES = Object.freeze(["queued", "provisioning", "running", "stopping"]);

export function validSessionId(id) {
  return typeof id === "string" && uuidPattern.test(id);
}

export function projectForSession(id) {
  if (!validSessionId(id)) throw new Error("Invalid range session ID");
  return "cr-" + id.replace(/-/g, "").toLowerCase();
}

export function validateWorkerRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (["heartbeat", "claim", "reconcile"].includes(raw.action)) {
    return keys.length === 1 ? { action: raw.action } : null;
  }
  if (raw.action === "report" &&
      validSessionId(raw.sessionId) &&
      WORKER_REPORT_STATES.includes(raw.state) &&
      keys.every((key) => ["action", "sessionId", "state", "instanceRef"].includes(key))) {
    if (raw.state === "running") {
      if (keys.length !== 4 || raw.instanceRef !== projectForSession(raw.sessionId)) return null;
      return { action: raw.action, sessionId: raw.sessionId, state: raw.state, instanceRef: raw.instanceRef };
    }
    if (keys.length !== 3) return null;
    return { action: raw.action, sessionId: raw.sessionId, state: raw.state };
  }
  return null;
}

export function safeWorkerSession(input) {
  if (!input || typeof input !== "object" || !validSessionId(input.id) ||
      !WORKER_SESSION_STATES.includes(input.status) ||
      typeof input.expires_at !== "string" || !Number.isFinite(Date.parse(input.expires_at))) {
    throw new Error("Malformed provider session");
  }
  const providerRef = input.provider_instance_ref;
  if (providerRef != null && providerRef !== projectForSession(input.id)) {
    throw new Error("Unrecognized provider instance reference");
  }
  return {
    id: input.id, status: input.status,
    expiresAt: input.expires_at, instanceRef: providerRef ?? null,
  };
}

export async function verifyWorkerToken(received, configured) {
  if (typeof received !== "string" || typeof configured !== "string" ||
      received.length < 48 || configured.length < 48 ||
      received.length > 512 || configured.length > 512) return false;
  const encoder = new TextEncoder();
  // Constant-sized digests avoid raw token byte-length and early mismatch leaks.
  const lhs = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(received)));
  const rhs = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(configured)));
  let mismatch = 0;
  for (let i = 0; i < lhs.length; i++) mismatch |= lhs[i] ^ rhs[i];
  return mismatch === 0;
}
