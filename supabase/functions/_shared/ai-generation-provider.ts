/**
 * Provider-neutral contract for asynchronous AI generation.
 *
 * This module intentionally contains no configured providers, network calls,
 * credentials, storage access, or billing behavior. Adapters may be registered
 * only after capability, security, reliability and cost review.
 */

export type AIGenerationCapability =
  | "video_generation"
  | "video_editing"
  | "image_generation"
  | "image_editing"
  | "speech_generation"
  | "speech_recognition"
  | "document_understanding";

export type AIGenerationProviderJobState =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AIGenerationProviderDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly capabilities: readonly AIGenerationCapability[];
  readonly models: readonly AIGenerationModelDefinition[];
}

export interface AIGenerationModelDefinition {
  readonly id: string;
  readonly enabled: boolean;
  readonly capabilities: readonly AIGenerationCapability[];
}

export interface AIGenerationSubmission {
  /** Opaque, provider-specific request payload built by a trusted feature adapter. */
  readonly payload: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly callbackUrl?: string;
}

export interface AIGenerationAccepted {
  readonly outcome: "accepted";
  readonly providerTaskId: string;
  readonly state: "queued" | "processing";
}

export interface AIGenerationSubmissionUncertain {
  readonly outcome: "uncertain";
  /** The request may have reached the provider. Never blindly resubmit it. */
  readonly reason: "timeout" | "connection_lost" | "invalid_acknowledgement";
}

export type AIGenerationSubmissionResult =
  | AIGenerationAccepted
  | AIGenerationSubmissionUncertain;

export interface AIGenerationProviderSnapshot {
  readonly providerTaskId: string;
  readonly state: AIGenerationProviderJobState;
  readonly progressPercent?: number;
  readonly outputReference?: string;
  readonly failureCode?: string;
}

export interface AIGenerationProviderAdapter {
  readonly providerId: string;
  submit(input: AIGenerationSubmission): Promise<AIGenerationSubmissionResult>;
  getStatus(providerTaskId: string): Promise<AIGenerationProviderSnapshot>;
  cancel(providerTaskId: string): Promise<"accepted" | "unsupported">;
}

export type AIGenerationAdapterErrorKind =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "request_rejected"
  | "provider_unavailable"
  | "network_uncertain"
  | "invalid_response"
  | "not_found";

export class AIGenerationAdapterError extends Error {
  readonly kind: AIGenerationAdapterErrorKind;
  /** True only when the adapter can prove the provider did not accept the request. */
  readonly safeToRetrySubmission: boolean;

  constructor(kind: AIGenerationAdapterErrorKind, safeToRetrySubmission = false) {
    super(kind);
    this.name = "AIGenerationAdapterError";
    this.kind = kind;
    this.safeToRetrySubmission = safeToRetrySubmission;
  }
}

const PROVIDER_ID = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/;
const TASK_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,254}$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

/** Empty by design until a provider has been explicitly approved and configured. */
export const AI_GENERATION_PROVIDERS: readonly AIGenerationProviderDefinition[] = [];
const adapters: Readonly<Record<string, AIGenerationProviderAdapter>> = Object.freeze({});

export function validateGenerationSelection(
  providerId: string,
  modelId: string,
  capability: AIGenerationCapability,
  definitions: readonly AIGenerationProviderDefinition[] = AI_GENERATION_PROVIDERS,
): { provider: AIGenerationProviderDefinition; model: AIGenerationModelDefinition } {
  if (!PROVIDER_ID.test(providerId) || !MODEL_ID.test(modelId)) {
    throw new AIGenerationAdapterError("configuration");
  }
  const provider = definitions.find((item) => item.id === providerId);
  const model = provider?.models.find((item) => item.id === modelId);
  if (!provider?.enabled || !model?.enabled ||
      !provider.capabilities.includes(capability) ||
      !model.capabilities.includes(capability)) {
    throw new AIGenerationAdapterError("configuration");
  }
  return { provider, model };
}

export function resolveAIGenerationAdapter(
  providerId: string,
  registry: Readonly<Record<string, AIGenerationProviderAdapter>> = adapters,
): AIGenerationProviderAdapter {
  if (!PROVIDER_ID.test(providerId)) throw new AIGenerationAdapterError("configuration");
  const adapter = registry[providerId];
  if (!adapter || adapter.providerId !== providerId) {
    throw new AIGenerationAdapterError("configuration");
  }
  return adapter;
}

export function validateAIGenerationSubmission(
  input: AIGenerationSubmission,
): void {
  if (!input || typeof input !== "object" ||
      !IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
      !input.payload || typeof input.payload !== "object" ||
      Array.isArray(input.payload) ||
      new TextEncoder().encode(JSON.stringify(input.payload)).byteLength > 65536 ||
      (input.callbackUrl !== undefined && !isHttpsUrl(input.callbackUrl))) {
    throw new AIGenerationAdapterError("request_rejected", true);
  }
}

export function validateAIGenerationSnapshot(
  snapshot: AIGenerationProviderSnapshot,
): AIGenerationProviderSnapshot {
  if (!snapshot || typeof snapshot !== "object" ||
      !TASK_ID.test(snapshot.providerTaskId) ||
      !["queued", "processing", "succeeded", "failed", "cancelled"].includes(snapshot.state) ||
      (snapshot.progressPercent !== undefined &&
        (!Number.isInteger(snapshot.progressPercent) ||
          snapshot.progressPercent < 0 || snapshot.progressPercent > 100)) ||
      (snapshot.outputReference !== undefined &&
        (typeof snapshot.outputReference !== "string" ||
          snapshot.outputReference.length < 1 || snapshot.outputReference.length > 1000)) ||
      (snapshot.failureCode !== undefined &&
        !/^[A-Z0-9_]{1,80}$/.test(snapshot.failureCode))) {
    throw new AIGenerationAdapterError("invalid_response");
  }
  if (snapshot.state === "succeeded" && !snapshot.outputReference) {
    throw new AIGenerationAdapterError("invalid_response");
  }
  if (snapshot.state === "failed" && !snapshot.failureCode) {
    throw new AIGenerationAdapterError("invalid_response");
  }
  return snapshot;
}

export function validateAIGenerationSubmissionResult(
  result: AIGenerationSubmissionResult,
): AIGenerationSubmissionResult {
  if (!result || typeof result !== "object") {
    throw new AIGenerationAdapterError("invalid_response");
  }
  if (result.outcome === "uncertain" &&
      ["timeout", "connection_lost", "invalid_acknowledgement"].includes(result.reason)) {
    return result;
  }
  if (result.outcome === "accepted" &&
      TASK_ID.test(result.providerTaskId) &&
      ["queued", "processing"].includes(result.state)) {
    return result;
  }
  throw new AIGenerationAdapterError("invalid_response");
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      url.username === "" && url.password === "";
  } catch {
    return false;
  }
}
