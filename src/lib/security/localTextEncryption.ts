/**
 * Real, local-only AES-256-GCM text encryption.
 * Classical cryptography, NOT post-quantum encryption.
 * The plaintext/password never leave the browser through this module.
 */
export const LOCAL_ENCRYPTION_FORMAT = "eternyx-aes-gcm-v1";
export const LOCAL_ENCRYPTION_ITERATIONS = 210000;
export const MAX_LOCAL_PLAINTEXT_LENGTH = 20000;
export const MAX_LOCAL_ENVELOPE_LENGTH = 130000;

export class LocalEncryptionError extends Error {
  readonly code: "unsupported" | "invalid_password" | "invalid_text" | "invalid_envelope" | "authentication_failed";
  constructor(code: LocalEncryptionError["code"]) {
    super(code);
    this.name = "LocalEncryptionError";
    this.code = code;
  }
}

function browserCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new LocalEncryptionError("unsupported");
  }
  return globalThis.crypto;
}
function validatePassword(password: string): void {
  if (typeof password !== "string" || !password.trim() || password.length < 12 || password.length > 256) {
    throw new LocalEncryptionError("invalid_password");
  }
}
function toBase64(value: Uint8Array): string {
  let encoded = "";
  for (const byte of value) encoded += String.fromCharCode(byte);
  return btoa(encoded);
}
function fromBase64(value: unknown, minLength: number, maxLength: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !value || value.length > Math.ceil(maxLength / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new LocalEncryptionError("invalid_envelope");
  }
  let bytes: string;
  try { bytes = atob(value); }
  catch { throw new LocalEncryptionError("invalid_envelope"); }
  if (bytes.length < minLength || bytes.length > maxLength) throw new LocalEncryptionError("invalid_envelope");
  return Uint8Array.from(bytes, char => char.charCodeAt(0));
}
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const provider = browserCrypto();
  const material = await provider.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"],
  );
  return provider.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: LOCAL_ENCRYPTION_ITERATIONS, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function encryptLocalText(plaintext: string, password: string): Promise<string> {
  validatePassword(password);
  if (typeof plaintext !== "string" || !plaintext || plaintext.length > MAX_LOCAL_PLAINTEXT_LENGTH) {
    throw new LocalEncryptionError("invalid_text");
  }
  const provider = browserCrypto();
  const salt = provider.getRandomValues(new Uint8Array(16));
  const iv = provider.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const payload = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(await provider.subtle.encrypt({ name: "AES-GCM", iv }, key, payload));
  return JSON.stringify({
    format: LOCAL_ENCRYPTION_FORMAT,
    iterations: LOCAL_ENCRYPTION_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  });
}

export async function decryptLocalText(envelope: string, password: string): Promise<string> {
  validatePassword(password);
  if (typeof envelope !== "string" || !envelope || envelope.length > MAX_LOCAL_ENVELOPE_LENGTH) {
    throw new LocalEncryptionError("invalid_envelope");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(envelope); }
  catch { throw new LocalEncryptionError("invalid_envelope"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LocalEncryptionError("invalid_envelope");
  }
  const data = parsed as Record<string, unknown>;
  if (data.format !== LOCAL_ENCRYPTION_FORMAT || data.iterations !== LOCAL_ENCRYPTION_ITERATIONS) {
    throw new LocalEncryptionError("invalid_envelope");
  }
  const salt = fromBase64(data.salt, 16, 16);
  const iv = fromBase64(data.iv, 12, 12);
  const ciphertext = fromBase64(data.ciphertext, 17, MAX_LOCAL_PLAINTEXT_LENGTH * 4 + 16);
  const provider = browserCrypto();
  try {
    const key = await deriveKey(password, salt);
    const plaintext = await provider.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    if (decoded.length > MAX_LOCAL_PLAINTEXT_LENGTH) throw new LocalEncryptionError("invalid_envelope");
    return decoded;
  } catch {
    throw new LocalEncryptionError("authentication_failed");
  }
}
