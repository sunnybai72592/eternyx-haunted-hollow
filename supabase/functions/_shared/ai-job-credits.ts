/**
 * Trusted server-side RPC helpers for durable AI job credit holds.
 * Call only after authenticating the end user and constructing a service-role client.
 * These helpers do not create clients, call providers, or activate billing.
 */
export interface AIJobCreditRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type AIJobCreditErrorCode =
  | "INVALID_REQUEST"
  | "INSUFFICIENT_CREDITS"
  | "FEATURE_NOT_ENTITLED"
  | "SUBSCRIPTION_RECONCILIATION_REQUIRED"
  | "JOB_NOT_IN_REQUIRED_STATE"
  | "RESERVATION_CONFLICT"
  | "SETTLEMENT_EXCEEDS_RESERVATION"
  | "CREDIT_SERVICE_UNAVAILABLE"
  | "CREDIT_SERVICE_INVALID_RESPONSE";

export class AIJobCreditError extends Error {
  readonly code: AIJobCreditErrorCode;

  constructor(code: AIJobCreditErrorCode) {
    super(code);
    this.name = "AIJobCreditError";
    this.code = code;
  }
}

export interface ReserveAIJobCreditsInput {
  jobId: string;
  userId: string;
  leaseToken: string;
  idempotencyKey: string;
}

export interface SettleAIJobCreditsInput {
  jobId: string;
  userId: string;
  finalCredits: number;
}

export interface ReleaseAIJobCreditsInput {
  jobId: string;
  userId: string;
}

export interface AIJobCreditResult {
  status: "reserved" | "settled" | "released";
  alreadyProcessed: boolean;
  reservedCredits?: number;
  finalCredits?: number;
  creditsReleased?: number;
  balance: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AIJobCreditError("CREDIT_SERVICE_INVALID_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function validateIdentity(...values: string[]): void {
  if (values.some((value) => typeof value !== "string" || !UUID.test(value))) {
    throw new AIJobCreditError("INVALID_REQUEST");
  }
}

function mapError(message?: string): AIJobCreditError {
  const value = (message ?? "").toLowerCase();
  if (value.includes("insufficient credits")) return new AIJobCreditError("INSUFFICIENT_CREDITS");
  if (value.includes("feature is not enabled")) return new AIJobCreditError("FEATURE_NOT_ENTITLED");
  if (value.includes("multiple active subscriptions")) return new AIJobCreditError("SUBSCRIPTION_RECONCILIATION_REQUIRED");
  if (value.includes("idempotency conflict")) return new AIJobCreditError("RESERVATION_CONFLICT");
  if (value.includes("exceeds reserved credits")) return new AIJobCreditError("SETTLEMENT_EXCEEDS_RESERVATION");
  if (value.includes("must be") || value.includes("active worker lease")) {
    return new AIJobCreditError("JOB_NOT_IN_REQUIRED_STATE");
  }
  return new AIJobCreditError("CREDIT_SERVICE_UNAVAILABLE");
}

async function call(
  client: AIJobCreditRpcClient,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await client.rpc(name, args);
    if (error) throw mapError(error.message);
    return record(data);
  } catch (error) {
    if (error instanceof AIJobCreditError) throw error;
    throw new AIJobCreditError("CREDIT_SERVICE_UNAVAILABLE");
  }
}

function parseResult(data: Record<string, unknown>, expected: AIJobCreditResult["status"]): AIJobCreditResult {
  if (data.status !== expected && !(expected === "reserved" && data.status === "settled") &&
      !(expected === "reserved" && data.status === "released")) {
    throw new AIJobCreditError("CREDIT_SERVICE_INVALID_RESPONSE");
  }
  if (typeof data.already_processed !== "boolean" ||
      !Number.isInteger(data.balance) || (data.balance as number) < 0) {
    throw new AIJobCreditError("CREDIT_SERVICE_INVALID_RESPONSE");
  }
  for (const key of ["reserved_credits", "final_credits", "credits_released"]) {
    if (data[key] !== undefined && (!Number.isInteger(data[key]) || (data[key] as number) < 0)) {
      throw new AIJobCreditError("CREDIT_SERVICE_INVALID_RESPONSE");
    }
  }
  return {
    status: data.status as AIJobCreditResult["status"],
    alreadyProcessed: data.already_processed,
    ...(data.reserved_credits !== undefined ? { reservedCredits: data.reserved_credits as number } : {}),
    ...(data.final_credits !== undefined ? { finalCredits: data.final_credits as number } : {}),
    ...(data.credits_released !== undefined ? { creditsReleased: data.credits_released as number } : {}),
    balance: data.balance as number,
  };
}

export async function reserveAIJobCredits(
  client: AIJobCreditRpcClient,
  input: ReserveAIJobCreditsInput,
): Promise<AIJobCreditResult> {
  validateIdentity(input.jobId, input.userId, input.leaseToken);
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 1 ||
      input.idempotencyKey.length > 200) throw new AIJobCreditError("INVALID_REQUEST");
  const data = await call(client, "reserve_ai_generation_job_credits", {
    p_job_id: input.jobId,
    p_user_id: input.userId,
    p_lease_token: input.leaseToken,
    p_idempotency_key: input.idempotencyKey,
  });
  return parseResult(data, "reserved");
}

export async function settleAIJobCredits(
  client: AIJobCreditRpcClient,
  input: SettleAIJobCreditsInput,
): Promise<AIJobCreditResult> {
  validateIdentity(input.jobId, input.userId);
  if (!Number.isInteger(input.finalCredits) || input.finalCredits < 0) {
    throw new AIJobCreditError("INVALID_REQUEST");
  }
  const data = await call(client, "settle_ai_generation_job_credits", {
    p_job_id: input.jobId,
    p_user_id: input.userId,
    p_final_credits: input.finalCredits,
  });
  return parseResult(data, "settled");
}

export async function releaseAIJobCredits(
  client: AIJobCreditRpcClient,
  input: ReleaseAIJobCreditsInput,
): Promise<AIJobCreditResult> {
  validateIdentity(input.jobId, input.userId);
  const data = await call(client, "release_ai_generation_job_credits", {
    p_job_id: input.jobId,
    p_user_id: input.userId,
  });
  return parseResult(data, "released");
}
