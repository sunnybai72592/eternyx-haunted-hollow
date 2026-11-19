/**
 * Offline, provider-neutral AI Writing Studio request preparation.
 * No network requests, provider calls, billing or credit reservations.
 */
export type AIWritingOperation = "draft" | "rewrite" | "summarize" | "translate";
export const AI_WRITING_LANGUAGES = [
  "English", "Arabic", "Urdu", "French", "Spanish", "German", "Hindi",
] as const;
export type AIWritingTargetLanguage = (typeof AI_WRITING_LANGUAGES)[number];

export type AIWritingRequestDraft =
  | { readonly featureKey: "ai.writing.generate"; readonly operation: "draft" | "rewrite" | "summarize"; readonly input: string; readonly instructions?: string }
  | { readonly featureKey: "ai.writing.translate"; readonly operation: "translate"; readonly input: string; readonly targetLanguage: AIWritingTargetLanguage };

export class AIWritingDraftError extends Error {
  readonly code: "invalid_operation" | "invalid_input" | "invalid_instructions" | "invalid_language";
  constructor(code: AIWritingDraftError["code"]) {
    super(code);
    this.name = "AIWritingDraftError";
    this.code = code;
  }
}

export function buildAIWritingRequest(
  operation: AIWritingOperation,
  input: string,
  options: { readonly instructions?: string; readonly targetLanguage?: AIWritingTargetLanguage } = {},
): AIWritingRequestDraft {
  if (!["draft", "rewrite", "summarize", "translate"].includes(operation)) {
    throw new AIWritingDraftError("invalid_operation");
  }
  if (typeof input !== "string" || !input.trim() || input.length > 12000) {
    throw new AIWritingDraftError("invalid_input");
  }
  const normalized = input.trim();
  if (operation === "translate") {
    if (!options.targetLanguage ||
        !(AI_WRITING_LANGUAGES as readonly string[]).includes(options.targetLanguage) ||
        options.instructions !== undefined) {
      throw new AIWritingDraftError("invalid_language");
    }
    return { featureKey: "ai.writing.translate", operation, input: normalized, targetLanguage: options.targetLanguage };
  }
  if (options.targetLanguage !== undefined) throw new AIWritingDraftError("invalid_language");
  if (options.instructions !== undefined &&
      (typeof options.instructions !== "string" || options.instructions.length > 1000)) {
    throw new AIWritingDraftError("invalid_instructions");
  }
  const instructions = options.instructions?.trim();
  return {
    featureKey: "ai.writing.generate", operation, input: normalized,
    ...(instructions ? { instructions } : {}),
  };
}

/** Uses whitespace-separated words; no user text is sent or stored. */
export function measureWritingText(text: string) {
  const clean = text.trim();
  return {
    characters: text.length,
    words: clean ? clean.split(/\s+/u).length : 0,
    paragraphs: clean ? clean.split(/\n\s*\n/u).filter(Boolean).length : 0,
  };
}

/** An explicit, deterministic local text-editing action, not AI rewriting. */
export function tidyWritingWhitespace(text: string): string {
  return text.replace(/\r\n?/g, "\n")
    .split("\n").map(line => line.replace(/[ \t]+$/g, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

export function formatWritingRequestForCopy(request: AIWritingRequestDraft): string {
  const task = {
    draft: "Write new content based on this brief",
    rewrite: "Rewrite the following text while preserving its meaning",
    summarize: "Summarize the following text accurately",
    translate: "Translate the following text faithfully",
  }[request.operation];
  const details = request.operation === "translate"
    ? "Target language: " + request.targetLanguage
    : request.instructions ? "Additional instructions: " + request.instructions : "";
  return [task, details, "Source text:", request.input].filter(Boolean).join("\n\n");
}
