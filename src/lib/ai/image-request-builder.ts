import type { VerifiedAIImageUpload } from "./image-upload-api";

export type AIImageRequestAspectRatio = "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "16:9" | "9:16";
export type AIImageRequestOutputFormat = "png" | "jpeg" | "webp";

export interface AIImageRequestOptions {
  readonly aspectRatio?: AIImageRequestAspectRatio;
  readonly outputFormat?: AIImageRequestOutputFormat;
}

export interface AIImageEditRequestDraft extends AIImageRequestOptions {
  readonly featureKey: "ai.image.edit";
  readonly prompt: string;
  readonly imageAssetId: string;
  readonly negativePrompt?: string;
}

export interface AIImageUpscaleRequestDraft extends AIImageRequestOptions {
  readonly featureKey: "ai.image.upscale";
  readonly imageAssetId: string;
}

export class AIImageRequestDraftError extends Error {
  readonly code: "invalid_asset" | "invalid_prompt";

  constructor(code: AIImageRequestDraftError["code"]) {
    super(code);
    this.name = "AIImageRequestDraftError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Builds a provider-neutral edit request from a server-verified private asset.
 * This is local request preparation only: it does not enqueue, reserve credits,
 * perform moderation, or contact an AI provider.
 */
export function buildAIImageEditRequest(
  asset: VerifiedAIImageUpload,
  prompt: string,
  options: AIImageRequestOptions & { readonly negativePrompt?: string } = {},
): AIImageEditRequestDraft {
  if (!asset || !UUID_PATTERN.test(asset.assetId)) {
    throw new AIImageRequestDraftError("invalid_asset");
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 4000) {
    throw new AIImageRequestDraftError("invalid_prompt");
  }
  if (options.negativePrompt !== undefined &&
      (typeof options.negativePrompt !== "string" || options.negativePrompt.length > 2000)) {
    throw new AIImageRequestDraftError("invalid_prompt");
  }

  return {
    featureKey: "ai.image.edit",
    imageAssetId: asset.assetId,
    prompt: prompt.trim(),
    ...(options.negativePrompt === undefined ? {} : { negativePrompt: options.negativePrompt.trim() }),
    ...(options.aspectRatio === undefined ? {} : { aspectRatio: options.aspectRatio }),
    ...(options.outputFormat === undefined ? {} : { outputFormat: options.outputFormat }),
  };
}

/** Builds an upscale request using only a server-verified asset identifier. */
export function buildAIImageUpscaleRequest(
  asset: VerifiedAIImageUpload,
  options: AIImageRequestOptions = {},
): AIImageUpscaleRequestDraft {
  if (!asset || !UUID_PATTERN.test(asset.assetId)) {
    throw new AIImageRequestDraftError("invalid_asset");
  }

  return {
    featureKey: "ai.image.upscale",
    imageAssetId: asset.assetId,
    ...(options.aspectRatio === undefined ? {} : { aspectRatio: options.aspectRatio }),
    ...(options.outputFormat === undefined ? {} : { outputFormat: options.outputFormat }),
  };
}
