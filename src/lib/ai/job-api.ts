import { supabase } from "@/integrations/supabase/client";
import { AI_JOB_STATUSES, type AIJobStatus } from "./jobs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AIJobStatusResponse {
  readonly id: string;
  readonly featureKey: string;
  readonly status: AIJobStatus;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failureCode: string | null;
}

export interface AIJobCancellationResponse {
  readonly job_id: string;
  readonly status: AIJobStatus;
  readonly already_terminal: boolean;
  readonly cancellation_requested: boolean;
  readonly provider_reconciliation_required?: boolean;
}

export class AIJobApiError extends Error {
  readonly code: "invalid_job_id" | "unauthenticated" | "not_found" | "conflict" | "unavailable";

  constructor(
    code: AIJobApiError["code"],
    message: string,
  ) {
    super(message);
    this.name = "AIJobApiError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJobStatus(value: unknown): value is AIJobStatus {
  return typeof value === "string" && (AI_JOB_STATUSES as readonly string[]).includes(value);
}

function parseStatusResponse(value: unknown): AIJobStatusResponse {
  if (!isRecord(value) || !isRecord(value.job)) {
    throw new AIJobApiError("unavailable", "The AI job status response was invalid.");
  }

  const job = value.job;
  if (
    typeof job.id !== "string" || !UUID_PATTERN.test(job.id) ||
    typeof job.featureKey !== "string" || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(job.featureKey) ||
    !isJobStatus(job.status) ||
    !Number.isInteger(job.attemptCount) || (job.attemptCount as number) < 0 ||
    !Number.isInteger(job.maxAttempts) || (job.maxAttempts as number) < 1 ||
    typeof job.availableAt !== "string" ||
    typeof job.createdAt !== "string" ||
    typeof job.updatedAt !== "string" ||
    !(job.startedAt === null || typeof job.startedAt === "string") ||
    !(job.completedAt === null || typeof job.completedAt === "string") ||
    !(job.failureCode === null || (typeof job.failureCode === "string" && /^[A-Z0-9_]{1,80}$/.test(job.failureCode)))
  ) {
    throw new AIJobApiError("unavailable", "The AI job status response was invalid.");
  }

  return job as unknown as AIJobStatusResponse;
}

function mapFunctionError(error: { message?: string; context?: unknown }): AIJobApiError {
  const context = error.context as { status?: number } | undefined;
  switch (context?.status) {
    case 401:
      return new AIJobApiError("unauthenticated", "Please sign in to access this AI job.");
    case 404:
      return new AIJobApiError("not_found", "This AI job could not be found.");
    case 409:
      return new AIJobApiError("conflict", "This AI job cannot be cancelled in its current state.");
    default:
      return new AIJobApiError("unavailable", "The AI job service is temporarily unavailable.");
  }
}

export async function getAIJobStatus(jobId: string): Promise<AIJobStatusResponse> {
  if (!UUID_PATTERN.test(jobId)) {
    throw new AIJobApiError("invalid_job_id", "A valid AI job ID is required.");
  }

  const { data, error } = await supabase.functions.invoke("ai-generation-job-status", {
    body: { jobId },
  });

  if (error) throw mapFunctionError(error);
  return parseStatusResponse(data);
}

export async function requestAIJobCancellation(jobId: string): Promise<AIJobCancellationResponse> {
  if (!UUID_PATTERN.test(jobId)) {
    throw new AIJobApiError("invalid_job_id", "A valid AI job ID is required.");
  }

  const { data, error } = await supabase.functions.invoke("ai-generation-job-cancel", {
    body: { jobId },
  });

  if (error) throw mapFunctionError(error);
  if (
    !isRecord(data) || data.success !== true || !isRecord(data.cancellation) ||
    typeof data.cancellation.job_id !== "string" ||
    !UUID_PATTERN.test(data.cancellation.job_id) ||
    !isJobStatus(data.cancellation.status) ||
    typeof data.cancellation.already_terminal !== "boolean" ||
    typeof data.cancellation.cancellation_requested !== "boolean" ||
    (data.cancellation.provider_reconciliation_required !== undefined &&
      typeof data.cancellation.provider_reconciliation_required !== "boolean")
  ) {
    throw new AIJobApiError("unavailable", "The AI job cancellation response was invalid.");
  }

  return data.cancellation as unknown as AIJobCancellationResponse;
}
