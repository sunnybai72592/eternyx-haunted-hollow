import { supabase } from "@/integrations/supabase/client";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VerifiedAIImageUpload {
  readonly assetId: string;
  readonly contentType: (typeof IMAGE_TYPES)[number];
  readonly size: number;
}

export class AIImageUploadError extends Error {
  readonly code: "invalid_file" | "upload_unavailable" | "upload_failed" | "verification_failed";

  constructor(code: AIImageUploadError["code"]) {
    super(code);
    this.name = "AIImageUploadError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Uploads an image through the authenticated, server-owned asset workflow.
 * The returned asset ID is safe to reference in a later edit/upscale request;
 * this function never enqueues a job, reserves credits, or calls a provider.
 */
export async function uploadAIImageAsset(file: File): Promise<VerifiedAIImageUpload> {
  if (
    !IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number]) ||
    !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMAGE_SIZE
  ) {
    throw new AIImageUploadError("invalid_file");
  }

  const { data: signed, error: signedError } = await supabase.functions.invoke(
    "ai-generation-input-upload-url",
    { body: { contentType: file.type, fileSize: file.size } },
  );
  if (signedError || !isRecord(signed) || signed.success !== true ||
      typeof signed.assetId !== "string" || !UUID_PATTERN.test(signed.assetId) ||
      typeof signed.path !== "string" || !signed.path ||
      typeof signed.token !== "string" || !signed.token ||
      signed.contentType !== file.type) {
    throw new AIImageUploadError("upload_unavailable");
  }

  const { error: storageError } = await supabase.storage
    .from("ai-generation-inputs")
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (storageError) throw new AIImageUploadError("upload_failed");

  const { data: verified, error: verifyError } = await supabase.functions.invoke(
    "ai-generation-input-verify",
    { body: { assetId: signed.assetId } },
  );
  if (verifyError || !isRecord(verified) || verified.success !== true ||
      !isRecord(verified.asset) || verified.asset.id !== signed.assetId ||
      verified.asset.status !== "ready" || verified.asset.contentType !== file.type ||
      verified.asset.size !== file.size) {
    throw new AIImageUploadError("verification_failed");
  }

  return {
    assetId: signed.assetId,
    contentType: file.type as (typeof IMAGE_TYPES)[number],
    size: file.size,
  };
}
