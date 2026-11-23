import { useRef, useState } from "react";
import {
  completeStudioChatTask,
  StudioChatError,
} from "@/lib/ai/studio-chat-bridge";
import type { StudioChatFeature } from "@/lib/ai/studio-chat-request";

const errorMessages: Record<StudioChatError["code"], string> = {
  invalid_prompt: "Prepare a nonempty request before contacting AI.",
  too_long: "The AI chat backend accepts at most 4,000 characters including task instructions. Shorten the source before sending; no text was silently cut.",
  unsupported_feature: "This studio task is not supported by the current AI bridge.",
  unauthenticated: "Sign in again before using ETERNYX AI.",
  insufficient_credits: "Your account has insufficient AI chat credits. No automatic retry was made.",
  not_entitled: "AI chat is not enabled for this account or its subscription requires attention.",
  unavailable: "AI chat is unavailable. Verify its backend deployment and server-side provider configuration.",
  invalid_response: "The AI backend returned an invalid response. Review your chat history before retrying to avoid a possible second charge.",
};

/** A result is invalidated when the underlying local draft changes.
 * In-flight requests cannot be cancelled and may still consume chat credits.
 */
export function useAIStudioChat() {
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    requestVersion.current += 1;
    setResult(null);
    setError(null);
  };

  const run = async (featureKey: StudioChatFeature, prompt: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const version = ++requestVersion.current;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await completeStudioChatTask(featureKey, prompt);
      if (requestVersion.current === version) setResult(response.response);
    } catch (failure) {
      if (requestVersion.current === version) {
        setError(failure instanceof StudioChatError
          ? errorMessages[failure.code]
          : "The AI task failed. Check chat history before retrying.");
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return { loading, result, error, invalidate, run };
}
