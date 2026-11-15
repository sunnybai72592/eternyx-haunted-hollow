/**
 * Supabase Storage adapter for private AI generation outputs.
 *
 * Requires a trusted server-side Supabase client. Uploads are create-only
 * (upsert:false); a conflict is accepted only after downloading the existing
 * private object and verifying its content type, byte length, and SHA-256.
 */
import {
  AI_GENERATION_OUTPUT_BUCKET,
  type AIOutputObjectReceipt,
  type AIOutputStorage,
  type AIGenerationOutputContentType,
} from "./ai-output-materialization.ts";

interface StorageError {
  message?: string;
  status?: number;
  statusCode?: string | number;
}

interface StorageResult<T> {
  data: T | null;
  error: StorageError | null;
}

export interface SupabasePrivateStorageClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: Blob,
        options: { contentType: string; upsert: false },
      ): Promise<StorageResult<{ path: string }>>;
      download(path: string): Promise<StorageResult<Blob>>;
    };
  };
}

const OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/output\.(mp4|webm|jpg|png|webp|mp3|wav|pdf|txt|md|json)$/i;

async function digest(bytes: Uint8Array): Promise<string> {
  const value = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isAlreadyExists(error: StorageError): boolean {
  return error.status === 409 || error.statusCode === 409 ||
    error.statusCode === "409" ||
    (typeof error.message === "string" &&
      /^(the )?resource already exists\.?$/i.test(error.message.trim()));
}

export class SupabaseAIOutputStorage implements AIOutputStorage {
  constructor(private readonly client: SupabasePrivateStorageClient) {}

  async putIfAbsent(input: {
    bucket: typeof AI_GENERATION_OUTPUT_BUCKET;
    objectKey: string;
    bytes: Uint8Array;
    contentType: AIGenerationOutputContentType;
    sha256: string;
  }): Promise<AIOutputObjectReceipt> {
    if (input.bucket !== AI_GENERATION_OUTPUT_BUCKET ||
        !OBJECT_KEY.test(input.objectKey) ||
        !(input.bytes instanceof Uint8Array) ||
        input.bytes.byteLength < 1 ||
        await digest(input.bytes) !== input.sha256) {
      throw new Error("Invalid private AI output storage request");
    }

    const bucket = this.client.storage.from(AI_GENERATION_OUTPUT_BUCKET);
    const body = new Blob([input.bytes], { type: input.contentType });
    const uploaded = await bucket.upload(input.objectKey, body, {
      contentType: input.contentType,
      upsert: false,
    });

    if (!uploaded.error) {
      if (!uploaded.data || uploaded.data.path !== input.objectKey) {
        throw new Error("Storage upload returned an invalid object receipt");
      }
      return {
        outcome: "created",
        bucket: AI_GENERATION_OUTPUT_BUCKET,
        objectKey: input.objectKey,
        contentType: input.contentType,
        size: input.bytes.byteLength,
        sha256: input.sha256,
      };
    }

    if (!isAlreadyExists(uploaded.error)) {
      throw new Error("Private AI output upload failed");
    }

    const existing = await bucket.download(input.objectKey);
    if (existing.error || !(existing.data instanceof Blob) ||
        existing.data.type !== input.contentType) {
      throw new Error("Existing private AI output cannot be verified");
    }

    const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
    const existingDigest = await digest(existingBytes);
    if (existingBytes.byteLength !== input.bytes.byteLength ||
        existingDigest !== input.sha256) {
      throw new Error("Existing private AI output conflicts with retry payload");
    }

    return {
      outcome: "already_exists",
      bucket: AI_GENERATION_OUTPUT_BUCKET,
      objectKey: input.objectKey,
      contentType: input.contentType,
      size: existingBytes.byteLength,
      sha256: existingDigest,
    };
  }
}
