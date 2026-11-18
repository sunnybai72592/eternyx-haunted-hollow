/**
 * Defense-in-depth validation for server-owned AI image asset records.
 * The caller must still scope its database query to the authenticated user.
 */
export const AI_IMAGE_INPUT_BUCKET = "ai-generation-inputs";
export const MAX_VERIFIED_AI_IMAGE_SIZE = 10 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export interface VerifiedAIImageAsset {
  readonly id: string;
  readonly contentType: (typeof IMAGE_TYPES)[number];
  readonly size: number;
}

export type VerifiedAIImageAssetErrorCode =
  | "invalid_asset_reference"
  | "asset_not_owned"
  | "asset_not_ready"
  | "asset_metadata_invalid";

export class VerifiedAIImageAssetError extends Error {
  readonly code: VerifiedAIImageAssetErrorCode;

  constructor(code: VerifiedAIImageAssetErrorCode) {
    super(code);
    this.name = "VerifiedAIImageAssetError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the database row against the authenticated owner and requested ID. */
export function validateVerifiedAIImageAsset(
  value: unknown,
  expectedUserId: string,
  expectedAssetId: string,
): VerifiedAIImageAsset {
  if (!UUID_PATTERN.test(expectedUserId) || !UUID_PATTERN.test(expectedAssetId)) {
    throw new VerifiedAIImageAssetError("invalid_asset_reference");
  }
  if (!isRecord(value) || value.id !== expectedAssetId || value.user_id !== expectedUserId) {
    throw new VerifiedAIImageAssetError("asset_not_owned");
  }
  if (value.status !== "ready") {
    throw new VerifiedAIImageAssetError("asset_not_ready");
  }
  if (
    value.bucket_id !== AI_IMAGE_INPUT_BUCKET ||
    typeof value.verified_content_type !== "string" ||
    !IMAGE_TYPES.includes(value.verified_content_type as (typeof IMAGE_TYPES)[number]) ||
    typeof value.verified_size !== "number" ||
    !Number.isSafeInteger(value.verified_size) ||
    value.verified_size < 1 ||
    value.verified_size > MAX_VERIFIED_AI_IMAGE_SIZE
  ) {
    throw new VerifiedAIImageAssetError("asset_metadata_invalid");
  }

  return {
    id: expectedAssetId,
    contentType: value.verified_content_type as (typeof IMAGE_TYPES)[number],
    size: value.verified_size,
  };
}
