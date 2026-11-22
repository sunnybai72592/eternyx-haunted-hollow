import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  parseRangeRequest, providerIsOnline, publicRangeSession,
} from "../_shared/ctf-range-contract.mjs";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: responseHeaders });

const reasonStatuses: Record<string, number> = {
  provider_offline: 503,
  capacity_full: 429,
  daily_limit: 429,
  invalid_request: 400,
  not_found_or_closed: 404,
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 512) return reply({ error: "Request is too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON request" }, 400);
  }
  const parsed = parseRangeRequest(body);
  if (!parsed.ok) return reply({ error: "Invalid range control request" }, 400);

  // JWT subject, not a body field or user_metadata, is the ONLY account identity.
  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase || user.is_anonymous) {
    return reply({ error: "Sign in to manage cyber range sessions" }, 401);
  }

  try {
    if (parsed.action === "status") {
      const { data, error } = await supabase.from("ctf_range_provider")
        .select("enabled,ingress_approved,max_active_sessions,last_heartbeat_at").eq("singleton_id", 1)
        .maybeSingle();
      if (error) {
        console.error("Range provider capability unavailable", { code: error.code });
        return reply({ error: "Range provider status is unavailable" }, 503);
      }

      // A false status does not create any session or incur VM/container costs.
      return reply({
        providerOnline: providerIsOnline(data, new Date()),
        maxConcurrentSessions: data && Number.isInteger(data.max_active_sessions)
          ? data.max_active_sessions : 0,
        sessionDurationMinutes: 15,
        hostedAccessAvailable: false, // No secure routed challenge URLs in this milestone.
        message: "Provider sessions require a separately deployed, reviewed isolation service.",
      });
    }

    if (parsed.action === "sessions") {
      const { data, error } = await supabase.from("ctf_range_sessions")
        .select("id,challenge_pack,status,requested_at,updated_at,expires_at,started_at,finished_at")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false }).limit(12);
      if (error) {
        console.error("Range session listing unavailable", { code: error.code });
        return reply({ error: "Range sessions are temporarily unavailable" }, 503);
      }
      const sessions = (data ?? []).map((session: Record<string, unknown>) => publicRangeSession(session));
      return reply({ sessions, source: "authenticated_server", hostedAccessAvailable: false });
    }

    if (parsed.action === "request") {
      // SQL performs one serialized capacity decision with one active session/user,
      // <=3 requests/user/24h, max 3 global slots, 15m expiry, stale heartbeat refusal.
      // No Docker or other privileged host API is exposed to this Edge Function.
      const { data, error } = await supabase.rpc("ctf_range_request_session", {
        p_user_id: user.id,
        p_challenge_pack: "http-basics-v1",
      });
      if (error || !data || typeof data !== "object") {
        console.error("Range capacity request failed", { code: error?.code ?? null });
        return reply({ error: "Range reservation service is unavailable" }, 503);
      }
      if (data.ok !== true) {
        const code = typeof data.reason === "string" ? data.reason : "provider_offline";
        return reply({
          accepted: false, code,
          error: code === "provider_offline"
            ? "The isolated range provider is not enabled or has no recent heartbeat."
            : code === "capacity_full" ? "All isolated range slots are currently reserved."
            : code === "daily_limit" ? "This account has reached its daily lab-session limit."
            : "Range request could not be accepted.",
        }, reasonStatuses[code] ?? 503);
      }
      return reply({
        accepted: true,
        sessionId: data.session_id,
        status: data.status,
        expiresAt: data.expires_at,
        reused: data.reused === true,
        hostedAccessAvailable: false,
        message: "Reservation recorded. Secure per-session ingress is not implemented yet.",
      }, 202);
    }

    if (parsed.action === "stop") {
      const { data, error } = await supabase.rpc("ctf_range_stop_session", {
        p_user_id: user.id,
        p_session_id: parsed.sessionId,
      });
      if (error || !data || typeof data !== "object") {
        console.error("Range stop request failed", { code: error?.code ?? null });
        return reply({ error: "Unable to request range termination" }, 503);
      }
      if (data.ok !== true) {
        return reply({ error: "Session was not found or has already finished" }, 404);
      }
      return reply({
        stopped: data.status === "stopped",
        sessionId: data.session_id,
        status: data.status,
        message: data.status === "stopping"
          ? "Stop requested. Worker cleanup must finish before the slot is released."
          : "Queued session cancelled before allocation.",
      });
    }

    return reply({ error: "Unsupported range action" }, 400);
  } catch {
    console.error("Unexpected cyber range controller failure");
    return reply({ error: "Cyber range controller is temporarily unavailable" }, 503);
  }
});
