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
    if (!job || typeof job.id !== "string" || job.id.trim().length === 0) {
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
