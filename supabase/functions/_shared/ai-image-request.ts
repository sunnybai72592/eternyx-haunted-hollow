/**
 * Provider-neutral request contracts for AI Image Studio.
 *
 * Validation only: this module does not resolve uploaded assets, create jobs,
 * reserve credits, moderate content, or contact an AI provider.
 */

export type AIImageAspectRatio = "1:1" | "3:2" | "2:3" | "4:3" | "3:4" | "16:9" | "9:16";
export type AIImageOutputFormat = "png" | "jpeg" | "webp";

interface AIImageRequestBase {
  readonly aspectRatio?: AIImageAspectRatio;
  readonly outputFormat?: AIImageOutputFormat;
}

export interface AIImageGenerationRequest extends AIImageRequestBase {
  readonly featureKey: "ai.image.generate";
  readonly prompt: string;
  readonly negativePrompt?: string;
}

export interface AIImageEditingRequest extends AIImageRequestBase {
  readonly featureKey: "ai.image.edit";
  readonly prompt: string;
  /** UUID of a verified uploaded asset; never accept a client-supplied path or URL. */
  readonly imageAssetId: string;
  readonly negativePrompt?: string;
}

export interface AIImageUpscaleRequest extends AIImageRequestBase {
  readonly featureKey: "ai.image.upscale";
  /** UUID of a verified uploaded asset; never accept a client-supplied path or URL. */
  readonly imageAssetId: string;
}

export type AIImageRequest =
  | AIImageGenerationRequest
  | AIImageEditingRequest
  | AIImageUpscaleRequest;

export type AIImageRequestErrorCode =
  | "invalid_request"
  | "unsupported_feature"
  | "invalid_prompt"
  | "invalid_image_asset"
  | "invalid_aspect_ratio"
  | "invalid_output_format"
  | "invalid_negative_prompt";

export class AIImageRequestValidationError extends Error {
  readonly code: AIImageRequestErrorCode;

  constructor(code: AIImageRequestErrorCode) {
    super(code);
    this.name = "AIImageRequestValidationError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASPECT_RATIOS: readonly AIImageAspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
const OUTPUT_FORMATS: readonly AIImageOutputFormat[] = ["png", "jpeg", "webp"];
const BASE_KEYS = ["featureKey", "aspectRatio", "outputFormat"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new AIImageRequestValidationError("invalid_request");
  }
}

function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 4000) {
    throw new AIImageRequestValidationError("invalid_prompt");
  }
  return value.trim();
}

function validateAssetId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new AIImageRequestValidationError("invalid_image_asset");
  }
  return value;
}

/** Validates and returns a normalized, discriminated AI Image request. */
export function validateAIImageRequest(value: unknown): AIImageRequest {
  if (!isRecord(value)) throw new AIImageRequestValidationError("invalid_request");

  const featureKey = value.featureKey;
  if (featureKey === "ai.image.generate") {
    rejectUnknownKeys(value, [...BASE_KEYS, "prompt", "negativePrompt"]);
  } else if (featureKey === "ai.image.edit") {
    rejectUnknownKeys(value, [...BASE_KEYS, "prompt", "negativePrompt", "imageAssetId"]);
  } else if (featureKey === "ai.image.upscale") {
    rejectUnknownKeys(value, [...BASE_KEYS, "imageAssetId"]);
  } else {
    throw new AIImageRequestValidationError("unsupported_feature");
  }

  if (value.aspectRatio !== undefined &&
      (typeof value.aspectRatio !== "string" || !ASPECT_RATIOS.includes(value.aspectRatio as AIImageAspectRatio))) {
    throw new AIImageRequestValidationError("invalid_aspect_ratio");
  }

  if (value.outputFormat !== undefined &&
      (typeof value.outputFormat !== "string" || !OUTPUT_FORMATS.includes(value.outputFormat as AIImageOutputFormat))) {
    throw new AIImageRequestValidationError("invalid_output_format");
  }

  const options = {
    ...(value.aspectRatio === undefined ? {} : { aspectRatio: value.aspectRatio as AIImageAspectRatio }),
    ...(value.outputFormat === undefined ? {} : { outputFormat: value.outputFormat as AIImageOutputFormat }),
  };

  if (featureKey === "ai.image.upscale") {
    return { featureKey, ...options, imageAssetId: validateAssetId(value.imageAssetId) };
  }

  const prompt = validatePrompt(value.prompt);
  if (value.negativePrompt !== undefined &&
      (typeof value.negativePrompt !== "string" || value.negativePrompt.length > 2000)) {
    throw new AIImageRequestValidationError("invalid_negative_prompt");
  }
  const negativePrompt = value.negativePrompt === undefined ? undefined : value.negativePrompt.trim();

  if (featureKey === "ai.image.generate") {
    return {
      featureKey,
      ...options,
      prompt,
      ...(negativePrompt === undefined ? {} : { negativePrompt }),
    };
  }

  return {
    featureKey,
    ...options,
    prompt,
    imageAssetId: validateAssetId(value.imageAssetId),
    ...(negativePrompt === undefined ? {} : { negativePrompt }),
  };
}
