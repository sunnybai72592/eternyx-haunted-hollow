/**
 * ETERNYX Phase 15: opt-in, browser-only encrypted local evidence backups.
 * No network, storage, background execution or third-party cryptography.
 *
 * PBKDF2-HMAC-SHA256 (600,000 iterations), random 128-bit salt, AES-256-GCM,
 * random 96-bit nonce, 128-bit tag. Encryption is confidential/authenticated
 * for the key derived from the supplied passphrase; NOT author authentication.
 */
import {
  MAX_CORPUS_WORKSPACE_BYTES,
  parseCorpusWorkspace,
  type CorpusWorkspace,
} from "./document-corpus-workspace";

export const ENCRYPTED_CORPUS_FORMAT = "eternyx.encrypted-corpus-workspace";
export const ENCRYPTED_CORPUS_VERSION = 1;
export const ENCRYPTED_CORPUS_KDF = "PBKDF2-HMAC-SHA256";
export const ENCRYPTED_CORPUS_CIPHER = "AES-256-GCM";
export const ENCRYPTED_CORPUS_ITERATIONS = 600000;
export const ENCRYPTED_CORPUS_SALT_BYTES = 16;
export const ENCRYPTED_CORPUS_NONCE_BYTES = 12;
export const ENCRYPTED_CORPUS_TAG_BYTES = 16;
export const MIN_ENCRYPTED_CORPUS_PASSWORD = 12;
export const MAX_ENCRYPTED_CORPUS_PASSWORD = 256;
export const MAX_ENCRYPTED_CORPUS_BYTES = 4 * 1024 * 1024 + 4096;

export class EncryptedCorpusError extends Error {
  readonly code:
    "invalid_password" | "invalid_file" | "too_large" | "invalid_envelope" |
    "crypto_unavailable" | "authentication_failed" | "encrypt_failed";
  constructor(code: EncryptedCorpusError["code"]) {
    super(code);
    this.name = "EncryptedCorpusError";
    this.code = code;
  }
}
export interface EncryptedCorpusEnvelope {
  readonly format: typeof ENCRYPTED_CORPUS_FORMAT;
  readonly version: 1;
  readonly kdf: typeof ENCRYPTED_CORPUS_KDF;
  readonly iterations: typeof ENCRYPTED_CORPUS_ITERATIONS;
  readonly salt: string;
  readonly cipher: typeof ENCRYPTED_CORPUS_CIPHER;
  readonly nonce: string;
  readonly ciphertext: string;
}
function utf8(value: string): Uint8Array { return new TextEncoder().encode(value); }
function strictPassword(value: string): void {
  if (typeof value !== "string" || value.length < MIN_ENCRYPTED_CORPUS_PASSWORD ||
      value.length > MAX_ENCRYPTED_CORPUS_PASSWORD || value.includes("\u0000") ||
      utf8(value).byteLength > 1024) {
    throw new EncryptedCorpusError("invalid_password");
  }
}
function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues ||
      !globalThis.TextEncoder || !globalThis.TextDecoder ||
      typeof globalThis.btoa !== "function" || typeof globalThis.atob !== "function") {
    throw new EncryptedCorpusError("crypto_unavailable");
  }
  return globalThis.crypto.subtle;
}
function ensureByteSize(value: string): void {
  if (utf8(value).byteLength > MAX_ENCRYPTED_CORPUS_BYTES) {
    throw new EncryptedCorpusError("too_large");
  }
}
function toBase64(value: Uint8Array): string {
  // Chunk so large encrypted archives never overflow a function argument stack.
  let binary = "";
  for (let i = 0; i < value.length; i += 8192) {
    binary += String.fromCharCode(...value.subarray(i, i + 8192));
  }
  return btoa(binary);
}
function fromBase64(value: unknown, expectedLength?: number): Uint8Array {
  if (typeof value !== "string" || !value ||
      value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new EncryptedCorpusError("invalid_envelope");
  }
  let binary: string;
  try { binary = atob(value); }
  catch { throw new EncryptedCorpusError("invalid_envelope"); }
  if (expectedLength !== undefined && binary.length !== expectedLength) {
    throw new EncryptedCorpusError("invalid_envelope");
  }
  if (binary.length > MAX_CORPUS_WORKSPACE_BYTES + ENCRYPTED_CORPUS_TAG_BYTES ||
      toBase64(Uint8Array.from(binary, item => item.charCodeAt(0))) !== value) {
    throw new EncryptedCorpusError("invalid_envelope");
  }
  return Uint8Array.from(binary, item => item.charCodeAt(0));
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validateEnvelope(value: unknown): {
  salt: Uint8Array; nonce: Uint8Array; cipher: Uint8Array;
} {
  const keys = ["format", "version", "kdf", "iterations", "salt", "cipher", "nonce", "ciphertext"];
  if (!object(value) || Object.keys(value).length !== keys.length ||
      !keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) ||
      value.format !== ENCRYPTED_CORPUS_FORMAT ||
      value.version !== ENCRYPTED_CORPUS_VERSION ||
      value.kdf !== ENCRYPTED_CORPUS_KDF ||
      value.iterations !== ENCRYPTED_CORPUS_ITERATIONS ||
      value.cipher !== ENCRYPTED_CORPUS_CIPHER) {
    throw new EncryptedCorpusError("invalid_envelope");
  }
  const salt = fromBase64(value.salt, ENCRYPTED_CORPUS_SALT_BYTES);
  const nonce = fromBase64(value.nonce, ENCRYPTED_CORPUS_NONCE_BYTES);
  const cipher = fromBase64(value.ciphertext);
  if (cipher.length < ENCRYPTED_CORPUS_TAG_BYTES + 1) {
    throw new EncryptedCorpusError("invalid_envelope");
  }
  return { salt, nonce, cipher };
}
function aad(): Uint8Array {
  return utf8(ENCRYPTED_CORPUS_FORMAT + "|" + ENCRYPTED_CORPUS_VERSION + "|" +
    ENCRYPTED_CORPUS_KDF + "|" + ENCRYPTED_CORPUS_ITERATIONS + "|" +
    ENCRYPTED_CORPUS_CIPHER);
}
async function derivePasswordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const engine = subtle();
  const raw = await engine.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]);
  return engine.deriveKey(
    {name: "PBKDF2", salt, iterations: ENCRYPTED_CORPUS_ITERATIONS, hash: "SHA-256"},
    raw,
    {name: "AES-GCM", length: 256},
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt ONLY an already-valid plaintext Phase 14 workspace JSON backup. */
export async function encryptCorpusWorkspace(
  plaintextBackup: string, password: string,
): Promise<string> {
  strictPassword(password);
  subtle();
  if (typeof plaintextBackup !== "string" ||
      utf8(plaintextBackup).byteLength > MAX_CORPUS_WORKSPACE_BYTES) {
    throw new EncryptedCorpusError("too_large");
  }
  // Fail before deriving a key if caller supplied an invalid or stale backup.
  await parseCorpusWorkspace(plaintextBackup);
  const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTED_CORPUS_SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(ENCRYPTED_CORPUS_NONCE_BYTES));
  try {
    const key = await derivePasswordKey(password, salt);
    const ciphertext = new Uint8Array(await subtle().encrypt(
      {name: "AES-GCM", iv: nonce, additionalData: aad(), tagLength: 128},
      key, utf8(plaintextBackup),
    ));
    const envelope: EncryptedCorpusEnvelope = {
      format: ENCRYPTED_CORPUS_FORMAT, version: 1,
      kdf: ENCRYPTED_CORPUS_KDF, iterations: ENCRYPTED_CORPUS_ITERATIONS,
      salt: toBase64(salt), cipher: ENCRYPTED_CORPUS_CIPHER,
      nonce: toBase64(nonce), ciphertext: toBase64(ciphertext),
    };
    const encoded = JSON.stringify(envelope, null, 2) + "\n";
    ensureByteSize(encoded);
    return encoded;
  } catch (reason) {
    if (reason instanceof EncryptedCorpusError) throw reason;
    throw new EncryptedCorpusError("encrypt_failed");
  }
}

