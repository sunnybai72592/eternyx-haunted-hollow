/**
 * Lease-fenced reconciliation for jobs with an already-persisted provider task.
 *
 * This injected core never submits or resubmits work. It only inspects the
 * existing provider task, requests cancellation when applicable, and delegates
 * successful output materialization to an idempotent trusted callback.
 * It is not wired to a deployed worker or a live provider.
 */
import {
  AIGenerationAdapterError,
  type AIGenerationProviderAdapter,
  type AIGenerationProviderSnapshot,
  validateAIGenerationSnapshot,
} from "./ai-generation-provider.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";
import type { AIJobTransitionInput } from "./ai-job-transition.ts";
import type { FinalizeAIGenerationJobInput } from "./ai-job-finalization.ts";

export interface AIReconciledOutput {
  /** Safe relative object key in the user's private output storage. */
  outputObjectKey: string;
  /** Final charge calculated by the approved feature pricing policy. */
  finalCredits: number;
}

export interface AIWorkerReconciliationDependencies {
  provider: AIGenerationProviderAdapter;
  renewLease(input: { jobId: string; leaseToken: string; leaseSeconds?: number }): Promise<unknown>;
  transition(input: AIJobTransitionInput): Promise<{ jobId: string; status: string }>;
  finalize(input: FinalizeAIGenerationJobInput): Promise<unknown>;
  /**
   * Must be idempotent by job ID, validate the provider reference, and write
   * only to the authenticated user's private output namespace.
   */
  materializeSuccess(
    job: AIClaimedJob,
    snapshot: AIGenerationProviderSnapshot,
  ): Promise<AIReconciledOutput>;
  leaseSeconds?: number;
}

export type AIWorkerReconciliationResult =
  | { outcome: "completed"; jobId: string; status: "succeeded" | "failed" | "cancelled" }
  | { outcome: "pending"; jobId: string; status: "submitted" | "processing" | "cancel_requested" }
  | { outcome: "retry_later"; jobId: string; reason: string }
  | { outcome: "quarantined"; jobId: string; reason: string }
  | { outcome: "stopped"; jobId: string; reason: string };

function hasExistingTask(job: AIClaimedJob): boolean {
  return typeof job.providerTaskId === "string" && job.providerTaskId.length > 0;
}

function validProviderSelection(job: AIClaimedJob, provider: AIGenerationProviderAdapter): boolean {
  return typeof job.providerId === "string" &&
    typeof job.modelId === "string" &&
    job.providerId === provider.providerId;
}

async function renew(
  job: AIClaimedJob,
  dependencies: AIWorkerReconciliationDependencies,
): Promise<void> {
  await dependencies.renewLease({
    jobId: job.id,
    leaseToken: job.leaseToken,
    leaseSeconds: dependencies.leaseSeconds ?? 60,
  });
}

async function quarantine(
  job: AIClaimedJob,
  dependencies: AIWorkerReconciliationDependencies,
  failureCode: string,
  reason: string,
): Promise<AIWorkerReconciliationResult> {
  try {
    await dependencies.finalize({
      jobId: job.id,
      leaseToken: job.leaseToken,
      nextStatus: "reconciliation_required",
      eventCode: "worker.provider_reconciliation_quarantined",
      failureCode,
      providerId: job.providerId ?? undefined,
      modelId: job.modelId ?? undefined,
      providerTaskId: job.providerTaskId ?? undefined,
    });
    return { outcome: "quarantined", jobId: job.id, reason };
  } catch {
    return { outcome: "retry_later", jobId: job.id, reason: "quarantine_finalization_unavailable" };
  }
}

