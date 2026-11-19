import { supabase } from "@/integrations/supabase/client";
import { AI_JOB_STATUSES, type AIJobStatus } from "./jobs";
import type {
  AIImageEditRequestDraft,
  AIImageGenerationRequestDraft,
  AIImageUpscaleRequestDraft,
} from "./image-request-builder";

export type AIImageJobRequest =
  | AIImageGenerationRequestDraft
  | AIImageEditRequestDraft
  | AIImageUpscaleRequestDraft;

export interface AIImageEnqueueReceipt {
  readonly id: string;
  readonly status: AIJobStatus;
  readonly alreadyExists: boolean;
}

export class AIImageEnqueueError extends Error {
  readonly code:
    | "invalid_idempotency_key"
    | "unauthenticated"
    | "insufficient_credits"
    | "feature_disabled"
    | "conflict"
    | "invalid_request"
    | "unavailable";

  constructor(code: AIImageEnqueueError["code"], message: string) {
    super(message);
    this.name = "AIImageEnqueueError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobStatus(value: unknown): value is AIJobStatus {
  return typeof value === "string" && (AI_JOB_STATUSES as readonly string[]).includes(value);
}

function mapEnqueueError(error: { context?: unknown }): AIImageEnqueueError {
  const status = (error.context as { status?: number } | undefined)?.status;
  switch (status) {
    case 401:
      return new AIImageEnqueueError("unauthenticated", "Sign in to submit an image request.");
    case 402:
      return new AIImageEnqueueError("insufficient_credits", "There are not enough available credits.");
    case 403:
      return new AIImageEnqueueError("feature_disabled", "This image feature is not enabled.");
    case 409:
      return new AIImageEnqueueError("conflict", "This idempotency key was already used for a different request.");
    case 400:
    case 413:
    case 422:
      return new AIImageEnqueueError("invalid_request", "The image request could not be accepted.");
    default:
      return new AIImageEnqueueError("unavailable", "AI image generation is temporarily unavailable.");
  }
}

/**
 * Calls the shared authenticated enqueue boundary for a prepared image request.
 * The caller must retain and reuse the same idempotency key when retrying the
 * same logical submission. This client never calls an AI provider directly.
 *
 * The studio does not call this helper until safety policy, backend deployment,
 * provider selection, and cost activation have been explicitly approved.
 */
export async function enqueueAIImageJob(
  request: AIImageJobRequest,
  idempotencyKey: string,
): Promise<AIImageEnqueueReceipt> {
  if (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new AIImageEnqueueError("invalid_idempotency_key", "A valid idempotency key is required.");
  }

  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke("ai-generation-job-enqueue", {
      body: { request, idempotencyKey },
    });
  } catch {
    throw new AIImageEnqueueError("unavailable", "AI image generation is temporarily unavailable.");
  }

  const { data, error } = result;
  if (error) throw mapEnqueueError(error);
  if (
    !isRecord(data) || data.success !== true || !isRecord(data.job) ||
    typeof data.job.id !== "string" || !UUID_PATTERN.test(data.job.id) ||
    !isJobStatus(data.job.status) ||
    typeof data.job.alreadyExists !== "boolean"
  ) {
    throw new AIImageEnqueueError("unavailable", "The AI image enqueue response was invalid.");
  }

  return {
    id: data.job.id,
    status: data.job.status,
    alreadyExists: data.job.alreadyExists,
  };
}
