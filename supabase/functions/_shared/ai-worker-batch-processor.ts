/**
 * Full inert composition boundary for one bounded AI worker batch.
 *
 * This joins the validated atomic claim client, existing single-job
 * dispatcher, and sequential batch runner. The caller must inject an already
 * trusted RPC client and all provider/storage dependencies. No client is
 * created, no schedule or endpoint is registered, and no provider is activated.
 */
import {
  claimAIJobs,
  type AIJobClaimRpcClient,
} from "./ai-job-claim.ts";
import {
  createAIWorkerJobDispatcher,
  type AIWorkerJobDispatcherDependencies,
} from "./ai-worker-job-dispatcher.ts";
import {
  runAIWorkerBatch,
  type AIWorkerBatchRunResult,
  type RunAIWorkerBatchInput,
} from "./ai-worker-batch-runner.ts";

export interface AIWorkerBatchProcessorDependencies {
  claimClient: AIJobClaimRpcClient;
  dispatcher: AIWorkerJobDispatcherDependencies;
}

/**
 * Build a reusable one-batch processor. Each invocation claims at most the
 * requested bounded batch, validates every claimed row, and dispatches jobs
 * sequentially through the existing submission/reconciliation composition.
 */
export function createAIWorkerBatchProcessor(
  dependencies: AIWorkerBatchProcessorDependencies,
): (input: RunAIWorkerBatchInput) => Promise<AIWorkerBatchRunResult> {
  if (!dependencies?.claimClient ||
      typeof dependencies.claimClient.rpc !== "function" ||
      !dependencies.dispatcher) {
    throw new Error("AI worker batch processor dependencies are incomplete");
  }

  const dispatch = createAIWorkerJobDispatcher(dependencies.dispatcher);

  return (input) => runAIWorkerBatch({
    claim: (claimInput) => claimAIJobs(dependencies.claimClient, claimInput),
    dispatch,
  }, input);
}