/**
 * No filenames, search parameters, documents or history leave the encrypted
 * envelope until AES-GCM succeeds. Then the original strict backup validator
 * and every decoded-text digest are checked before returning any workspace.
 */
export async function decryptCorpusWorkspace(
  encrypted: string, password: string,
): Promise<CorpusWorkspace> {
  strictPassword(password);
  subtle();
  if (typeof encrypted !== "string") throw new EncryptedCorpusError("invalid_envelope");
  ensureByteSize(encrypted);
  let decoded: unknown;
  try { decoded = JSON.parse(encrypted); }
  catch { throw new EncryptedCorpusError("invalid_envelope"); }
  const {salt, nonce, cipher} = validateEnvelope(decoded);
  let plaintext: string;
  try {
    const key = await derivePasswordKey(password, salt);
    const decrypted = await subtle().decrypt(
      {name: "AES-GCM", iv: nonce, additionalData: aad(), tagLength: 128},
      key, cipher,
    );
    plaintext = new TextDecoder("utf-8", {fatal: true}).decode(decrypted);
  } catch {
    // Deliberately identical result for wrong password and tampered contents.
    throw new EncryptedCorpusError("authentication_failed");
  }
  // Re-validate exact v1 workspace format and SHA-256, without partial results.
  return parseCorpusWorkspace(plaintext);
}
export async function readEncryptedCorpusFile(
  file: Pick<File, "name"|"size"|"type"|"text">, password: string,
): Promise<CorpusWorkspace> {
  if (!file || typeof file.name !== "string" || !file.name.toLowerCase().endsWith(".json") ||
      !Number.isSafeInteger(file.size) || file.size <= 0 ||
      file.size > MAX_ENCRYPTED_CORPUS_BYTES ||
      typeof file.text !== "function" ||
      (file.type && !["application/json", "text/plain", "application/octet-stream"].includes(file.type))) {
    throw new EncryptedCorpusError("invalid_file");
  }
  strictPassword(password);
  let encoded: string;
  try { encoded = await file.text(); }
  catch { throw new EncryptedCorpusError("invalid_file"); }
  return decryptCorpusWorkspace(encoded, password);
}
