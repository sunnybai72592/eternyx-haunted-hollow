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
      console.error("AI provider network request failed:", error);
      throw new AIProviderError(
        "The AI provider could not be reached. Please try again.",
        "network",
        false,
      );
    }

    const responseText = await response.text();
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

/** Explicit adapter registry. Unknown providers fail closed; no silent fallback. */
const providers: Readonly<Record<string, AIChatProviderAdapter>> = {
  groq: groqAdapter,
};

export async function generateChatCompletion(
  input: AIChatCompletionInput,
): Promise<string> {
  const providerId = Deno.env.get("AI_CHAT_PROVIDER") || "groq";
  const provider = providers[providerId];

  if (!provider) {
    throw new AIProviderError(
      "The configured AI provider is not supported.",
      "configuration",
      false,
    );
  }

  return provider.complete(input);
}
