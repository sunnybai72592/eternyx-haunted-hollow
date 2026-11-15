/**
 * Trusted server-side wrapper for lease-fenced AI job state transitions.
 * Use only with a service-role client inside an approved worker environment.
 *
 * Terminal accounting outcomes must use finalize_ai_generation_job instead.
 */
export type AIJobTransitionStatus =
  | "reserved"
  | "submitted"
  | "processing"
  | "cancel_requested";

export type AIJobTransitionNextStatus =
  | "submitted"
  | "processing"
  | "cancel_requested"
  | "reconciliation_required"
  | "queued";

export interface AIJobTransitionRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export interface TransitionAIJobInput {
  jobId: string;
  leaseToken: string;
  currentStatus: AIJobTransitionStatus;
  nextStatus: AIJobTransitionNextStatus;
  eventCode: string;
  providerId?: string;
  modelId?: string;
  providerTaskId?: string;
  retryAfterSeconds?: number;
  failureCode?: string;
}

export interface AIJobTransitionResult {
  jobId: string;
  status: string;
}

export type AIJobTransitionErrorCode =
  | "INVALID_REQUEST"
  | "TRANSITION_NOT_ALLOWED"
  | "TRANSITION_SERVICE_UNAVAILABLE"
  | "TRANSITION_SERVICE_INVALID_RESPONSE";

export class AIJobTransitionError extends Error {
  readonly code: AIJobTransitionErrorCode;

  constructor(code: AIJobTransitionErrorCode) {
    super(code);
    this.name = "AIJobTransitionError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_CODE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const FAILURE_CODE = /^[A-Z0-9_]{1,80}$/;
const PROVIDER_ID = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const ALLOWED: Record<AIJobTransitionStatus, readonly AIJobTransitionNextStatus[]> = {
  reserved: ["submitted", "processing", "cancel_requested", "reconciliation_required", "queued"],
  submitted: ["processing", "cancel_requested", "reconciliation_required"],
  processing: ["cancel_requested", "reconciliation_required"],
  cancel_requested: ["reconciliation_required"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalBoundedString(value: string | undefined, max: number): boolean {
  return value === undefined || (typeof value === "string" && value.length >= 1 && value.length <= max);
}

export async function transitionAIJob(
  client: AIJobTransitionRpcClient,
  input: TransitionAIJobInput,
): Promise<AIJobTransitionResult> {
  if (!UUID.test(input.jobId) ||
      !UUID.test(input.leaseToken) ||
      !Object.hasOwn(ALLOWED, input.currentStatus) ||
      !ALLOWED[input.currentStatus].includes(input.nextStatus) ||
      typeof input.eventCode !== "string" || !EVENT_CODE.test(input.eventCode) ||
      (input.providerId !== undefined && !PROVIDER_ID.test(input.providerId)) ||
      !optionalBoundedString(input.modelId, 150) ||
      !optionalBoundedString(input.providerTaskId, 255) ||
      (input.failureCode !== undefined && !FAILURE_CODE.test(input.failureCode)) ||
      (input.retryAfterSeconds !== undefined &&
        (!Number.isInteger(input.retryAfterSeconds) || input.retryAfterSeconds < 1 || input.retryAfterSeconds > 86400)) ||
      (input.nextStatus === "reconciliation_required" && input.failureCode === undefined) ||
      (input.nextStatus === "queued" && input.retryAfterSeconds === undefined)) {
    throw new AIJobTransitionError("INVALID_REQUEST");
  }

  let data: unknown;
  try {
    const result = await client.rpc("transition_ai_generation_job", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_next_status: input.nextStatus,
      p_event_code: input.eventCode,
      p_provider_id: input.providerId ?? null,
      p_model_id: input.modelId ?? null,
      p_provider_task_id: input.providerTaskId ?? null,
      p_output_object_key: null,
      p_failure_code: input.failureCode ?? null,
      p_retry_after_seconds: input.retryAfterSeconds ?? null,
    });
    if (result.error) throw new AIJobTransitionError("TRANSITION_SERVICE_UNAVAILABLE");
    data = result.data;
  } catch (error) {
    if (error instanceof AIJobTransitionError) throw error;
    throw new AIJobTransitionError("TRANSITION_SERVICE_UNAVAILABLE");
  }

  if (!isRecord(data) ||
      data.job_id !== input.jobId ||
      data.status !== input.nextStatus) {
    throw new AIJobTransitionError("TRANSITION_SERVICE_INVALID_RESPONSE");
  }

  return { jobId: input.jobId, status: input.nextStatus };
}
