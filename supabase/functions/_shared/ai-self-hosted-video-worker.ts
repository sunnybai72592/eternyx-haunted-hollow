/**
 * Real HTTP transport for a future owner-operated ETERNYX GPU video worker.
 * This adapter sends network requests ONLY when explicitly instantiated by a
 * trusted backend. It is not registered, scheduled, or deployed by this PR.
 *
 * Worker contract:
 * POST /v1/jobs {payload,idempotencyKey} => 202 {taskId,state:"queued"|"processing"}
 * GET /v1/jobs/:taskId => 200 {taskId,state,progressPercent?,outputReference?,failureCode?}
 * POST /v1/jobs/:taskId/cancel => 200|202 {accepted:true}
 *
 * The worker MUST enforce idempotency atomically, auth, budgets, moderation,
 * request size and user ownership. This connector alone cannot ensure those.
 */
import {
  AIGenerationAdapterError,
  validateAIGenerationSnapshot,
  validateAIGenerationSubmission,
  validateAIGenerationSubmissionResult,
  type AIGenerationProviderAdapter,
  type AIGenerationSubmission,
  type AIGenerationSubmissionResult,
  type AIGenerationProviderSnapshot,
} from "./ai-generation-provider.ts";

type FetchFunction = typeof fetch;
interface WorkerConfig {
  readonly baseUrl: string;
  readonly hostname: string;
  readonly secret: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchFunction;
}
const TASK = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const ERROR_LIMIT = 16 * 1024;
const TIMEOUT_DEFAULT = 15000;

function readConfig(config: WorkerConfig) {
  if (!config || typeof config !== "object" || typeof config.secret !== "string" ||
      config.secret.length < 24 || config.secret.length > 4096 ||
      /[\r\n]/.test(config.secret) ||
      typeof config.hostname !== "string" ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(config.hostname)) {
    throw new AIGenerationAdapterError("configuration");
  }
  let url: URL;
  try { url = new URL(config.baseUrl); }
  catch { throw new AIGenerationAdapterError("configuration"); }
  if (url.protocol !== "https:" || url.hostname !== config.hostname.toLowerCase() ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "") || url.port ||
      url.hostname === "localhost" || url.hostname.endsWith(".local")) {
    throw new AIGenerationAdapterError("configuration");
  }
  const timeoutMs = config.timeoutMs ?? TIMEOUT_DEFAULT;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new AIGenerationAdapterError("configuration");
  }
  return { origin: url.origin, timeoutMs };
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIGenerationAdapterError("invalid_response");
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > ERROR_LIMIT) throw new AIGenerationAdapterError("invalid_response");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AIGenerationAdapterError("invalid_response"); }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createSelfHostedVideoWorkerAdapter(config: WorkerConfig): AIGenerationProviderAdapter {
  const { origin, timeoutMs } = readConfig(config);
  const fetcher = config.fetchImpl ?? fetch;
  const request = async (path: string, method: "GET" | "POST", body?: unknown) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(origin + path, {
        method, redirect: "error", signal: controller.signal,
        headers: {
          "Authorization": "Bearer " + config.secret,
          "Accept": "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } finally { clearTimeout(timeout); }
  };
  return {
    providerId: "eternyx_self_hosted",
    async submit(input: AIGenerationSubmission): Promise<AIGenerationSubmissionResult> {
      validateAIGenerationSubmission(input);
      // Never send arbitrary callback URLs to a worker from this transport.
      if (input.callbackUrl !== undefined) throw new AIGenerationAdapterError("request_rejected", true);
      let response: Response;
      try {
        response = await request("/v1/jobs", "POST", {
          payload: input.payload, idempotencyKey: input.idempotencyKey,
        });
      } catch {
        return { outcome: "uncertain", reason: "connection_lost" };
      }
      if (response.status === 400 || response.status === 422) {
        throw new AIGenerationAdapterError("request_rejected", true);
      }
      if (response.status === 401 || response.status === 403) {
        throw new AIGenerationAdapterError("authentication", true);
      }
      if (response.status !== 200 && response.status !== 202) {
        // A remote 429/5xx may have accepted work; never blindly retry.
        return { outcome: "uncertain", reason: "invalid_acknowledgement" };
      }
      try {
        const json = await boundedJson(response);
        if (!record(json)) throw new AIGenerationAdapterError("invalid_response");
        return validateAIGenerationSubmissionResult({
          outcome: "accepted", providerTaskId: json.taskId as string,
          state: json.state as "queued" | "processing",
        });
      } catch {
        return { outcome: "uncertain", reason: "invalid_acknowledgement" };
      }
    },
    async getStatus(providerTaskId: string): Promise<AIGenerationProviderSnapshot> {
      if (!TASK.test(providerTaskId)) throw new AIGenerationAdapterError("request_rejected", true);
      let response: Response;
      try { response = await request("/v1/jobs/" + encodeURIComponent(providerTaskId), "GET"); }
      catch { throw new AIGenerationAdapterError("network_uncertain"); }
      if (response.status === 404) throw new AIGenerationAdapterError("not_found");
      if (!response.ok) throw new AIGenerationAdapterError("provider_unavailable");
      const json = await boundedJson(response);
      if (!record(json) || json.taskId !== providerTaskId)
        throw new AIGenerationAdapterError("invalid_response");
      return validateAIGenerationSnapshot({
        providerTaskId: json.taskId as string,
        state: json.state as AIGenerationProviderSnapshot["state"],
        ...(json.progressPercent === undefined ? {} : { progressPercent: json.progressPercent as number }),
        ...(json.outputReference === undefined ? {} : { outputReference: json.outputReference as string }),
        ...(json.failureCode === undefined ? {} : { failureCode: json.failureCode as string }),
      });
    },
    async cancel(providerTaskId: string): Promise<"accepted" | "unsupported"> {
      if (!TASK.test(providerTaskId)) throw new AIGenerationAdapterError("request_rejected", true);
      let response: Response;
      try { response = await request("/v1/jobs/" + encodeURIComponent(providerTaskId) + "/cancel", "POST"); }
      catch { throw new AIGenerationAdapterError("network_uncertain"); }
      if (response.status === 405 || response.status === 501) return "unsupported";
      if (response.status !== 200 && response.status !== 202)
        throw new AIGenerationAdapterError("provider_unavailable");
      const json = await boundedJson(response);
      if (!record(json) || json.accepted !== true)
        throw new AIGenerationAdapterError("invalid_response");
      return "accepted";
    },
  };
}
