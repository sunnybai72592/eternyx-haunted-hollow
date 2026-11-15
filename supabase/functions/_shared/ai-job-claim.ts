/**
 * Trusted server-side interface for atomically claiming durable AI jobs.
 * Use only with a service-role client inside an approved worker environment.
 */
export interface AIJobClaimRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type AIClaimedJobStatus =
  | "reserved"
  | "submitted"
  | "processing"
  | "cancel_requested";

export interface AIClaimedJob {
  id: string;
  userId: string;
  featureKey: string;
  idempotencyKey: string;
  status: AIClaimedJobStatus;
  inputPayload: Record<string, unknown>;
  providerId: string | null;
  modelId: string | null;
  providerTaskId: string | null;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseToken: string;
  leaseExpiresAt: string;
}

export interface ClaimAIJobsInput {
  workerId: string;
  leaseSeconds?: number;
  limit?: number;
}

export type AIJobClaimErrorCode =
  | "INVALID_REQUEST"
  | "CLAIM_SERVICE_UNAVAILABLE"
  | "CLAIM_SERVICE_INVALID_RESPONSE";

export class AIJobClaimError extends Error {
  readonly code: AIJobClaimErrorCode;

  constructor(code: AIJobClaimErrorCode) {
    super(code);
    this.name = "AIJobClaimError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<AIClaimedJobStatus>([
  "reserved", "submitted", "processing", "cancel_requested",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseClaimedJob(value: unknown, workerId: string): AIClaimedJob | null {
  if (!isRecord(value) ||
      typeof value.id !== "string" || !UUID.test(value.id) ||
      typeof value.user_id !== "string" || !UUID.test(value.user_id) ||
      typeof value.feature_key !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(value.feature_key) ||
      typeof value.idempotency_key !== "string" ||
      value.idempotency_key.length < 1 || value.idempotency_key.length > 200 ||
      typeof value.status !== "string" || !STATUSES.has(value.status as AIClaimedJobStatus) ||
      !isRecord(value.input_payload) ||
      !nullableString(value.provider_id) ||
      !nullableString(value.model_id) ||
      !nullableString(value.provider_task_id) ||
      !Number.isInteger(value.attempt_count) || (value.attempt_count as number) < 1 ||
      !Number.isInteger(value.max_attempts) || (value.max_attempts as number) < 1 ||
      (value.attempt_count as number) > (value.max_attempts as number) ||
      value.lease_owner !== workerId ||
      typeof value.lease_token !== "string" || !UUID.test(value.lease_token) ||
      typeof value.lease_expires_at !== "string" ||
      !Number.isFinite(Date.parse(value.lease_expires_at))) {
    return null;
  }

  return {
    id: value.id,
    userId: value.user_id,
    featureKey: value.feature_key,
    idempotencyKey: value.idempotency_key,
    status: value.status as AIClaimedJobStatus,
    inputPayload: value.input_payload,
    providerId: value.provider_id,
    modelId: value.model_id,
    providerTaskId: value.provider_task_id,
    attemptCount: value.attempt_count as number,
    maxAttempts: value.max_attempts as number,
    leaseOwner: value.lease_owner,
    leaseToken: value.lease_token,
    leaseExpiresAt: value.lease_expires_at,
  };
}

export async function claimAIJobs(
  client: AIJobClaimRpcClient,
  input: ClaimAIJobsInput,
): Promise<AIClaimedJob[]> {
  const leaseSeconds = input.leaseSeconds ?? 60;
  const limit = input.limit ?? 5;

  if (typeof input.workerId !== "string" ||
      input.workerId.trim().length < 1 ||
      input.workerId.length > 120 ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 900 ||
      !Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new AIJobClaimError("INVALID_REQUEST");
  }

  let data: unknown;
  try {
    const result = await client.rpc("claim_ai_generation_jobs", {
      p_worker_id: input.workerId,
      p_lease_seconds: leaseSeconds,
      p_limit: limit,
    });
    if (result.error) throw new AIJobClaimError("CLAIM_SERVICE_UNAVAILABLE");
    data = result.data;
  } catch (error) {
    if (error instanceof AIJobClaimError) throw error;
    throw new AIJobClaimError("CLAIM_SERVICE_UNAVAILABLE");
  }

  if (!Array.isArray(data) || data.length > limit) {
    throw new AIJobClaimError("CLAIM_SERVICE_INVALID_RESPONSE");
  }

  const jobs: AIClaimedJob[] = [];
  for (const item of data) {
    const job = parseClaimedJob(item, input.workerId);
    if (!job) throw new AIJobClaimError("CLAIM_SERVICE_INVALID_RESPONSE");
    jobs.push(job);
  }
  return jobs;
}
