/**
 * Provider-neutral server-side gateway for ETERNYX conversational AI.
 *
 * Provider credentials and model configuration remain server-only. The
 * existing Groq integration is preserved as the initial adapter; additional
 * adapters can be registered here after capability, security and cost review.
 * This module never performs automatic cross-provider fallback.
 */

export type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface AIChatCompletionInput {
  systemPrompt: string;
  userMessage: string;
  chatHistory: AIChatMessage[];
}

export type AIProviderFailureKind =
  | "configuration"
  | "network"
  | "rate_limit"
  | "provider_unavailable"
  | "request_rejected"
  | "invalid_response";

export class AIProviderError extends Error {
  readonly safeToRefund: boolean;
  readonly kind: AIProviderFailureKind;

  constructor(message: string, kind: AIProviderFailureKind, safeToRefund: boolean) {
    super(message);
    this.name = "AIProviderError";
    this.kind = kind;
    this.safeToRefund = safeToRefund;
  }
}

export interface AIChatProviderAdapter {
  readonly id: string;
  complete(input: AIChatCompletionInput): Promise<string>;
}

const MAX_PROVIDER_RESPONSE_BYTES = 512 * 1024;
const PROVIDER_TIMEOUT_MS = 25000;

async function readProviderResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new AIProviderError("Empty provider response", "invalid_response", false);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) throw new AIProviderError("Oversized provider response", "invalid_response", false);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    throw new AIProviderError("Provider response could not be read", "invalid_response", false);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

const groqAdapter: AIChatProviderAdapter = {
  id: "groq",
  async complete(input) {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      throw new AIProviderError(
        "AI is not configured: GROQ_API_KEY is missing",
        "configuration",
        false,
      );
    }

    const model = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b";
    const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
    const messages = [
      { role: "system", content: input.systemPrompt },
      ...input.chatHistory.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: input.userMessage },
    ];

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: 2048,
        }),
      });
    } catch (error) {
      console.error("AI provider network request failed", { provider: "groq" });
      throw new AIProviderError(
        "The AI provider could not be reached. Please try again.",
        "network",
        false,
      );
    }

    const responseText = await readProviderResponse(response);
    let data: any = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error("AI provider request failed", {
        provider: "groq",
        status: response.status,
        requestId: response.headers.get("x-request-id"),
      });

      if (response.status === 401 || response.status === 403) {
        throw new AIProviderError(
          "The AI provider rejected its API key. Check GROQ_API_KEY in Supabase secrets.",
          "configuration",
          true,
        );
      }
      if (response.status === 429) {
        throw new AIProviderError(
          "The AI provider rate limit has been reached. Please wait and try again.",
          "rate_limit",
          true,
        );
      }
      if (response.status >= 500) {
        throw new AIProviderError(
          "The AI provider is temporarily unavailable. Please try again shortly.",
          "provider_unavailable",
          false,
        );
      }
      throw new AIProviderError(
        "The AI provider rejected the request. Check the configured model and request settings.",
        "request_rejected",
        true,
      );
    }

    const output = data?.choices?.[0]?.message?.content;
    if (typeof output !== "string" || !output.trim()) {
      console.error("AI provider returned an empty or unexpected completion payload", {
        provider: "groq",
        model,
        requestId: response.headers.get("x-request-id"),
      });
      throw new AIProviderError(
        "The AI provider returned an empty response. Please try again.",
        "invalid_response",
        false,
      );
    }

    return output.trim();
  },
};

/** Configuration validation is deliberately network-free and precedes charging.
 * It verifies configuration presence, not provider availability or key validity.
 */
export function assertChatProviderConfigured(): void {
  const providerId = Deno.env.get("AI_CHAT_PROVIDER") || "groq";
  if (!Object.prototype.hasOwnProperty.call(providers, providerId) ||
      !Deno.env.get("GROQ_API_KEY")?.trim()) {
    throw new AIProviderError("AI provider configuration is unavailable", "configuration", false);
  }
  const model = Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-20b";
  if (model.length > 150 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(model)) {
    throw new AIProviderError("AI model configuration is invalid", "configuration", false);
  }
}

/** Explicit adapter registry. Unknown providers fail closed; no silent fallback. */
const providers: Readonly<Record<string, AIChatProviderAdapter>> = {
  groq: groqAdapter,
};

export async function generateChatCompletion(
  input: AIChatCompletionInput,
): Promise<string> {
  const providerId = Deno.env.get("AI_CHAT_PROVIDER") || "groq";
  const provider = Object.prototype.hasOwnProperty.call(providers, providerId) ? providers[providerId] : undefined;

  if (!provider) {
    throw new AIProviderError(
      "The configured AI provider is not supported.",
      "configuration",
      false,
    );
  }

  return provider.complete(input);
}
