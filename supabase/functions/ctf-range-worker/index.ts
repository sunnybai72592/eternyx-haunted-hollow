import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import {
  safeWorkerSession, validateWorkerRequest, verifyWorkerToken,
} from "../_shared/ctf-range-worker-contract.mjs";

/**
 * Privileged provider protocol. This endpoint is NOT called by the browser.
 * Worker has a purpose-specific secret; Supabase secret API key stays here.
 * Disabled unless the trusted operator explicitly enables it in server secrets.
 * No CORS, no API key disclosure, no arbitrary image/port/command parameters.
 */
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const enabled = Deno.env.get("CTF_RANGE_WORKER_ENABLED") === "true";
  if (!enabled) return reply({ error: "Range worker endpoint is disabled" }, 503);

  const configured = Deno.env.get("CTF_RANGE_WORKER_TOKEN") ?? "";
  const supplied = req.headers.get("x-range-worker-token") ?? "";
  if (!await verifyWorkerToken(supplied, configured)) {
    return reply({ error: "Unauthorized worker" }, 401);
  }

  let parsed: ReturnType<typeof validateWorkerRequest>;
  try {
    const bytes = await req.text();
    if (bytes.length > 512) return reply({ error: "Request is too large" }, 413);
    parsed = validateWorkerRequest(JSON.parse(bytes));
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (!parsed) return reply({ error: "Invalid worker action" }, 400);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const secret = getSupabaseSecretKey();
    if (!url) return reply({ error: "Worker persistence unavailable" }, 503);
    const db = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (parsed.action === "heartbeat") {
      // This does not enable the provider or authorize ingress. Those require
      // a separate operator-side approval and non-zero global budget.
      const { error } = await db.from("ctf_range_provider")
        .update({ last_heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("singleton_id", 1);
      if (error) {
        console.error("Range provider heartbeat update failed", { code: error.code });
        return reply({ error: "Worker heartbeat unavailable" }, 503);
      }
      return reply({ ok: true, heartbeatRecorded: true });
    }

    if (parsed.action === "claim") {
      const { data, error } = await db.rpc("ctf_range_claim_queued_session");
      if (error) {
        console.error("Range worker claim failed", { code: error.code });
        return reply({ error: "Unable to claim range session" }, 503);
      }
      if (data?.ok !== true) return reply({ ok: false, reason: data?.reason === "empty" ? "empty" : "provider_offline" });
      return reply({
        ok: true,
        sessionId: data.session_id,
        challengePack: data.challenge_pack,
        expiresAt: data.expires_at,
      });
    }

    if (parsed.action === "reconcile") {
      const { data, error } = await db.from("ctf_range_sessions")
        .select("id,status,expires_at,provider_instance_ref")
        .in("status", ["queued", "provisioning", "running", "stopping"])
        .order("requested_at", { ascending: true }).limit(12);
      if (error) {
        console.error("Range worker reconciliation failed", { code: error.code });
        return reply({ error: "Unable to reconcile range sessions" }, 503);
      }
      const sessions = (data ?? []).map((r: Record<string, unknown>) => safeWorkerSession(r));
      return reply({ ok: true, sessions });
    }

    if (parsed.action === "report") {
      const { data, error } = await db.rpc("ctf_range_report_session", {
        p_session_id: parsed.sessionId,
        p_next_state: parsed.state,
        p_instance_ref: parsed.state === "running" ? parsed.instanceRef : null,
      });
      if (error) {
        console.error("Range worker completion update failed", { code: error.code });
        return reply({ error: "Unable to update range status" }, 503);
      }
      return reply({ ok: data === true });
    }
    return reply({ error: "Unsupported action" }, 400);
  } catch {
    console.error("Unexpected range worker backend failure");
    return reply({ error: "Range worker is temporarily unavailable" }, 503);
  }
});
