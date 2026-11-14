/**
 * Provider-neutral catalogue for ETERNYX AI capabilities.
 *
 * This file is metadata only: it does not call providers, enable paid features,
 * define prices, or grant entitlements. A feature becomes usable only after
 * its backend, provider, policy and entitlement have been explicitly activated.
 */

export type AIStudioId =
  | "video"
  | "image"
  | "writing"
  | "audio"
  | "coding"
  | "documents"
  | "research"
  | "agents";

export type AIModality = "text" | "image" | "audio" | "video" | "document" | "code";
export type AICapability =
  | "text_generation"
  | "reasoning"
  | "image_generation"
  | "image_editing"
  | "video_generation"
  | "video_editing"
  | "speech_generation"
  | "speech_recognition"
  | "document_understanding"
  | "code_generation"
  | "web_research"
  | "agent_planning";

export type AIExecutionMode = "request_response" | "asynchronous_job";
export type AIFeatureStatus = "planned" | "backend_pending" | "disabled";
export type AIProviderStatus = "unconfigured" | "disabled" | "enabled";
export type AIModelStatus = "unavailable" | "disabled" | "enabled";

export interface AIStudioDefinition {
  readonly id: AIStudioId;
  readonly title: string;
  readonly description: string;
  readonly slug: string;
  readonly flagship?: boolean;
}

export interface AIFeatureDefinition {
  readonly id: string;
  readonly studioId: AIStudioId | null;
  readonly title: string;
  readonly description: string;
  readonly capability: AICapability;
  readonly inputModalities: readonly AIModality[];
  readonly outputModalities: readonly AIModality[];
  readonly execution: AIExecutionMode;
  readonly status: AIFeatureStatus;
  /** Stable key passed to the central entitlement engine; not a price. */
  readonly entitlementKey: string;
}

export interface AIProviderDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly status: AIProviderStatus;
  readonly supportedCapabilities: readonly AICapability[];
  /** Secret names only. Never store secret values in this registry. */
  readonly requiredSecretNames: readonly string[];
}

export interface AIModelDefinition {
  readonly id: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly status: AIModelStatus;
  readonly capabilities: readonly AICapability[];
  readonly inputModalities: readonly AIModality[];
  readonly outputModalities: readonly AIModality[];
  readonly supportsAsyncJobs: boolean;
}

export const AI_STUDIOS: readonly AIStudioDefinition[] = [
  { id: "video", title: "AI Video Studio", description: "Create and transform video with controlled, asynchronous generation workflows.", slug: "video", flagship: true },
  { id: "image", title: "AI Image Studio", description: "Generate, edit and prepare visual assets.", slug: "image" },
  { id: "writing", title: "AI Writing Studio", description: "Draft, revise, summarize and translate content.", slug: "writing" },
  { id: "audio", title: "AI Audio Studio", description: "Transcribe, synthesize and process audio.", slug: "audio" },
  { id: "coding", title: "AI Coding Studio", description: "Assist software development and integrate with Developer Studio.", slug: "coding" },
  { id: "documents", title: "AI Document Intelligence", description: "Understand, extract and analyze user-owned documents.", slug: "documents" },
  { id: "research", title: "AI Research Studio", description: "Research topics with traceable sources and structured findings.", slug: "research" },
  { id: "agents", title: "AI Agents Studio", description: "Plan controlled multi-step tasks with explicit permission boundaries.", slug: "agents" },
] as const;

/**
 * Planned capability catalogue. "backend_pending" is reserved for an existing
 * interface whose backend activation is intentionally incomplete.
 * No feature is marked enabled in this foundation milestone.
 */
