import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import { validateVerifiedAIImageAsset, VerifiedAIImageAssetError } from "../_shared/ai-verified-image-asset.ts";
import {
  AIVideoRequestValidationError,
  validateAIVideoGenerationRequest,
} from "../_shared/ai-video-request.ts";
import {
  AIGenerationSafetyGateError,
  requireAIGenerationSafetyApproval,
} from "../_shared/ai-generation-safety.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapEnqueueError(message: string): { status: number; error: string } {
  if (message.includes("Insufficient credits")) {
    return { status: 402, error: "There are not enough available credits for this generation" };
  }
  if (message.includes("Feature is not enabled")) {
    return { status: 403, error: "This AI Video feature is not currently available" };
  }
  if (message.includes("idempotency key conflicts")) {
    return { status: 409, error: "This request key was already used for a different feature" };
  }
  if (message.includes("idempotency key was reused with a different request")) {
    return { status: 409, error: "This request key was already used for a different generation request" };
  }
  if (message.includes("Invalid AI generation enqueue request")) {
    return { status: 400, error: "The generation request could not be accepted" };
  }
  return { status: 503, error: "AI generation is temporarily unavailable" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 12000) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!isRecord(body) ||
      Object.keys(body).some((key) => !["request", "idempotencyKey"].includes(key)) ||
      typeof body.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9._:-]{8,200}$/.test(body.idempotencyKey)) {
    return reply({ error: "A valid idempotency key and generation request are required" }, 400);
  }

  let generationRequest;
  try {
    generationRequest = validateAIVideoGenerationRequest(body.request);
  } catch (error) {
    if (error instanceof AIVideoRequestValidationError) {
      return reply({ error: "The AI Video request is invalid", code: error.code }, 400);
    }
    return reply({ error: "The AI Video request could not be validated" }, 400);
  }

  if (generationRequest.featureKey === "ai.video.image_to_video") {
    const { data: asset, error: assetError } = await supabase
      .from("ai_generation_input_assets")
      .select("id, user_id, bucket_id, status, verified_content_type, verified_size")
      .eq("id", generationRequest.imageAssetId)
      .eq("user_id", user.id)
      .eq("bucket_id", "ai-generation-inputs")
      .maybeSingle();

    if (assetError) {
      console.error("AI Video input asset lookup failed", { code: assetError.code ?? null });
      return reply({ error: "The uploaded image could not be verified" }, 503);
    }
    try {
      validateVerifiedAIImageAsset(asset, user.id, generationRequest.imageAssetId);
    } catch (error) {
      if (!(error instanceof VerifiedAIImageAssetError)) {
        console.error("AI Video input asset validation failed unexpectedly");
        return reply({ error: "The uploaded image could not be verified" }, 503);
      }
      return reply({ error: "A verified image uploaded by this account is required" }, 422);
    }
  }

  const inputPayload = {
    version: 1,
    ...generationRequest,
  };


  // No moderation provider or policy is approved/configured yet: fail closed.
  // This happens before the credit/job RPC, so blocked requests reserve nothing.
  const digestBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(inputPayload)),
  );
  const requestDigestHex = Array.from(new Uint8Array(digestBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  try {
    requireAIGenerationSafetyApproval(null, requestDigestHex);
  } catch (error) {
    if (!(error instanceof AIGenerationSafetyGateError)) {
      console.error("AI generation safety gate failed unexpectedly");
    }
    return reply({ error: "AI generation safety checks are not currently available" }, 503);
  }

  try {
    const { data, error } = await supabase.rpc("enqueue_ai_generation_job_with_credits", {
      p_user_id: user.id,
      p_feature_key: generationRequest.featureKey,
      p_idempotency_key: body.idempotencyKey,
      p_input_payload: inputPayload,
      p_max_attempts: 3,
    });

    if (error) {
      console.error("AI Video job enqueue failed", { code: error.code ?? null });
      const mapped = mapEnqueueError(error.message ?? "");
      return reply({ error: mapped.error }, mapped.status);
    }

    if (!isRecord(data) ||
        typeof data.job_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.job_id) ||
        typeof data.status !== "string" ||
        typeof data.already_exists !== "boolean") {
      console.error("AI Video job enqueue returned an invalid result");
      return reply({ error: "AI generation is temporarily unavailable" }, 503);
    }

    return reply({
      success: true,
      job: {
        id: data.job_id,
        status: data.status,
        alreadyExists: data.already_exists,
      },
    }, data.already_exists ? 200 : 202);
  } catch {
    return reply({ error: "AI generation is temporarily unavailable" }, 503);
  }
});
