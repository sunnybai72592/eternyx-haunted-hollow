import { authenticateUser } from "../_shared/user-auth.ts";
import {
  consumeToolCredits,
  refundToolCredits,
  CreditOperationError,
} from "../_shared/entitlements.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

class SecurityAssistantProviderError extends Error {
  readonly safeToRefund: boolean;

  constructor(message: string, safeToRefund: boolean) {
    super(message);
    this.name = "SecurityAssistantProviderError";
    this.safeToRefund = safeToRefund;
  }
}

async function requestAssistant(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("AI service is not configured");

  let response: Response;
  try {
    response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        reasoning: { effort: "low" },
        instructions: "You are Eternyx, an expert cybersecurity assistant. Give clear, accurate, practical answers about security threats, defenses and best practices. Be concise. Refuse to help with clearly malicious attacks on systems the user doesn't own.",
        input: messages,
      }),
    });
  } catch {
    // A network failure does not prove the upstream provider did not process
    // the request, so the spend is deliberately not automatically refunded.
    throw new SecurityAssistantProviderError("The AI service could not be reached. Please try again.", false);
  }

  const responseText = await response.text();
  let data: any = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("Security assistant provider request failed", {
      status: response.status,
      requestId: response.headers.get("x-request-id"),
    });
    const rejected = [400, 401, 403, 404, 422, 429].includes(response.status);
    throw new SecurityAssistantProviderError(
      response.status === 429
        ? "The AI service is busy. Please wait and try again."
        : "The AI service rejected the request. Please try again later.",
      rejected,
    );
  }

  const reply = data?.output_text ??
    (Array.isArray(data?.output)
      ? data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
          .filter((item: any) => item?.type === "output_text")
          .map((item: any) => item.text)
          .join("")
      : "");

  if (typeof reply !== "string" || !reply.trim()) {
    throw new SecurityAssistantProviderError("The AI service returned an empty response. Please try again.", false);
  }
  return reply.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return json({ error: "Authentication required" }, 401);

  let body: { messages?: unknown; requestId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  if (!isUuid(body.requestId)) return json({ error: "A valid request ID is required" }, 400);
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 30) {
    return json({ error: "Invalid messages" }, 400);
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of body.messages) {
    if (!item || typeof item !== "object" ||
        (item.role !== "user" && item.role !== "assistant") ||
        typeof item.content !== "string" || !item.content.trim() || item.content.length > 4000) {
      return json({ error: "Each message must have a valid role and contain 1–4000 characters" }, 400);
    }
    messages.push({ role: item.role, content: item.content.trim() });
  }

  let spendTransactionId: string | null = null;
  try {
    const creditResult = await consumeToolCredits(supabase, {
      userId: user.id,
      featureKey: "ai.security-assistant",
      idempotencyKey: body.requestId,
    });

    if (creditResult.alreadyProcessed) {
      return json({
        error: "This request was already processed. Send a new message to start another request.",
        code: "REQUEST_ALREADY_PROCESSED",
      }, 409);
    }

    spendTransactionId = creditResult.transactionId;
    const reply = await requestAssistant(messages);
    return json({ reply });
  } catch (error) {
    if (spendTransactionId && error instanceof SecurityAssistantProviderError && error.safeToRefund) {
      try {
        await refundToolCredits(supabase, {
          userId: user.id,
          spendTransactionId,
        });
      } catch (refundError) {
        console.error("Security assistant credit refund requires reconciliation", {
          code: refundError instanceof CreditOperationError ? refundError.code : "REFUND_FAILED",
        });
      }
    }

    if (error instanceof CreditOperationError) {
      const statusByCode: Record<string, number> = {
        INVALID_CREDIT_REQUEST: 400,
        INSUFFICIENT_CREDITS: 402,
        FEATURE_NOT_ENTITLED: 403,
        SUBSCRIPTION_RECONCILIATION_REQUIRED: 409,
        SUBSCRIPTION_PLAN_UNRECOGNIZED: 403,
        CREDIT_SERVICE_UNAVAILABLE: 503,
        CREDIT_SERVICE_INVALID_RESPONSE: 503,
      };
      return json({
        error: "Security Assistant is not currently available for this account.",
        code: error.code,
      }, statusByCode[error.code] ?? 503);
    }

    if (error instanceof SecurityAssistantProviderError) {
      return json({ error: error.message }, 502);
    }

    console.error("Security assistant request failed");
    return json({ error: "Security Assistant could not complete the request." }, 500);
  }
});
