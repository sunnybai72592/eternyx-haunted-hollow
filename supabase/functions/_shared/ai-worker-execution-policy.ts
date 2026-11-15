/**
 * Pure safety policy for a future AI worker.
 *
 * This module does not call providers or mutate jobs. A worker must still use
 * the lease-fenced transition RPC before any external side effect.
 */
export type AIWorkerObservedStatus =
  | "reserved"
  | "submitted"
  | "processing"
  | "cancel_requested";

export type AIWorkerExecutionDecision =
  | "stop_invalid_or_expired_lease"
  | "prepare_submission"
  | "reconcile_existing_provider_task"
  | "quarantine_uncertain_submission"
  | "finalize_cancellation_without_provider"
  | "reconcile_cancellation_with_provider";

export interface AIWorkerExecutionPolicyInput {
  status: AIWorkerObservedStatus;
  leaseToken: string;
  leaseExpiresAt: string;
  providerTaskId: string | null;
  now?: number;
}

/**
 * Decide the only safe next step from a validated claim snapshot.
 *
 * "prepare_submission" is deliberately not permission to call a provider:
 * the worker must first persist the submitted transition with the current
 * lease token. Submitted/processing jobs are never blindly resubmitted.
 */
export function decideAIWorkerExecution(
  input: AIWorkerExecutionPolicyInput,
): AIWorkerExecutionDecision {
  const now = input.now ?? Date.now();
  const expiresAt = Date.parse(input.leaseExpiresAt);

  if (typeof input.leaseToken !== "string" || input.leaseToken.trim().length === 0 ||
      !Number.isFinite(expiresAt) || expiresAt <= now) {
    return "stop_invalid_or_expired_lease";
  }

  const hasProviderTask = typeof input.providerTaskId === "string" &&
    input.providerTaskId.trim().length > 0;

  switch (input.status) {
    case "reserved":
      return hasProviderTask
        ? "reconcile_existing_provider_task"
        : "prepare_submission";
    case "submitted":
    case "processing":
      return hasProviderTask
        ? "reconcile_existing_provider_task"
        : "quarantine_uncertain_submission";
    case "cancel_requested":
      return hasProviderTask
        ? "reconcile_cancellation_with_provider"
        : "finalize_cancellation_without_provider";
    default:
      return "stop_invalid_or_expired_lease";
  }
}
