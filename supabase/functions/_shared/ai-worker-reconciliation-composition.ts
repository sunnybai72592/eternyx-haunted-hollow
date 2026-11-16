/**
 * Composition boundary for the injected AI worker reconciliation core.
 *
 * This binds the validated private-output materializer to reconciliation
 * while leaving provider access, lease RPCs, transitions, and finalization
 * explicitly injected. It does not create a worker endpoint or activate work.
 */
import {
  reconcileClaimedAIJob,
  type AIWorkerReconciliationDependencies,
  type AIWorkerReconciliationResult,
} from "./ai-worker-reconciliation.ts";
import {
  createAIWorkerOutputMaterializer,
  type AIWorkerOutputMaterializerDependencies,
} from "./ai-worker-output-materializer.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";

export interface AIWorkerReconciliationCompositionDependencies
  extends Omit<AIWorkerReconciliationDependencies, "materializeSuccess"> {
  outputMaterializer: AIWorkerOutputMaterializerDependencies;
}

/**
 * Build a single-job reconciliation callback with the private output
 * materializer already bound. The returned function is still inert until
 * an explicitly constructed caller invokes it with a claimed job.
 */
export function createAIWorkerReconciliation(
  dependencies: AIWorkerReconciliationCompositionDependencies,
): (job: AIClaimedJob) => Promise<AIWorkerReconciliationResult> {
  if (!dependencies || !dependencies.outputMaterializer) {
    throw new Error("AI worker reconciliation composition dependencies are incomplete");
  }

  const { outputMaterializer, ...reconciliationDependencies } = dependencies;
  const materializeSuccess = createAIWorkerOutputMaterializer(outputMaterializer);

  return (job) => reconcileClaimedAIJob(job, {
    ...reconciliationDependencies,
    materializeSuccess,
  });
}
