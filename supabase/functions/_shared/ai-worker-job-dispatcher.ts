/**
 * Inert composition boundary for dispatching claimed AI jobs.
 *
 * Newly reserved jobs without provider tasks go through the submission core.
 * Jobs with an existing provider task go through lease-fenced reconciliation.
 * Cancellation requests without a provider task use the submission core's
 * provider-free cancellation finalization path.
 *
 * This module does not claim jobs, create clients, schedule work, or activate
 * providers. Callers must explicitly supply all dependencies.
 */
import {
  submitReservedAIJob,
  type AIWorkerOrchestratorDependencies,
  type AIWorkerOrchestratorResult,
} from "./ai-worker-orchestrator.ts";
import {
  createAIWorkerReconciliation,
  type AIWorkerReconciliationCompositionDependencies,
} from "./ai-worker-reconciliation-composition.ts";
import type { AIWorkerReconciliationResult } from "./ai-worker-reconciliation.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";

export interface AIWorkerJobDispatcherDependencies {
  submission: AIWorkerOrchestratorDependencies;
  reconciliation: Omit<AIWorkerReconciliationCompositionDependencies, "provider">;
}

/**
 * Construct a dispatcher for one already-claimed job at a time.
 * The same explicitly supplied provider adapter is used by both paths.
 */
export function createAIWorkerJobDispatcher(
  dependencies: AIWorkerJobDispatcherDependencies,
): (job: AIClaimedJob) => Promise<AIWorkerOrchestratorResult | AIWorkerReconciliationResult> {
  if (!dependencies?.submission?.provider ||
      !dependencies.reconciliation?.outputMaterializer) {
    throw new Error("AI worker job dispatcher dependencies are incomplete");
  }

  const reconcile = createAIWorkerReconciliation({
    ...dependencies.reconciliation,
    provider: dependencies.submission.provider,
  });

  return (job) => {
    const hasProviderTask = typeof job.providerTaskId === "string" &&
      job.providerTaskId.trim().length > 0;

    if ((job.status === "reserved" && !hasProviderTask) ||
        (job.status === "cancel_requested" && !hasProviderTask)) {
      return submitReservedAIJob(job, dependencies.submission);
    }

    return reconcile(job);
  };
}
