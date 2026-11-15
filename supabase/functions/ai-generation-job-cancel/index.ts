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

  if (!isUuid(body.jobId)) return reply({ error: "A valid job ID is required" }, 400);

  try {
    // The user ID is always taken from the verified access token, never the body.
    const { data, error } = await supabase.rpc("request_ai_generation_job_cancellation", {
      p_job_id: body.jobId,
      p_user_id: user.id,
    });

    if (error) {
      console.error("AI job cancellation request failed", { code: error.code ?? null });
      if (error.message?.includes("was not found")) {
        return reply({ error: "AI job not found" }, 404);
      }
      if (error.message?.includes("cannot be cancelled")) {
        return reply({ error: "AI job cannot be cancelled in its current state" }, 409);
      }
      return reply({ error: "AI job cancellation is temporarily unavailable" }, 503);
    }

    return reply({ success: true, cancellation: data });
  } catch {
    return reply({ error: "AI job cancellation is temporarily unavailable" }, 503);
  }
});