export const AI_FEATURES: readonly AIFeatureDefinition[] = [
  { id: "ai.chat", studioId: null, title: "AI Chat", description: "Conversational AI workspace; backend activation remains pending.", capability: "reasoning", inputModalities: ["text", "image", "document"], outputModalities: ["text"], execution: "request_response", status: "backend_pending", entitlementKey: "ai.chat" },

  { id: "ai.video.text_to_video", studioId: "video", title: "Text to Video", description: "Generate video from a text prompt.", capability: "video_generation", inputModalities: ["text"], outputModalities: ["video"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.video.text_to_video" },
  { id: "ai.video.image_to_video", studioId: "video", title: "Image to Video", description: "Animate a user-provided image into a video.", capability: "video_generation", inputModalities: ["text", "image"], outputModalities: ["video"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.video.image_to_video" },
  { id: "ai.video.transform", studioId: "video", title: "Video Transformation", description: "Transform existing video using supported provider capabilities.", capability: "video_editing", inputModalities: ["text", "video"], outputModalities: ["video"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.video.transform" },
  { id: "ai.video.avatar", studioId: "video", title: "AI Avatar Video", description: "Create presenter-style video where supported.", capability: "video_generation", inputModalities: ["text", "image", "audio"], outputModalities: ["video"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.video.avatar" },

  { id: "ai.image.generate", studioId: "image", title: "Image Generation", description: "Generate images from text prompts.", capability: "image_generation", inputModalities: ["text"], outputModalities: ["image"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.image.generate" },
  { id: "ai.image.edit", studioId: "image", title: "Image Editing", description: "Edit an image using text instructions.", capability: "image_editing", inputModalities: ["text", "image"], outputModalities: ["image"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.image.edit" },
  { id: "ai.image.upscale", studioId: "image", title: "Image Upscaling", description: "Increase image resolution using a supported model.", capability: "image_editing", inputModalities: ["image"], outputModalities: ["image"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.image.upscale" },

  { id: "ai.writing.generate", studioId: "writing", title: "Writing Assistant", description: "Draft and revise written content.", capability: "text_generation", inputModalities: ["text"], outputModalities: ["text"], execution: "request_response", status: "planned", entitlementKey: "ai.writing.generate" },
  { id: "ai.writing.translate", studioId: "writing", title: "Translation", description: "Translate user-provided text.", capability: "text_generation", inputModalities: ["text"], outputModalities: ["text"], execution: "request_response", status: "planned", entitlementKey: "ai.writing.translate" },

  { id: "ai.audio.transcribe", studioId: "audio", title: "Audio Transcription", description: "Convert speech into text.", capability: "speech_recognition", inputModalities: ["audio"], outputModalities: ["text"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.audio.transcribe" },
  { id: "ai.audio.speech", studioId: "audio", title: "Text to Speech", description: "Generate speech from text.", capability: "speech_generation", inputModalities: ["text"], outputModalities: ["audio"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.audio.speech" },

  { id: "ai.coding.assist", studioId: "coding", title: "Coding Assistant", description: "Explain, draft and improve code.", capability: "code_generation", inputModalities: ["text", "code"], outputModalities: ["text", "code"], execution: "request_response", status: "planned", entitlementKey: "ai.coding.assist" },
  { id: "ai.coding.review", studioId: "coding", title: "Code Review", description: "Review supplied code for correctness and maintainability.", capability: "reasoning", inputModalities: ["code", "text"], outputModalities: ["text"], execution: "request_response", status: "planned", entitlementKey: "ai.coding.review" },

  { id: "ai.documents.analyze", studioId: "documents", title: "Document Analysis", description: "Answer questions about user-owned documents.", capability: "document_understanding", inputModalities: ["document", "text", "image"], outputModalities: ["text"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.documents.analyze" },
  { id: "ai.documents.extract", studioId: "documents", title: "Structured Extraction", description: "Extract validated fields and tables from documents.", capability: "document_understanding", inputModalities: ["document", "image"], outputModalities: ["text"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.documents.extract" },

  { id: "ai.research.search", studioId: "research", title: "Research Assistant", description: "Gather and organize information with source references.", capability: "web_research", inputModalities: ["text"], outputModalities: ["text"], execution: "asynchronous_job", status: "planned", entitlementKey: "ai.research.search" },
  { id: "ai.research.summarize", studioId: "research", title: "Research Summaries", description: "Summarize supplied research material.", capability: "reasoning", inputModalities: ["text", "document"], outputModalities: ["text"], execution: "request_response", status: "planned", entitlementKey: "ai.research.summarize" },

  { id: "ai.agents.plan", studioId: "agents", title: "Agent Planning", description: "Create a proposed plan without executing external actions.", capability: "agent_planning", inputModalities: ["text", "document"], outputModalities: ["text"], execution: "request_response", status: "planned", entitlementKey: "ai.agents.plan" },
] as const;

/** Empty until providers have been reviewed, approved and configured. */
export const AI_PROVIDERS: readonly AIProviderDefinition[] = [];

/** Empty until a real provider/model has been verified and approved. */
export const AI_MODELS: readonly AIModelDefinition[] = [];

export function getAIStudio(studioId: string): AIStudioDefinition | undefined {
  return AI_STUDIOS.find((studio) => studio.id === studioId);
}

export function getAIFeature(featureId: string): AIFeatureDefinition | undefined {
  return AI_FEATURES.find((feature) => feature.id === featureId);
}

export function getFeaturesForStudio(studioId: AIStudioId): readonly AIFeatureDefinition[] {
  return AI_FEATURES.filter((feature) => feature.studioId === studioId);
}

/** Only explicitly enabled models backed by enabled providers are selectable. */
export function getAvailableAIModels(capability?: AICapability): readonly AIModelDefinition[] {
  return AI_MODELS.filter((model) => {
    if (model.status !== "enabled") return false;
    if (capability && !model.capabilities.includes(capability)) return false;
    return AI_PROVIDERS.some((provider) =>
      provider.id === model.providerId &&
      provider.status === "enabled" &&
      model.capabilities.every((item) => provider.supportedCapabilities.includes(item))
    );
  });
}

/** Structural checks used by tests and future catalogue-loading code. */
export function validateAIRegistry(): readonly string[] {
  const errors: string[] = [];
  const studioIds = new Set<string>();
  const featureIds = new Set<string>();
  const providerIds = new Set<string>();
  const modelIds = new Set<string>();

  for (const studio of AI_STUDIOS) {
    if (studioIds.has(studio.id)) errors.push(`Duplicate studio ID: ${studio.id}`);
    studioIds.add(studio.id);
    if (!/^[a-z][a-z0-9-]*$/.test(studio.slug)) errors.push(`Invalid studio slug: ${studio.id}`);
  }

  for (const feature of AI_FEATURES) {
    if (featureIds.has(feature.id)) errors.push(`Duplicate feature ID: ${feature.id}`);
    featureIds.add(feature.id);
    if (feature.studioId !== null && !studioIds.has(feature.studioId)) errors.push(`Unknown studio for feature: ${feature.id}`);
    if (feature.entitlementKey !== feature.id) errors.push(`Entitlement key must match feature ID: ${feature.id}`);
    if (feature.inputModalities.length === 0 || feature.outputModalities.length === 0) {
      errors.push(`Feature modalities are incomplete: ${feature.id}`);
    }
  }

  for (const provider of AI_PROVIDERS) {
    if (providerIds.has(provider.id)) errors.push(`Duplicate provider ID: ${provider.id}`);
    providerIds.add(provider.id);
    if (provider.requiredSecretNames.some((name) => !/^[A-Z][A-Z0-9_]*$/.test(name))) {
      errors.push(`Invalid secret name for provider: ${provider.id}`);
    }
  }

  for (const model of AI_MODELS) {
    if (modelIds.has(model.id)) errors.push(`Duplicate model ID: ${model.id}`);
    modelIds.add(model.id);
    if (!providerIds.has(model.providerId)) errors.push(`Unknown provider for model: ${model.id}`);
    if (model.capabilities.length === 0) errors.push(`Model has no capabilities: ${model.id}`);
  }

  return errors;
}
