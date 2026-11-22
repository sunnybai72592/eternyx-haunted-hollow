/**
 * Webhook signing and at-rest credential encryption. No credentials are sent in
 * trigger requests: only timestamp, request UUID and HMAC signature.
 * Token is generated once, shown once; AES key stays in Edge Function secrets.
 */
export class AutomationWebhookError extends Error {
  constructor(code) { super(code); this.name = "AutomationWebhookError"; this.code = code; }
}
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const decoder = new TextDecoder();
function fromHex(s, length) {
  if (typeof s !== "string" || s.length !== length * 2 || !/^[0-9a-f]+$/i.test(s)) {
    throw new AutomationWebhookError("invalid_hex");
  }
  return new Uint8Array(s.match(/../g).map((part) => parseInt(part, 16)));
}
async function encryptionKey(masterHex) {
  // 32 random bytes; do not derive this from a human password.
  const bytes = fromHex(masterHex, 32);
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
export async function issueWebhookCredential(masterHex) {
  const key = await encryptionKey(masterHex);
  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, secretBytes);
  return { secret: toHex(secretBytes), credential_iv: toHex(nonce),
    credential_ciphertext: toHex(new Uint8Array(cipher)) };
}
export async function openWebhookCredential(masterHex, ivHex, cipherHex) {
  try {
    const key = await encryptionKey(masterHex);
    const value = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromHex(ivHex, 12) }, key, fromHex(cipherHex, 48),
    );
    const bytes = new Uint8Array(value);
    if (bytes.length !== 32) throw new Error("wrong key size");
    return bytes;
  } catch { throw new AutomationWebhookError("credential_unavailable"); }
}
export async function signWebhookRequest(secretHex, timestamp, requestId, rawBody) {
  const secret = fromHex(secretHex, 32);
  return signBytes(secret, timestamp, requestId, rawBody);
}
async function signBytes(secretBytes, timestamp, requestId, rawBody) {
  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(timestamp + "\n" + requestId + "\n" + rawBody);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, message)));
}
export async function verifyWebhookRequest(secretBytes, timestamp, requestId, rawBody, signature) {
  if (!(secretBytes instanceof Uint8Array) || secretBytes.length !== 32 ||
      typeof signature !== "string" || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const expected = await signBytes(secretBytes, timestamp, requestId, rawBody);
  const actual = signature.slice(7);
  // Fixed-length, constant-time comparison; no early return on mismatched bytes.
  let mismatch = 0;
  for (let index = 0; index < 64; index++) mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return mismatch === 0;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateWebhookEnvelope(raw, timestamp, requestId, nowSeconds = Date.now() / 1000) {
  if (typeof raw !== "string" || raw.length > 14000 ||
      typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) ||
      typeof requestId !== "string" || !UUID_RE.test(requestId) ||
      Math.abs(nowSeconds - Number(timestamp)) > 300) {
    return { ok: false, reason: "invalid_envelope" };
  }
  let body;
  try { body = JSON.parse(raw); } catch { return { ok: false, reason: "invalid_json" }; }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some((key) => !["triggerId", "input"].includes(key)) ||
      typeof body.triggerId !== "string" || !UUID_RE.test(body.triggerId) ||
      typeof body.input !== "string" || body.input.length > 12000) {
    return { ok: false, reason: "invalid_body" };
  }
  return { ok: true, triggerId: body.triggerId, input: body.input };
}
