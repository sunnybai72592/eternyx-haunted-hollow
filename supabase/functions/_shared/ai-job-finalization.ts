/**
 * Trusted service-role wrapper for atomic AI job finalization.
 *
 * Successful completion requires a materialized user-owned object key and the
 * final charge. The database RPC commits the job outcome and central credit
 * settlement/release in one transaction. This helper does not upload files,
 * choose prices, create clients, or activate any service.
 */
export interface AIGenerationFinalizationRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type AIGenerationFinalStatus =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "reconciliation_required";

export interface FinalizeAIGenerationJobInput {
  jobId: string;
  leaseToken: string;
  nextStatus: AIGenerationFinalStatus;
  eventCode: string;
  outputObjectKey?: string;
  failureCode?: string;
  finalCredits?: number;
  providerId?: string;
  modelId?: string;
  providerTaskId?: string;
}

export interface FinalizeAIGenerationJobResult {
  jobId: string;
  status: AIGenerationFinalStatus;
  alreadyProcessed: boolean;
  creditHoldPreserved?: boolean;
}

export type AIGenerationFinalizationErrorCode =
  | "INVALID_REQUEST"
  | "FINALIZATION_REJECTED"
  | "FINALIZATION_SERVICE_UNAVAILABLE"
  | "FINALIZATION_SERVICE_INVALID_RESPONSE";

export class AIGenerationFinalizationError extends Error {
  readonly code: AIGenerationFinalizationErrorCode;

  constructor(code: AIGenerationFinalizationErrorCode) {
    super(code);
    this.name = "AIGenerationFinalizationError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_CODE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const FAILURE_CODE = /^[A-Z0-9_]{1,80}$/;
const PROVIDER_ID = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/;
const TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,254}$/;
const FINAL_STATUSES = new Set<AIGenerationFinalStatus>([
  "succeeded", "failed", "cancelled", "reconciliation_required",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validOptional(value: string | undefined, pattern: RegExp, max: number): boolean {
  return value === undefined || (typeof value === "string" && value.length <= max && pattern.test(value));
}

function validateInput(input: FinalizeAIGenerationJobInput): void {
  if (!input || !UUID.test(input.jobId) || !UUID.test(input.leaseToken) ||
      !FINAL_STATUSES.has(input.nextStatus) ||
      typeof input.eventCode !== "string" || !EVENT_CODE.test(input.eventCode) ||
      !validOptional(input.providerId, PROVIDER_ID, 50) ||
      !validOptional(input.modelId, MODEL_ID, 150) ||
      !validOptional(input.providerTaskId, TASK_ID, 255) ||
      (input.outputObjectKey !== undefined &&
        (typeof input.outputObjectKey !== "string" ||
          input.outputObjectKey.length < 1 || input.outputObjectKey.length > 500)) ||
      (input.failureCode !== undefined &&
        (typeof input.failureCode !== "string" || !FAILURE_CODE.test(input.failureCode))) ||
      (input.finalCredits !== undefined &&
        (!Number.isInteger(input.finalCredits) || input.finalCredits < 0))) {
    throw new AIGenerationFinalizationError("INVALID_REQUEST");
  }

  if (input.nextStatus === "succeeded" &&
      (input.outputObjectKey === undefined || input.finalCredits === undefined)) {
    throw new AIGenerationFinalizationError("INVALID_REQUEST");
  }
  if ((input.nextStatus === "failed" || input.nextStatus === "reconciliation_required") &&
      input.failureCode === undefined) {
    throw new AIGenerationFinalizationError("INVALID_REQUEST");
  }
  if (input.nextStatus !== "succeeded" &&
      (input.outputObjectKey !== undefined || input.finalCredits !== undefined)) {
    throw new AIGenerationFinalizationError("INVALID_REQUEST");
  }
}

export async function finalizeAIGenerationJob(
  client: AIGenerationFinalizationRpcClient,
  input: FinalizeAIGenerationJobInput,
): Promise<FinalizeAIGenerationJobResult> {
  validateInput(input);

  let data: unknown;
  try {
    const result = await client.rpc("finalize_ai_generation_job", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_next_status: input.nextStatus,
      p_event_code: input.eventCode,
      p_output_object_key: input.outputObjectKey ?? null,
      p_failure_code: input.failureCode ?? null,
      p_final_credits: input.finalCredits ?? null,
      p_provider_id: input.providerId ?? null,
      p_model_id: input.modelId ?? null,
      p_provider_task_id: input.providerTaskId ?? null,
    });
    if (result.error) {
      const message = (result.error.message ?? "").toLowerCase();
      if (message.includes("lease") || message.includes("already finalized") ||
          message.includes("state transition") || message.includes("invalid ai job")) {
        throw new AIGenerationFinalizationError("FINALIZATION_REJECTED");
      }
      throw new AIGenerationFinalizationError("FINALIZATION_SERVICE_UNAVAILABLE");
    }
    data = result.data;
  } catch (error) {
    if (error instanceof AIGenerationFinalizationError) throw error;
    throw new AIGenerationFinalizationError("FINALIZATION_SERVICE_UNAVAILABLE");
  }

  if (!isRecord(data) || data.job_id !== input.jobId ||
      data.status !== input.nextStatus || typeof data.already_processed !== "boolean" ||
      (data.credit_hold_preserved !== undefined &&
        typeof data.credit_hold_preserved !== "boolean")) {
    throw new AIGenerationFinalizationError("FINALIZATION_SERVICE_INVALID_RESPONSE");
  }

  return {
    jobId: input.jobId,
    status: input.nextStatus,
    alreadyProcessed: data.already_processed,
    ...(data.credit_hold_preserved !== undefined
      ? { creditHoldPreserved: data.credit_hold_preserved as boolean }
      : {}),
  };
}
