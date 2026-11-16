/**
 * Composition boundary for trusted AI output materialization.
 *
 * This binds the validated materializer to the create-only private Supabase
 * Storage adapter while keeping provider download and central credit pricing
 * explicitly injected. It does not create a Supabase client, fetch arbitrary
 * URLs, register a provider, or activate a worker.
 */
import {
  materializeAIProviderOutput,
  type AIOutputMaterializationDependencies,
  type AIProviderOutput,
  type AIGenerationOutputContentType,
} from "./ai-output-materialization.ts";
import {
  SupabaseAIOutputStorage,
  type SupabasePrivateStorageClient,
} from "./ai-output-storage-supabase.ts";
import type { AIClaimedJob } from "./ai-job-claim.ts";
import type { AIGenerationProviderSnapshot } from "./ai-generation-provider.ts";
import type { AIReconciledOutput } from "./ai-worker-reconciliation.ts";

export interface AIWorkerOutputMaterializerDependencies {
  /** A trusted server-side client scoped to private Storage access. */
  storageClient: SupabasePrivateStorageClient;
  /** Provider-specific implementation must resolve only approved opaque refs. */
  downloadProviderOutput(input: {
    providerId: string;
    providerTaskId: string;
    outputReference: string;
  }): Promise<AIProviderOutput>;
  /** Must use the existing central feature/model pricing policy. */
  calculateFinalCredits(
    job: AIClaimedJob,
    output: { contentType: AIGenerationOutputContentType; size: number; sha256: string },
  ): Promise<number>;
  /** Explicit approved output-size policy; no default or invented limit. */
  maxBytes: number;
}

export type AIWorkerLeaseConfirmation = () => Promise<void>;

/**
 * Create the reconciliation callback expected by reconcileClaimedAIJob.
 * The callback receives the worker's fresh lease guard and passes it through
 * to the materializer, which invokes it after provider download and directly
 * before the create-only private Storage write.
 */
export function createAIWorkerOutputMaterializer(
  dependencies: AIWorkerOutputMaterializerDependencies,
): (
  job: AIClaimedJob,
  snapshot: AIGenerationProviderSnapshot,
  confirmLease: AIWorkerLeaseConfirmation,
) => Promise<AIReconciledOutput> {
  if (!dependencies ||
      typeof dependencies.downloadProviderOutput !== "function" ||
      typeof dependencies.calculateFinalCredits !== "function" ||
      !Number.isSafeInteger(dependencies.maxBytes) ||
      dependencies.maxBytes < 1 ||
      !dependencies.storageClient?.storage) {
    throw new Error("AI output materializer dependencies are incomplete");
  }

  const storage = new SupabaseAIOutputStorage(dependencies.storageClient);

  const materializationDependencies: Omit<AIOutputMaterializationDependencies, "confirmLease"> = {
    downloadProviderOutput: dependencies.downloadProviderOutput,
    storage,
    calculateFinalCredits: dependencies.calculateFinalCredits,
    maxBytes: dependencies.maxBytes,
  };

  return async (job, snapshot, confirmLease) => {
    if (typeof confirmLease !== "function") {
      throw new Error("AI output lease confirmation is required");
    }
    const output = await materializeAIProviderOutput(job, snapshot, {
      ...materializationDependencies,
      confirmLease,
    });
    return {
      outputObjectKey: output.outputObjectKey,
      finalCredits: output.finalCredits,
    };
  };
}
