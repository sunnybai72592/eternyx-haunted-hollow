/**
 * ETERNYX session-bound ingress authorization contract.
 * Shared across Edge functions, local host proxy and Node regression tests.
 * Access tokens are opaque 256-bit random values, not signed JWTs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^rx_[0-9a-f]{64}$/;
const HASH = /^[0-9a-f]{64}$/;

export function parseAccessRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 2 ||
      input.action !== "issue" || typeof input.sessionId !== "string" ||
      !UUID.test(input.sessionId)) return null;
  if (!Object.keys(input).every((key) => key === "action" || key === "sessionId")) return null;
  return { action: "issue", sessionId: input.sessionId };
}

export function parseProxyVerification(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 3 || input.action !== "check" ||
      typeof input.sessionId !== "string" || !UUID.test(input.sessionId) ||
      typeof input.accessToken !== "string" || !TOKEN.test(input.accessToken) ||
      !Object.keys(input).every((key) => ["action", "sessionId", "accessToken"].includes(key))) {
    return null;
  }
  return { action: "check", sessionId: input.sessionId, accessToken: input.accessToken };
}

export function validAccessToken(token) {
  return typeof token === "string" && TOKEN.test(token);
}
export function validUserJwt(value) {
  return typeof value === "string" && value.length >= 64 && value.length <= 8192 &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
export function validTokenHash(hash) {
  return typeof hash === "string" && HASH.test(hash);
}

export function generateAccessToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "rx_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashAccessToken(token) {
  if (!validAccessToken(token)) throw new Error("Invalid cyber range access token");
  const bytes = new TextEncoder().encode(token);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function authorizedAccessExpiry(expiresAt, now = new Date()) {
  if (typeof expiresAt !== "string") return false;
  const expiry = Date.parse(expiresAt);
  const current = now instanceof Date ? now.getTime() : NaN;
  return Number.isFinite(expiry) && Number.isFinite(current)
    && expiry > current && expiry <= current + 60000;
}
