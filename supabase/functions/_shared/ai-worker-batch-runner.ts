/**
 * Bounded, sequential batch runner for already-composed AI worker dependencies.
 *
 * This is an inert orchestration boundary: callers must inject the atomic
 * claim function and the single-job dispatcher. It creates no clients,
 * schedules no work, activates no provider, and does not deploy itself.
 *
 * A dispatch exception is isolated to that job. The runner deliberately does
 * not retry or release its lease; the existing expiry/recovery flow remains
 * responsible for safely reclaiming work whose outcome is uncertain.
 */
import type { AIClaimedJob, ClaimAIJobsInput } from "./ai-job-claim.ts";
import type { AIWorkerOrchestratorResult } from "./ai-worker-orchestrator.ts";
import type { AIWorkerReconciliationResult } from "./ai-worker-reconciliation.ts";

export type AIWorkerBatchDispatchResult =
  | AIWorkerOrchestratorResult
  | AIWorkerReconciliationResult;

export interface AIWorkerBatchRunnerDependencies {
  claim(input: ClaimAIJobsInput): Promise<AIClaimedJob[]>;
  dispatch(job: AIClaimedJob): Promise<AIWorkerBatchDispatchResult>;
}

export interface RunAIWorkerBatchInput {
  workerId: string;
  leaseSeconds?: number;
  limit?: number;
}

export type AIWorkerBatchJobResult =
  | { jobId: string; outcome: "dispatched"; result: AIWorkerBatchDispatchResult }
  | { jobId: string; outcome: "dispatch_error" };

export interface AIWorkerBatchRunResult {
  workerId: string;
  claimedCount: number;
  attemptedCount: number;
  dispatchErrorCount: number;
  jobs: AIWorkerBatchJobResult[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_STATUSES = new Set(["reserved", "submitted", "processing", "cancel_requested"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validClaimedJob(job: unknown, workerId: string): job is AIClaimedJob {
  if (!isRecord(job) ||
      typeof job.id !== "string" || !UUID.test(job.id) ||
      typeof job.userId !== "string" || !UUID.test(job.userId) ||
      typeof job.featureKey !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(job.featureKey) ||
      typeof job.idempotencyKey !== "string" ||
      job.idempotencyKey.length < 1 || job.idempotencyKey.length > 200 ||
      typeof job.status !== "string" || !JOB_STATUSES.has(job.status) ||
      !isRecord(job.inputPayload) ||
      !(job.providerId === null || typeof job.providerId === "string") ||
      !(job.modelId === null || typeof job.modelId === "string") ||
      !(job.providerTaskId === null || typeof job.providerTaskId === "string") ||
      !Number.isInteger(job.attemptCount) || (job.attemptCount as number) < 1 ||
      !Number.isInteger(job.maxAttempts) || (job.maxAttempts as number) < 1 ||
      (job.attemptCount as number) > (job.maxAttempts as number) ||
      job.leaseOwner !== workerId ||
      typeof job.leaseToken !== "string" || !UUID.test(job.leaseToken) ||
      typeof job.leaseExpiresAt !== "string" ||
      !Number.isFinite(Date.parse(job.leaseExpiresAt)) ||
      Date.parse(job.leaseExpiresAt) <= Date.now()) {
    return false;
  }
  return true;
}

function validInput(input: RunAIWorkerBatchInput): boolean {
  const leaseSeconds = input.leaseSeconds ?? 60;
  const limit = input.limit ?? 5;
  return typeof input.workerId === "string" &&
    input.workerId.trim().length > 0 &&
    input.workerId.length <= 120 &&
    Number.isInteger(leaseSeconds) && leaseSeconds >= 10 && leaseSeconds <= 900 &&
    Number.isInteger(limit) && limit >= 1 && limit <= 25;
}

/**
 * Claim and process at most one bounded batch, sequentially.
 * Claim failures reject the run; individual dispatch failures do not stop
 * later claimed jobs from being attempted.
 */
export async function runAIWorkerBatch(
  dependencies: AIWorkerBatchRunnerDependencies,
  input: RunAIWorkerBatchInput,
): Promise<AIWorkerBatchRunResult> {
  if (typeof dependencies?.claim !== "function" ||
      typeof dependencies?.dispatch !== "function" ||
      !input || !validInput(input)) {
    throw new Error("AI worker batch runner request is invalid");
  }

  const claimInput: ClaimAIJobsInput = {
    workerId: input.workerId,
    leaseSeconds: input.leaseSeconds ?? 60,
    limit: input.limit ?? 5,
  };
  const claimed = await dependencies.claim(claimInput);
  if (!Array.isArray(claimed) || claimed.length > claimInput.limit!) {
    throw new Error("AI worker claim returned an invalid batch");
  }

  const seenJobIds = new Set<string>();
  for (const job of claimed) {
    if (!validClaimedJob(job, input.workerId)) {
      throw new Error("AI worker claim returned an invalid batch");
    }
    const normalizedJobId = job.id.toLowerCase();
    if (seenJobIds.has(normalizedJobId)) {
      throw new Error("AI worker claim returned an invalid batch");
    }
    seenJobIds.add(normalizedJobId);
  }

  const jobs: AIWorkerBatchJobResult[] = [];
  let dispatchErrorCount = 0;

  for (const job of claimed) {
    try {
      const result = await dependencies.dispatch(job);
      jobs.push({ jobId: job.id, outcome: "dispatched", result });
    } catch {
      dispatchErrorCount += 1;
      jobs.push({ jobId: job.id, outcome: "dispatch_error" });
    }
  }

  return {
    workerId: input.workerId,
    claimedCount: claimed.length,
    attemptedCount: jobs.length,
    dispatchErrorCount,
    jobs,
  };
}
