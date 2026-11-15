/**
 * Secure, retry-safe materialization of a completed provider output.
 *
 * This is an injected server-side execution core. It never fetches arbitrary
 * URLs and is not wired to a provider, worker endpoint, or deployed storage
 * client. The provider-specific downloader must resolve opaque references
 * using an approved adapter; the storage adapter must implement atomic
 * create-if-absent semantics.
 */
import type { AIClaimedJob } from "./ai-job-claim.ts";
import type { AIGenerationProviderSnapshot } from "./ai-generation-provider.ts";

export const AI_GENERATION_OUTPUT_BUCKET = "ai-generation-outputs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OUTPUT_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/json": "json",
} as const;

export type AIGenerationOutputContentType = keyof typeof OUTPUT_TYPES;

export interface AIProviderOutput {
  bytes: Uint8Array;
  contentType: string;
}

export interface AIOutputObjectReceipt {
  outcome: "created" | "already_exists";
  bucket: string;
  objectKey: string;
  contentType: string;
  size: number;
  sha256: string;
}

export interface AIOutputStorage {
  /**
   * Must atomically create the object only when absent. If it already exists,
   * return its stored metadata without overwriting it. The caller verifies
   * that an existing object is byte-for-byte equivalent by SHA-256 and size.
   */
  putIfAbsent(input: {
    bucket: typeof AI_GENERATION_OUTPUT_BUCKET;
    objectKey: string;
    bytes: Uint8Array;
    contentType: AIGenerationOutputContentType;
    sha256: string;
  }): Promise<AIOutputObjectReceipt>;
}

export interface AIOutputMaterializationDependencies {
  /** Resolve a provider-owned opaque reference; do not accept arbitrary URLs. */
  downloadProviderOutput(input: {
    providerId: string;
    providerTaskId: string;
    outputReference: string;
  }): Promise<AIProviderOutput>;
  storage: AIOutputStorage;
  /** Existing central feature pricing/settlement policy; no price is invented here. */
  calculateFinalCredits(
    job: AIClaimedJob,
    output: { contentType: AIGenerationOutputContentType; size: number; sha256: string },
  ): Promise<number>;
  /** Must come from the approved feature/model output-size policy. */
  maxBytes: number;
}

export interface MaterializedAIOutput {
  outputObjectKey: string;
  finalCredits: number;
  contentType: AIGenerationOutputContentType;
  size: number;
  sha256: string;
  alreadyExisted: boolean;
}

export type AIOutputMaterializationErrorCode =
  | "INVALID_JOB"
  | "INVALID_PROVIDER_OUTPUT"
  | "OUTPUT_TOO_LARGE"
  | "OUTPUT_DOWNLOAD_UNAVAILABLE"
  | "OUTPUT_STORAGE_UNAVAILABLE"
  | "OUTPUT_OBJECT_CONFLICT"
  | "OUTPUT_PRICING_UNAVAILABLE";

export class AIOutputMaterializationError extends Error {
  readonly code: AIOutputMaterializationErrorCode;

  constructor(code: AIOutputMaterializationErrorCode) {
    super(code);
    this.name = "AIOutputMaterializationError";
    this.code = code;
  }
}

