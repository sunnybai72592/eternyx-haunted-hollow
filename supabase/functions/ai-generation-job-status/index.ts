import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const SAFE_STATUSES = new Set([
  "queued",
  "reserved",
  "submitted",
  "processing",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "reconciliation_required",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  let body: { jobId?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }

  if (!isUuid(body.jobId)) {
    return reply({ error: "A valid job ID is required" }, 400);
  }

  try {
    // Explicitly select only safe lifecycle metadata. Never return prompts,
    // input payloads, provider task IDs, output object keys, or internal events.
    const { data, error } = await supabase
      .from("ai_generation_jobs")
      .select("id, feature_key, status, attempt_count, max_attempts, available_at, created_at, updated_at, started_at, completed_at, failure_code")
      .eq("id", body.jobId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("AI job status lookup failed", { code: error.code ?? null });
      return reply({ error: "AI job status is temporarily unavailable" }, 503);
    }

    if (!data) return reply({ error: "AI job not found" }, 404);
    if (!SAFE_STATUSES.has(data.status)) {
      return reply({ error: "AI job status is unavailable" }, 503);
    }

    return reply({
      success: true,
      job: {
        id: data.id,
        featureKey: data.feature_key,
        status: data.status,
        attemptCount: data.attempt_count,
        maxAttempts: data.max_attempts,
        availableAt: data.available_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        failureCode: data.failure_code,
      },
    });
  } catch {
    return reply({ error: "AI job status is temporarily unavailable" }, 503);
  }
});
