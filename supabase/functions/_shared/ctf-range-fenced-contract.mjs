/**
 * Strict provider fencing protocol. The trusted Edge handler injects the owner
 * from a server-side env var, never from client-supplied JSON.
 * UUID lease generations are secrets for this trusted service boundary.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER = /^[a-z][a-z0-9-]{2,39}$/;
export const acceptedWorkerOwner = (v) => typeof v === "string" && OWNER.test(v);
export const acceptedFence = (v) => typeof v === "string" && UUID.test(v);
export const acceptedSessionId = (v) => typeof v === "string" && UUID.test(v);
export const permittedStates = Object.freeze(["running", "stopped", "expired", "failed"]);

export function parseFencedWorkerRequest(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (v.action === "acquire") {
    if (keys.length === 1) return { action: "acquire" };
    if (keys.length === 2 && acceptedFence(v.leaseId) &&
        keys.every(k => k === "action" || k === "leaseId"))
      return { action: "acquire", leaseId: v.leaseId };
  }
  if (["claim", "reconcile", "release"].includes(v.action) &&
      keys.length === 2 && acceptedFence(v.leaseId) &&
      keys.every(k => k === "action" || k === "leaseId"))
    return { action: v.action, leaseId: v.leaseId };
  if (v.action === "report" &&
      acceptedFence(v.leaseId) && acceptedSessionId(v.sessionId) &&
      permittedStates.includes(v.state) &&
      keys.every(k => ["action", "leaseId", "sessionId", "state", "instanceRef"].includes(k))) {
    const project = "cr-" + v.sessionId.replace(/-/g, "").toLowerCase();
    if (v.state === "running" && keys.length === 5 && v.instanceRef === project)
      return { action: "report", leaseId: v.leaseId, sessionId: v.sessionId,
        state: v.state, instanceRef: v.instanceRef };
    if (v.state !== "running" && keys.length === 4)
      return { action: "report", leaseId: v.leaseId, sessionId: v.sessionId,
        state: v.state };
  }
  return null;
}

export function trustedWorkerResult(result, action) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  if (result.ok !== true) return false;
  if (action === "acquire") return acceptedFence(result.fence_id) &&
    typeof result.expires_at === "string" && Number.isFinite(Date.parse(result.expires_at));
  if (action === "claim") return acceptedSessionId(result.session_id) &&
    result.challenge_pack === "http-basics-v1" &&
    typeof result.expires_at === "string";
  if (action === "reconcile") return Array.isArray(result.sessions) &&
    result.sessions.length <= 12;
  return false;
}
