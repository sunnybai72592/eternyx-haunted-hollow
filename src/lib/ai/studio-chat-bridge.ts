import { supabase } from "@/integrations/supabase/client";
import {
  prepareStudioChatMessage,
  StudioChatRequestError,
  type StudioChatFeature,
} from "./studio-chat-request";

/**
 * The existing chat endpoint owns JWT authentication, server-only Groq credentials,
 * account credit enforcement, and chat-history persistence.
 * This bridge deliberately does not bypass any of those controls.
 */
export type StudioChatErrorCode =
  | "invalid_prompt" | "too_long" | "unsupported_feature"
  | "unauthenticated" | "insufficient_credits" | "not_entitled"
  | "unavailable" | "invalid_response";

export class StudioChatError extends Error {
  constructor(readonly code: StudioChatErrorCode) {
    super(code);
    this.name = "StudioChatError";
  }
}

export interface StudioChatReply {
  readonly response: string;
  readonly sessionId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function translateStatus(status: unknown): StudioChatError {
  if (status === 401) return new StudioChatError("unauthenticated");
  if (status === 402) return new StudioChatError("insufficient_credits");
  if (status === 403 || status === 409) return new StudioChatError("not_entitled");
  return new StudioChatError("unavailable");
}

export async function completeStudioChatTask(
  featureKey: StudioChatFeature,
  prompt: string,
): Promise<StudioChatReply> {
  let message: string;
  try {
    message = prepareStudioChatMessage(featureKey, prompt);
  } catch (error) {
    if (error instanceof StudioChatRequestError) throw new StudioChatError(error.code);
    throw new StudioChatError("invalid_prompt");
  }
  try {
    // Every explicit click uses a new unique request id; no automated retries or
    // hidden follow-up calls that could consume more credits.
    const { data, error } = await supabase.functions.invoke("eternyx-ai-chat", {
      body: { message, requestId: crypto.randomUUID() },
    });
    if (error) throw translateStatus(error.context?.status);
    if (typeof data?.response !== "string" || !data.response.trim() ||
        typeof data?.sessionId !== "string" || !UUID_PATTERN.test(data.sessionId)) {
      throw new StudioChatError("invalid_response");
    }
    return { response: data.response.trim(), sessionId: data.sessionId };
  } catch (error) {
    if (error instanceof StudioChatError) throw error;
    throw new StudioChatError("unavailable");
  }
}
