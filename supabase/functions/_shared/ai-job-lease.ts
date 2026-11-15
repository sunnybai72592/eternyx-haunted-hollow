/**
 * Trusted server-side helper for bounded AI worker lease renewal.
 * Call only from a worker holding the current lease token.
 */
export interface AIJobLeaseRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type AIJobLeaseStatus = "reserved" | "submitted" | "processing" | "cancel_requested";

export interface RenewAIJobLeaseInput {
  jobId: string;
  leaseToken: string;
  leaseSeconds?: number;
}

export interface RenewAIJobLeaseResult {
  jobId: string;
  status: AIJobLeaseStatus;
  leaseExpiresAt: string;
}

export type AIJobLeaseErrorCode =
  | "INVALID_REQUEST"
  | "LEASE_RENEWAL_REJECTED"
  | "LEASE_SERVICE_UNAVAILABLE"
  | "LEASE_SERVICE_INVALID_RESPONSE";

export class AIJobLeaseError extends Error {
  readonly code: AIJobLeaseErrorCode;

  constructor(code: AIJobLeaseErrorCode) {
    super(code);
    this.name = "AIJobLeaseError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set<AIJobLeaseStatus>([
  "reserved", "submitted", "processing", "cancel_requested",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function renewAIJobLease(
  client: AIJobLeaseRpcClient,
  input: RenewAIJobLeaseInput,
): Promise<RenewAIJobLeaseResult> {
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!UUID.test(input.jobId) || !UUID.test(input.leaseToken) ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 10 || leaseSeconds > 900) {
    throw new AIJobLeaseError("INVALID_REQUEST");
  }

  let data: unknown;
  try {
    const result = await client.rpc("renew_ai_generation_job_lease", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_lease_seconds: leaseSeconds,
    });
    if (result.error) {
      const message = (result.error.message ?? "").toLowerCase();
      if (message.includes("lease") || message.includes("state does not permit")) {
        throw new AIJobLeaseError("LEASE_RENEWAL_REJECTED");
      }
      throw new AIJobLeaseError("LEASE_SERVICE_UNAVAILABLE");
    }
    data = result.data;
  } catch (error) {
    if (error instanceof AIJobLeaseError) throw error;
    throw new AIJobLeaseError("LEASE_SERVICE_UNAVAILABLE");
  }

  if (!isRecord(data) || data.job_id !== input.jobId ||
      typeof data.status !== "string" || !STATUSES.has(data.status as AIJobLeaseStatus) ||
      typeof data.lease_expires_at !== "string" ||
      !Number.isFinite(Date.parse(data.lease_expires_at))) {
    throw new AIJobLeaseError("LEASE_SERVICE_INVALID_RESPONSE");
  }

  return {
    jobId: data.job_id,
    status: data.status as AIJobLeaseStatus,
    leaseExpiresAt: data.lease_expires_at,
  };
}
