/**
 * Lease-fenced single-job submission orchestration.
 *
 * This is an injected execution core, not a deployed worker. Production wiring
 * must supply an approved provider and service-role RPC wrappers explicitly.
 * No provider is registered or activated by this module.
 */
import {
  AIGenerationAdapterError,
  type AIGenerationProviderAdapter,
  type AIGenerationSubmission,
  validateAIGenerationSubmissionResult,
} from "./ai-generation-provider.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";
import { decideAIWorkerExecution } from "./ai-worker-execution-policy.ts";
import type { TransitionAIJobInput } from "./ai-job-transition.ts";
import type { RenewAIJobLeaseResult } from "./ai-job-lease.ts";

export interface AIWorkerOrchestratorDependencies {
  provider: AIGenerationProviderAdapter;
  buildSubmission(job: AIClaimedJob): Promise<AIGenerationSubmission>;
  transition(input: TransitionAIJobInput): Promise<{ jobId: string; status: string }>;
  renewLease(input: { jobId: string; leaseToken: string; leaseSeconds?: number }): Promise<RenewAIJobLeaseResult>;
  finalize(input: {
    jobId: string;
    leaseToken: string;
    nextStatus: "failed" | "cancelled" | "reconciliation_required";
    eventCode: string;
    failureCode?: string;
    providerId?: string;
    modelId?: string;
    providerTaskId?: string;
  }): Promise<unknown>;
  leaseSeconds?: number;
}

export type AIWorkerOrchestratorResult =
  | { outcome: "submitted"; jobId: string; providerTaskId: string }
  | { outcome: "finalized"; jobId: string; status: "cancelled" | "reconciliation_required" | "failed" }
  | { outcome: "requires_reconciliation" | "stopped"; jobId: string; reason: string };

function validProviderMetadata(job: AIClaimedJob): job is AIClaimedJob & {
  providerId: string;
  modelId: string;
} {
  return typeof job.providerId === "string" && job.providerId.length > 0 &&
    typeof job.modelId === "string" && job.modelId.length > 0;
}

function confirmedLeaseRenewal(
  receipt: RenewAIJobLeaseResult,
  jobId: string,
): boolean {
  return receipt.jobId === jobId &&
    receipt.status === "submitted" &&
    Number.isFinite(Date.parse(receipt.leaseExpiresAt)) &&
    Date.parse(receipt.leaseExpiresAt) > Date.now();
}

/**
 * Processes only a newly reserved job. Existing provider tasks and active
 * states are deliberately handed to a future reconciliation path.
 */
export async function submitReservedAIJob(
  job: AIClaimedJob,
  dependencies: AIWorkerOrchestratorDependencies,
  now = Date.now(),
): Promise<AIWorkerOrchestratorResult> {
  const decision = decideAIWorkerExecution({
    status: job.status,
    leaseToken: job.leaseToken,
    leaseExpiresAt: job.leaseExpiresAt,
    providerTaskId: job.providerTaskId,
    now,
  });

  if (decision === "stop_invalid_or_expired_lease") {
    return { outcome: "stopped", jobId: job.id, reason: "invalid_or_expired_lease" };
  }
  if (decision === "finalize_cancellation_without_provider") {
    await dependencies.finalize({
      jobId: job.id, leaseToken: job.leaseToken, nextStatus: "cancelled",
      eventCode: "worker.cancelled_without_provider",
    });
    return { outcome: "finalized", jobId: job.id, status: "cancelled" };
  }
  if (decision !== "prepare_submission") {
    return {
      outcome: "requires_reconciliation",
      jobId: job.id,
      reason: decision,
    };
  }
  if (!validProviderMetadata(job) || dependencies.provider.providerId !== job.providerId) {
    return { outcome: "stopped", jobId: job.id, reason: "provider_selection_unavailable" };
  }

  let submission: AIGenerationSubmission;
  try {
    submission = await dependencies.buildSubmission(job);
  } catch {
    await dependencies.finalize({
      jobId: job.id, leaseToken: job.leaseToken, nextStatus: "failed",
      eventCode: "worker.submission_build_failed", failureCode: "SUBMISSION_BUILD_FAILED",
      providerId: job.providerId, modelId: job.modelId,
    });
    return { outcome: "finalized", jobId: job.id, status: "failed" };
  }

  // Persist submitted before the external side effect. If this fails, the
  // provider is never called.
  try {
    await dependencies.transition({
      jobId: job.id,
      leaseToken: job.leaseToken,
      currentStatus: "reserved",
      nextStatus: "submitted",
      eventCode: "worker.submission_intent_recorded",
      providerId: job.providerId,
      modelId: job.modelId,
    });
  } catch {
    return { outcome: "stopped", jobId: job.id, reason: "submission_intent_not_persisted" };
  }

  try {
    const receipt = await dependencies.renewLease({
      jobId: job.id, leaseToken: job.leaseToken,
      leaseSeconds: dependencies.leaseSeconds ?? 60,
    });
    if (!confirmedLeaseRenewal(receipt, job.id)) {
      return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_provider" };
    }
  } catch {
    return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_provider" };
  }

  let result;
  try {
    result = validateAIGenerationSubmissionResult(
      await dependencies.provider.submit(submission),
    );
  } catch (error) {
    if (error instanceof AIGenerationAdapterError && error.safeToRetrySubmission) {
      await dependencies.finalize({
        jobId: job.id, leaseToken: job.leaseToken, nextStatus: "failed",
        eventCode: "worker.provider_confirmed_not_accepted",
        failureCode: "PROVIDER_REJECTED_BEFORE_ACCEPTANCE",
        providerId: job.providerId, modelId: job.modelId,
      });
      return { outcome: "finalized", jobId: job.id, status: "failed" };
    }

    await dependencies.finalize({
      jobId: job.id, leaseToken: job.leaseToken,
      nextStatus: "reconciliation_required",
      eventCode: "worker.provider_submission_uncertain",
      failureCode: "PROVIDER_SUBMISSION_UNCERTAIN",
      providerId: job.providerId, modelId: job.modelId,
    });
    return { outcome: "finalized", jobId: job.id, status: "reconciliation_required" };
  }

  if (result.outcome === "uncertain") {
    await dependencies.finalize({
      jobId: job.id, leaseToken: job.leaseToken,
      nextStatus: "reconciliation_required",
      eventCode: "worker.provider_acknowledgement_uncertain",
      failureCode: "PROVIDER_SUBMISSION_UNCERTAIN",
      providerId: job.providerId, modelId: job.modelId,
    });
    return { outcome: "finalized", jobId: job.id, status: "reconciliation_required" };
  }

  // The provider accepted the request. Persist its task ID before returning;
  // if persistence fails, quarantine rather than risk a duplicate submission.
  try {
    await dependencies.transition({
      jobId: job.id, leaseToken: job.leaseToken,
      currentStatus: "submitted", nextStatus: "processing",
      eventCode: "worker.provider_task_recorded",
      providerId: job.providerId, modelId: job.modelId,
      providerTaskId: result.providerTaskId,
    });
  } catch {
    await dependencies.finalize({
      jobId: job.id, leaseToken: job.leaseToken,
      nextStatus: "reconciliation_required",
      eventCode: "worker.provider_task_persistence_uncertain",
      failureCode: "PROVIDER_TASK_PERSISTENCE_UNCERTAIN",
      providerId: job.providerId, modelId: job.modelId,
      providerTaskId: result.providerTaskId,
    });
    return { outcome: "finalized", jobId: job.id, status: "reconciliation_required" };
  }

  return { outcome: "submitted", jobId: job.id, providerTaskId: result.providerTaskId };
}