async function completeSnapshot(
  job: AIClaimedJob,
  snapshot: AIGenerationProviderSnapshot,
  dependencies: AIWorkerReconciliationDependencies,
): Promise<AIWorkerReconciliationResult> {
  if (snapshot.state === "succeeded") {
    let output: AIReconciledOutput;
    try {
      output = await dependencies.materializeSuccess(job, snapshot);
    } catch {
      // Do not mark success or release/settle the credit hold when output
      // materialization is incomplete. A later lease can retry this callback.
      return { outcome: "retry_later", jobId: job.id, reason: "output_materialization_unavailable" };
    }
    try {
      await dependencies.finalize({
        jobId: job.id,
        leaseToken: job.leaseToken,
        nextStatus: "succeeded",
        eventCode: "worker.provider_success_materialized",
        outputObjectKey: output.outputObjectKey,
        finalCredits: output.finalCredits,
        providerId: job.providerId ?? undefined,
        modelId: job.modelId ?? undefined,
        providerTaskId: job.providerTaskId ?? undefined,
      });
      return { outcome: "completed", jobId: job.id, status: "succeeded" };
    } catch {
      return { outcome: "retry_later", jobId: job.id, reason: "success_finalization_unavailable" };
    }
  }

  if (snapshot.state === "failed") {
    try {
      await dependencies.finalize({
        jobId: job.id,
        leaseToken: job.leaseToken,
        nextStatus: "failed",
        eventCode: "worker.provider_failed",
        failureCode: snapshot.failureCode!,
        providerId: job.providerId ?? undefined,
        modelId: job.modelId ?? undefined,
        providerTaskId: job.providerTaskId ?? undefined,
      });
      return { outcome: "completed", jobId: job.id, status: "failed" };
    } catch {
      return { outcome: "retry_later", jobId: job.id, reason: "failure_finalization_unavailable" };
    }
  }

  if (snapshot.state === "cancelled") {
    try {
      await dependencies.finalize({
        jobId: job.id,
        leaseToken: job.leaseToken,
        nextStatus: "cancelled",
        eventCode: "worker.provider_cancelled",
        providerId: job.providerId ?? undefined,
        modelId: job.modelId ?? undefined,
        providerTaskId: job.providerTaskId ?? undefined,
      });
      return { outcome: "completed", jobId: job.id, status: "cancelled" };
    } catch {
      return { outcome: "retry_later", jobId: job.id, reason: "cancellation_finalization_unavailable" };
    }
  }

  if (job.status === "submitted" && snapshot.state === "processing") {
    try {
      await dependencies.transition({
        jobId: job.id,
        leaseToken: job.leaseToken,
        currentStatus: "submitted",
        nextStatus: "processing",
        eventCode: "worker.provider_processing_confirmed",
        providerId: job.providerId ?? undefined,
        modelId: job.modelId ?? undefined,
        providerTaskId: job.providerTaskId ?? undefined,
      });
    } catch {
      return { outcome: "retry_later", jobId: job.id, reason: "processing_transition_unavailable" };
    }
    return { outcome: "pending", jobId: job.id, status: "processing" };
  }

  return { outcome: "pending", jobId: job.id, status: job.status };
}

/**
 * Reconcile a claimed submitted/processing/cancel_requested job that already
 * has a provider task ID. No code path calls provider.submit().
 */
export async function reconcileClaimedAIJob(
  job: AIClaimedJob,
  dependencies: AIWorkerReconciliationDependencies,
): Promise<AIWorkerReconciliationResult> {
  if (!hasExistingTask(job) ||
      !["submitted", "processing", "cancel_requested"].includes(job.status)) {
    return { outcome: "stopped", jobId: job.id, reason: "job_is_not_reconcilable" };
  }
  if (!validProviderSelection(job, dependencies.provider)) {
    return quarantine(job, dependencies, "PROVIDER_SELECTION_MISMATCH", "provider_selection_mismatch");
  }

  try {
    await renew(job, dependencies);
  } catch {
    return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_provider_read" };
  }

  if (job.status === "cancel_requested") {
    // Cancellation acceptance is not completion. Always inspect the task state.
    try {
      await dependencies.provider.cancel(job.providerTaskId!);
    } catch {
      // A cancellation request can be ambiguous; the status read below decides.
    }
    try {
      await renew(job, dependencies);
    } catch {
      return { outcome: "stopped", jobId: job.id, reason: "lease_not_confirmed_before_cancel_status_read" };
    }
  }

  let rawSnapshot: AIGenerationProviderSnapshot;
  try {
    rawSnapshot = await dependencies.provider.getStatus(job.providerTaskId!);
  } catch {
    // Provider outages and network errors are not proof of terminal failure.
    return { outcome: "retry_later", jobId: job.id, reason: "provider_status_unavailable" };
  }

  let snapshot: AIGenerationProviderSnapshot;
  try {
    snapshot = validateAIGenerationSnapshot(rawSnapshot);
  } catch (error) {
    if (error instanceof AIGenerationAdapterError) {
      return quarantine(job, dependencies, "PROVIDER_STATUS_INVALID", "provider_status_invalid");
    }
    return { outcome: "retry_later", jobId: job.id, reason: "provider_status_validation_unavailable" };
  }

  if (snapshot.providerTaskId !== job.providerTaskId) {
    return quarantine(job, dependencies, "PROVIDER_TASK_MISMATCH", "provider_task_mismatch");
  }

  return completeSnapshot(job, snapshot, dependencies);
}