function isOutputContentType(value: string): value is AIGenerationOutputContentType {
  return Object.hasOwn(OUTPUT_TYPES, value);
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function hasValidOutputSignature(bytes: Uint8Array, contentType: AIGenerationOutputContentType): boolean {
  switch (contentType) {
    case "video/mp4":
      return bytes.byteLength >= 12 &&
        String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
    case "video/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return bytes.byteLength >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
    case "audio/mpeg":
      return startsWith(bytes, [0x49, 0x44, 0x33]) ||
        (bytes.byteLength >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case "audio/wav":
      return bytes.byteLength >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE";
    case "application/pdf":
      return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "text/plain":
    case "text/markdown":
    case "application/json":
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (text.includes("\\u0000")) return false;
        if (contentType === "application/json") JSON.parse(text);
        return true;
      } catch {
        return false;
      }
  }
}

function outputObjectKey(userId: string, jobId: string, contentType: AIGenerationOutputContentType): string {
  return `${userId}/${jobId}/output.${OUTPUT_TYPES[contentType]}`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function materializeAIProviderOutput(
  job: AIClaimedJob,
  snapshot: AIGenerationProviderSnapshot,
  dependencies: AIOutputMaterializationDependencies,
): Promise<MaterializedAIOutput> {
  if (!job || !UUID.test(job.id) || !UUID.test(job.userId) ||
      typeof job.providerId !== "string" || job.providerId.length < 1 ||
      typeof job.providerTaskId !== "string" || job.providerTaskId.length < 1 ||
      snapshot?.state !== "succeeded" ||
      snapshot.providerTaskId !== job.providerTaskId ||
      typeof snapshot.outputReference !== "string" ||
      snapshot.outputReference.length < 1 || snapshot.outputReference.length > 1000 ||
      !Number.isSafeInteger(dependencies.maxBytes) || dependencies.maxBytes < 1) {
    throw new AIOutputMaterializationError("INVALID_JOB");
  }

  let providerOutput: AIProviderOutput;
  try {
    providerOutput = await dependencies.downloadProviderOutput({
      providerId: job.providerId,
      providerTaskId: job.providerTaskId,
      outputReference: snapshot.outputReference,
    });
  } catch {
    throw new AIOutputMaterializationError("OUTPUT_DOWNLOAD_UNAVAILABLE");
  }

  if (!providerOutput || !(providerOutput.bytes instanceof Uint8Array) ||
      providerOutput.bytes.byteLength < 1 ||
      typeof providerOutput.contentType !== "string" ||
      !isOutputContentType(providerOutput.contentType) ||
      !hasValidOutputSignature(providerOutput.bytes, providerOutput.contentType)) {
    throw new AIOutputMaterializationError("INVALID_PROVIDER_OUTPUT");
  }
  if (providerOutput.bytes.byteLength > dependencies.maxBytes) {
    throw new AIOutputMaterializationError("OUTPUT_TOO_LARGE");
  }

  const contentType = providerOutput.contentType;
  const size = providerOutput.bytes.byteLength;
  const digest = await sha256(providerOutput.bytes);
  const objectKey = outputObjectKey(job.userId, job.id, contentType);

  let receipt: AIOutputObjectReceipt;
  try {
    receipt = await dependencies.storage.putIfAbsent({
      bucket: AI_GENERATION_OUTPUT_BUCKET,
      objectKey,
      bytes: providerOutput.bytes,
      contentType,
      sha256: digest,
    });
  } catch {
    throw new AIOutputMaterializationError("OUTPUT_STORAGE_UNAVAILABLE");
  }

  if (!receipt || !["created", "already_exists"].includes(receipt.outcome) ||
      receipt.bucket !== AI_GENERATION_OUTPUT_BUCKET ||
      receipt.objectKey !== objectKey ||
      receipt.contentType !== contentType ||
      receipt.size !== size ||
      receipt.sha256 !== digest) {
    throw new AIOutputMaterializationError("OUTPUT_OBJECT_CONFLICT");
  }

  let finalCredits: number;
  try {
    finalCredits = await dependencies.calculateFinalCredits(job, { contentType, size, sha256: digest });
  } catch {
    throw new AIOutputMaterializationError("OUTPUT_PRICING_UNAVAILABLE");
  }
  if (!Number.isSafeInteger(finalCredits) || finalCredits < 0) {
    throw new AIOutputMaterializationError("OUTPUT_PRICING_UNAVAILABLE");
  }

  return {
    outputObjectKey: objectKey,
    finalCredits,
    contentType,
    size,
    sha256: digest,
    alreadyExisted: receipt.outcome === "already_exists",
  };
}
