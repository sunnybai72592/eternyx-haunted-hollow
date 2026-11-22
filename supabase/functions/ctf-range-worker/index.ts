import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { verifyWorkerToken, safeWorkerSession } from "../_shared/ctf-range-worker-contract.mjs";
import {
  acceptedWorkerOwner, parseFencedWorkerRequest, trustedWorkerResult,
} from "../_shared/ctf-range-fenced-contract.mjs";

/**
 * Trusted provider broker; NOT a browser API. The Edge Function alone
 * knows the Supabase secret key and trusted configured worker identity.
 * Its dedicated API token is authenticated before ANY database access.
 * This PR adds fencing without enabling any hosted target or compute.
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
  if (Deno.env.get("CTF_RANGE_WORKER_ENABLED") !== "true") {
    return reply({ error: "Range worker endpoint is disabled" }, 503);
  }

  const configured = Deno.env.get("CTF_RANGE_WORKER_TOKEN") ?? "";
  const supplied = req.headers.get("x-range-worker-token") ?? "";
  if (!await verifyWorkerToken(supplied, configured)) {
    return reply({ error: "Unauthorized worker" }, 401);
  }

  // Fixed operator ID is server configuration, never trusted request data.
  const owner = Deno.env.get("CTF_RANGE_PROVIDER_ID") ?? "";
  if (!acceptedWorkerOwner(owner)) {
    return reply({ error: "Trusted range worker is not configured" }, 503);
  }

  let parsed: ReturnType<typeof parseFencedWorkerRequest>;
  try {
    const raw = await req.text();
    if (raw.length > 512) return reply({ error: "Request is too large" }, 413);
    parsed = parseFencedWorkerRequest(JSON.parse(raw));
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }
  if (!parsed) return reply({ error: "Invalid worker action" }, 400);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    if (!url) return reply({ error: "Worker persistence unavailable" }, 503);
    const db = createClient(url, getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (parsed.action === "acquire") {
      // Atomic coordinator acquisition/renewal also records liveness.
      const { data, error } = await db.rpc("ctf_range_worker_acquire", {
        p_owner_id: owner, p_current_fence: parsed.leaseId ?? null,
      });
      if (error) {
        console.error("Range worker acquire failed", { code: error.code });
        return reply({ error: "Worker lease service unavailable" }, 503);
      }
      if (!trustedWorkerResult(data, "acquire")) {
        return reply({ ok: false, reason: data?.reason === "lease_busy" ? "lease_busy" : "unavailable" }, 409);
      }
      // Fence ID is intentionally visible ONLY to this authenticated worker.
      return reply({ ok: true, leaseId: data.fence_id, expiresAt: data.expires_at });
    }

    if (parsed.action === "claim") {
      const { data, error } = await db.rpc("ctf_range_worker_claim", {
        p_owner_id: owner, p_fence_id: parsed.leaseId,
      });
      if (error) {
        console.error("Range worker claim failed", { code: error.code });
        return reply({ error: "Worker claim unavailable" }, 503);
      }
      if (data?.ok !== true) {
        const reason = typeof data?.reason === "string" ? data.reason : "unavailable";
        return reply({ ok: false, reason: [
          "lease_lost", "provider_offline", "budget_disabled",
          "budget_exhausted", "empty",
        ].includes(reason) ? reason : "unavailable" });
      }
      if (!trustedWorkerResult(data, "claim")) {
        return reply({ error: "Invalid worker claim response" }, 503);
      }
      return reply({
        ok: true, sessionId: data.session_id,
        challengePack: data.challenge_pack, expiresAt: data.expires_at,
      });
    }

    if (parsed.action === "reconcile") {
      const { data, error } = await db.rpc("ctf_range_worker_inventory", {
        p_owner_id: owner, p_fence_id: parsed.leaseId,
      });
      if (error) {
        console.error("Range worker inventory failed", { code: error.code });
        return reply({ error: "Worker inventory unavailable" }, 503);
      }
      if (!trustedWorkerResult(data, "reconcile")) {
        return reply({ ok: false, reason: "lease_lost" }, 409);
      }
      // Explicitly redact any worker-owned records before returning inventory.
      const sessions = data.sessions.map((r: Record<string, unknown>) =>
        safeWorkerSession({
          id: r.id, status: r.status, expires_at: r.expiresAt,
          provider_instance_ref: r.instanceRef,
        }));
      return reply({ ok: true, sessions });
    }

    if (parsed.action === "report") {
      const { data, error } = await db.rpc("ctf_range_worker_report", {
        p_owner_id: owner,
        p_fence_id: parsed.leaseId,
        p_session_id: parsed.sessionId,
        p_next_state: parsed.state,
        p_instance_ref: parsed.state === "running" ? parsed.instanceRef : null,
      });
      if (error) {
        console.error("Range worker fenced report failed", { code: error.code });
        return reply({ error: "Worker report unavailable" }, 503);
      }
      return reply({ ok: data === true });
    }

    if (parsed.action === "release") {
      const { data, error } = await db.rpc("ctf_range_worker_release", {
        p_owner_id: owner, p_fence_id: parsed.leaseId,
      });
      if (error) {
        console.error("Range worker release failed", { code: error.code });
        return reply({ error: "Worker release unavailable" }, 503);
      }
      return reply({ ok: data === true });
    }
    return reply({ error: "Unsupported action" }, 400);
  } catch {
    console.error("Unexpected range provider backend failure");
    return reply({ error: "Range provider temporarily unavailable" }, 503);
  }
});
