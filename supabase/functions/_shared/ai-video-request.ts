/**
 * Version-one, provider-neutral request contracts for the AI Video Studio.
 *
 * This validates user input only. It does not create jobs, reserve credits,
 * resolve storage objects, moderate content, or contact an AI provider.
 */

export type AIVideoAspectRatio = "16:9" | "9:16" | "1:1";

interface AIVideoRequestBase {
  readonly prompt: string;
  readonly durationSeconds: number;
  readonly aspectRatio?: AIVideoAspectRatio;
  readonly negativePrompt?: string;
}

export interface AITextToVideoRequest extends AIVideoRequestBase {
  readonly featureKey: "ai.video.text_to_video";
}

export interface AIImageToVideoRequest extends AIVideoRequestBase {
  readonly featureKey: "ai.video.image_to_video";
  /** UUID of an uploaded asset; never accept a client-supplied storage path or URL. */
  readonly imageAssetId: string;
}

export type AIVideoGenerationRequest = AITextToVideoRequest | AIImageToVideoRequest;

export type AIVideoRequestErrorCode =
  | "invalid_request"
  | "unsupported_feature"
  | "invalid_prompt"
  | "invalid_duration"
  | "invalid_aspect_ratio"
  | "invalid_negative_prompt"
  | "invalid_image_asset";

export class AIVideoRequestValidationError extends Error {
  readonly code: AIVideoRequestErrorCode;

  constructor(code: AIVideoRequestErrorCode) {
    super(code);
    this.name = "AIVideoRequestValidationError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASPECT_RATIOS: readonly AIVideoAspectRatio[] = ["16:9", "9:16", "1:1"];
const COMMON_KEYS = ["featureKey", "prompt", "durationSeconds", "aspectRatio", "negativePrompt"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new AIVideoRequestValidationError("invalid_request");
  }
}

/** Validates and returns a normalized, discriminated AI Video request. */
export function validateAIVideoGenerationRequest(value: unknown): AIVideoGenerationRequest {
  if (!isRecord(value)) throw new AIVideoRequestValidationError("invalid_request");

  if (value.featureKey === "ai.video.text_to_video") {
    rejectUnknownKeys(value, COMMON_KEYS);
  } else if (value.featureKey === "ai.video.image_to_video") {
    rejectUnknownKeys(value, [...COMMON_KEYS, "imageAssetId"]);
  } else {
    throw new AIVideoRequestValidationError("unsupported_feature");
  }

  if (typeof value.prompt !== "string" || value.prompt.trim().length === 0 || value.prompt.length > 4000) {
    throw new AIVideoRequestValidationError("invalid_prompt");
  }

  if (!Number.isInteger(value.durationSeconds) || (value.durationSeconds as number) < 1 || (value.durationSeconds as number) > 60) {
    throw new AIVideoRequestValidationError("invalid_duration");
  }

  if (value.aspectRatio !== undefined &&
      (typeof value.aspectRatio !== "string" || !ASPECT_RATIOS.includes(value.aspectRatio as AIVideoAspectRatio))) {
    throw new AIVideoRequestValidationError("invalid_aspect_ratio");
  }

  if (value.negativePrompt !== undefined &&
      (typeof value.negativePrompt !== "string" || value.negativePrompt.length > 2000)) {
    throw new AIVideoRequestValidationError("invalid_negative_prompt");
  }

  const base = {
    prompt: value.prompt.trim(),
    durationSeconds: value.durationSeconds as number,
    ...(value.aspectRatio === undefined ? {} : { aspectRatio: value.aspectRatio as AIVideoAspectRatio }),
    ...(value.negativePrompt === undefined ? {} : { negativePrompt: (value.negativePrompt as string).trim() }),
  };

  if (value.featureKey === "ai.video.text_to_video") {
    return { featureKey: value.featureKey, ...base };
  }

  if (typeof value.imageAssetId !== "string" || !UUID_PATTERN.test(value.imageAssetId)) {
    throw new AIVideoRequestValidationError("invalid_image_asset");
  }

  return { featureKey: value.featureKey, ...base, imageAssetId: value.imageAssetId };
}
