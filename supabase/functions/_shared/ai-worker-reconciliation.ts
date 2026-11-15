/**
 * Lease-fenced reconciliation for AI jobs that already have a provider task.
 *
 * Provider access, output materialization and credit settlement are injected.
 * This module registers no provider and performs no deployment or activation.
 */
import {
  type AIGenerationProviderAdapter,
  type AIGenerationProviderSnapshot,
  validateAIGenerationSnapshot,
} from "./ai-generation-provider.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";
import type { RenewAIJobLeaseResult } from "./ai-job-lease.ts";
import { decideAIWorkerExecution } from "./ai-worker-execution-policy.ts";
import type { TransitionAIJobInput } from "./ai-job-transition.ts";

export interface AIWorkerReconciliationDependencies {
  provider: AIGenerationProviderAdapter;
  renewLease(input: { jobId: string; leaseToken: string; leaseSeconds?: number }): Promise<RenewAIJobLeaseResult>;
  transition(input: TransitionAIJobInput): Promise<{ jobId: string; status: string }>;
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
  /** Materialize output into user-owned storage and atomically settle central credits. */
  completeSuccess(input: {
    job: AIClaimedJob;
    providerSnapshot: AIGenerationProviderSnapshot;
  }): Promise<unknown>;
  leaseSeconds?: number;
}

export type AIWorkerReconciliationResult =
  | { outcome: "updated"; jobId: string; status: "processing" }
  | { outcome: "pending"; jobId: string; status: "submitted" | "processing" | "cancel_requested" }
  | { outcome: "finalized"; jobId: string; status: "failed" | "cancelled" | "succeeded" }
  | { outcome: "requires_submission" | "requires_reconciliation" | "stopped"; jobId: string; reason: string };

function validProviderMetadata(job: AIClaimedJob): job is AIClaimedJob & {
  providerId: string;
  modelId: string;
  providerTaskId: string;
} {
  return typeof job.providerId === "string" && job.providerId.length > 0 &&
    typeof job.modelId === "string" && job.modelId.length > 0 &&
    typeof job.providerTaskId === "string" && job.providerTaskId.length > 0;
}

async function renewBeforeProvider(
  job: AIClaimedJob,
  dependencies: AIWorkerReconciliationDependencies,
  now: number,
): Promise<boolean> {
  try {
    const lease = await dependencies.renewLease({
      jobId: job.id,
      leaseToken: job.leaseToken,
      leaseSeconds: dependencies.leaseSeconds ?? 60,
    });
    return lease.jobId === job.id &&
      Number.isFinite(Date.parse(lease.leaseExpiresAt)) &&
      Date.parse(lease.leaseExpiresAt) > now;
  } catch {
    return false;
  }
}

async function finalizeFailure(
  job: AIClaimedJob & { providerId: string; modelId: string; providerTaskId: string },
  dependencies: AIWorkerReconciliationDependencies,
  failureCode: string,
  eventCode: string,
): Promise<AIWorkerReconciliationResult> {
  await dependencies.finalize({
    jobId: job.id,
    leaseToken: job.leaseToken,
    nextStatus: "failed",
    eventCode,
    failureCode,
    providerId: job.providerId,
    modelId: job.modelId,
    providerTaskId: job.providerTaskId,
  });
  return { outcome: "finalized", jobId: job.id, status: "failed" };
}

/** Reconciles one claimed job; it never submits a new provider generation. */
export async function reconcileAIJob(
  job: AIClaimedJob,
  dependencies: AIWorkerReconciliationDependencies,
  now = Date.now(),
): Promise<AIWorkerReconciliationResult> {
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
  if (decision === "prepare_submission") {
    return { outcome: "requires_submission", jobId: job.id, reason: "reserved_without_provider_task" };
  }
  if (decision === "quarantine_uncertain_submission") {
    return { outcome: "requires_reconciliation", jobId: job.id, reason: "submission_outcome_uncertain" };
  }
  if (decision === "finalize_cancellation_without_provider") {
    await dependencies.finalize({
      jobId: job.id,
      leaseToken: job.leaseToken,
      nextStatus: "cancelled",
      eventCode: "worker.cancelled_without_provider",
    });
    return { outcome: "finalized", jobId: job.id, status: "cancelled" };
  }
  if (!validProviderMetadata(job) || dependencies.provider.providerId !== job.providerId) {
    return { outcome: "stopped", jobId: job.id, reason: "provider_selection_unavailable" };
  }

  const cancellationRequested = decision === "reconcile_cancellation_with_provider";
  if (cancellationRequested) {
    if (!await renewBeforeProvider(job, dependencies, now)) {
      return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_cancel" };
    }
    try {
      // "accepted" means the provider accepted the cancellation request, not
      // that the generation is already cancelled. Always verify with getStatus.
      await dependencies.provider.cancel(job.providerTaskId);
    } catch {
      // Cancellation may have reached the provider despite a lost response.
      // A fresh status read below determines the authoritative provider state.
    }
  }

  if (!await renewBeforeProvider(job, dependencies, now)) {
    return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_status" };
  }

  let snapshot: AIGenerationProviderSnapshot;
  try {
    snapshot = validateAIGenerationSnapshot(
      await dependencies.provider.getStatus(job.providerTaskId),
    );
  } catch {
    // A status-read failure is transient/ambiguous, not proof of job failure.
    // Keep the durable task identity and let lease recovery retry later.
    return { outcome: "stopped", jobId: job.id, reason: "provider_status_unavailable" };
  }

  if (snapshot.providerTaskId !== job.providerTaskId) {
    return { outcome: "requires_reconciliation", jobId: job.id, reason: "provider_task_identity_mismatch" };
  }

  if (snapshot.state === "succeeded") {
    try {
      await dependencies.completeSuccess({ job, providerSnapshot: snapshot });
      return { outcome: "finalized", jobId: job.id, status: "succeeded" };
    } catch {
      // Output transfer or atomic credit settlement did not complete. Do not
      // mark success or release the reservation; reconciliation must retry.
      return { outcome: "stopped", jobId: job.id, reason: "success_materialization_or_settlement_incomplete" };
    }
  }

  if (snapshot.state === "failed") {
    return finalizeFailure(
      job, dependencies,
      snapshot.failureCode ?? "PROVIDER_GENERATION_FAILED",
      "worker.provider_generation_failed",
    );
  }

  if (snapshot.state === "cancelled") {
    await dependencies.finalize({
      jobId: job.id,
      leaseToken: job.leaseToken,
      nextStatus: "cancelled",
      eventCode: "worker.provider_cancellation_confirmed",
      providerId: job.providerId,
      modelId: job.modelId,
      providerTaskId: job.providerTaskId,
    });
    return { outcome: "finalized", jobId: job.id, status: "cancelled" };
  }

  if (cancellationRequested) {
    return { outcome: "pending", jobId: job.id, status: "cancel_requested" };
  }

  if (snapshot.state === "processing" && job.status === "submitted") {
    try {
      await dependencies.transition({
        jobId: job.id,
        leaseToken: job.leaseToken,
        currentStatus: "submitted",
        nextStatus: "processing",
        eventCode: "worker.provider_processing_confirmed",
        providerId: job.providerId,
        modelId: job.modelId,
        providerTaskId: job.providerTaskId,
      });
      return { outcome: "updated", jobId: job.id, status: "processing" };
    } catch {
      return { outcome: "stopped", jobId: job.id, reason: "processing_transition_failed" };
    }
  }

  return { outcome: "pending", jobId: job.id, status: job.status as "submitted" | "processing" };
}
