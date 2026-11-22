/** ETERNYX Automation encrypted scheduled text.
 * The 32-byte AES key must be configured ONLY as a server-side secret.
 * Browser code must never import or handle this key.
 */
export const SCHEDULE_INPUT_BYTES = 2000;
export const SCHEDULE_OUTPUT_BYTES = 8000;

export class ScheduleCipherError extends Error {
  constructor(code) { super(code); this.name = "ScheduleCipherError"; this.code = code; }
}
function toHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
function fromHex(value, minBytes, maxBytes) {
  if (typeof value !== "string" || value.length % 2 !== 0 ||
      value.length < minBytes * 2 || value.length > maxBytes * 2 ||
      !/^[a-f0-9]+$/i.test(value)) throw new ScheduleCipherError("invalid_ciphertext");
  return new Uint8Array(value.match(/../g).map((part) => parseInt(part, 16)));
}
async function importMaster(masterHex) {
  if (typeof masterHex !== "string" || !/^[a-f0-9]{64}$/i.test(masterHex)) {
    throw new ScheduleCipherError("key_not_configured");
  }
  return crypto.subtle.importKey("raw", fromHex(masterHex, 32, 32), { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
export async function encryptScheduledText(masterHex, plainText, limit) {
  if (typeof plainText !== "string" || !Number.isInteger(limit) ||
      limit < 1 || limit > SCHEDULE_OUTPUT_BYTES) throw new ScheduleCipherError("invalid_text");
  const bytes = new TextEncoder().encode(plainText);
  if (bytes.length > limit) throw new ScheduleCipherError("text_too_large");
  const key = await importMaster(masterHex);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, bytes);
  return { ciphertext: toHex(new Uint8Array(encrypted)), nonce: toHex(nonce) };
}
export async function decryptScheduledText(masterHex, ciphertext, nonce, limit) {
  try {
    if (!Number.isInteger(limit) || limit < 1 || limit > SCHEDULE_OUTPUT_BYTES) {
      throw new ScheduleCipherError("invalid_text");
    }
    const key = await importMaster(masterHex);
    const encrypted = fromHex(ciphertext, 16, limit + 16);
    const iv = fromHex(nonce, 12, 12);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    if (plaintext.byteLength > limit) throw new Error("size");
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new ScheduleCipherError("decrypt_failed");
  }
}
export function validSchedulerWorkerKey(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" ||
      !/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(provided)) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) {
    difference |= provided.toLowerCase().charCodeAt(i) ^ expected.toLowerCase().charCodeAt(i);
  }
  return difference === 0;
}
export async function scheduledRunFingerprint(userId, scheduleId, workflowId, revision, input) {
  const message = new TextEncoder().encode(JSON.stringify([
    userId, scheduleId, workflowId, revision, input,
  ]));
  const digest = await crypto.subtle.digest("SHA-256", message);
  return toHex(new Uint8Array(digest));
}
