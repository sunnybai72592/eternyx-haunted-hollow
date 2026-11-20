/**
 * Staging-only composition for ETERNYX's private self-hosted AI Video outputs.
 *
 * This composes the real GPU media downloader with the existing lease-fenced
 * Supabase create-only materializer. It does not create a worker, grant credits,
 * deploy a function, enable video generation or bypass ownership checks.
 */
import {
  createSelfHostedVideoOutputDownloader,
} from "./ai-self-hosted-video-worker.ts";
import {
  createAIWorkerOutputMaterializer,
  type AIWorkerOutputMaterializerDependencies,
} from "./ai-worker-output-materializer.ts";

export interface SelfHostedVideoOutputComposition {
  /** Server-only, approved GPU worker settings. Never originate in the browser. */
  worker: Parameters<typeof createSelfHostedVideoOutputDownloader>[0];
  /** Explicit storage, pricing and byte-size policies from the trusted backend. */
  materializer: Omit<AIWorkerOutputMaterializerDependencies, "downloadProviderOutput">;
  /** Must only be true after the operator has approved staging infrastructure. */
  stagingApproved: true;
}

/**
 * Must be constructed only in trusted server-side staging code, after a claimed
 * job is authenticated and lease operations have been wired in by its caller.
 * Production routes must not instantiate this until rollout approval.
 */
export function createStagingSelfHostedVideoOutputMaterializer(
  config: SelfHostedVideoOutputComposition,
): ReturnType<typeof createAIWorkerOutputMaterializer> {
  if (!config || config.stagingApproved !== true || !config.worker ||
      !config.materializer ||
      !Number.isSafeInteger(config.materializer.maxBytes) ||
      config.materializer.maxBytes < 12 ||
      config.materializer.maxBytes > 200 * 1024 * 1024 ||
      typeof config.materializer.calculateFinalCredits !== "function" ||
      !config.materializer.storageClient?.storage) {
    throw new Error("Approved staged video output configuration required");
  }

  const downloadProviderOutput = createSelfHostedVideoOutputDownloader(
    config.worker,
    config.materializer.maxBytes,
  );
  return createAIWorkerOutputMaterializer({
    ...config.materializer,
    downloadProviderOutput,
  });
}
