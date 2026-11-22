import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";
import {
  authorizedAccessExpiry, generateAccessToken, hashAccessToken, parseAccessRequest,
} from "../_shared/ctf-range-access-contract.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // Operator activation requires two independently configured server-only flags.
  // Neither is changed by a GitHub merge or by database migration alone.
  if (Deno.env.get("CTF_RANGE_ACCESS_ISSUANCE_ENABLED") !== "true" ||
      Deno.env.get("CTF_RANGE_INGRESS_REVIEWED") !== "true") {
    return reply({ error: "Hosted cyber range access is not enabled" }, 503);
  }

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 256) return reply({ error: "Request too large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request" }, 400);
  }
  const parsed = parseAccessRequest(body);
  if (!parsed) return reply({ error: "Invalid session access request" }, 400);

  // User identity is obtained exclusively from the verified JWT.
  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase || user.is_anonymous) {
    return reply({ error: "Sign in to access your cyber range" }, 401);
  }

  // Generate only inside this trusted Edge Function. Never store/emit token in logs.
  try {
    const accessToken = generateAccessToken();
    const tokenHash = await hashAccessToken(accessToken);
    const { data, error } = await supabase.rpc("ctf_range_issue_access_grant", {
      p_user_id: user.id,
      p_session_id: parsed.sessionId,
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("Range access issue RPC unavailable", { code: error.code });
      return reply({ error: "Session access is temporarily unavailable" }, 503);
    }
    if (data?.ok !== true) {
      const reason = data?.reason;
      const status = reason === "rate_limited" || reason === "active_limit" ? 429
        : reason === "provider_offline" ? 503
        : reason === "session_unavailable" ? 403 : 400;
      return reply({ granted: false, error:
        status === 429 ? "Too many active access credentials. Try again shortly."
        : status === 503 ? "The secure lab provider is unavailable."
        : "This account does not have a live, accessible session."
      }, status);
    }
    if (data.session_id !== parsed.sessionId ||
        !authorizedAccessExpiry(data.expires_at, new Date())) {
      console.error("Range access RPC returned an invalid expiry or session");
      return reply({ error: "Session access is temporarily unavailable" }, 503);
    }
    return reply({
      granted: true,
      sessionId: parsed.sessionId,
      accessToken,
      expiresAt: data.expires_at,
      tokenType: "Bearer",
      scope: "single-lab-session",
      // No public target URL is provided here: ingress routing is a separate gate.
      hostedTargetUrl: null,
    }, 201);
  } catch {
    console.error("Range access token generation failed");
    return reply({ error: "Session access is temporarily unavailable" }, 503);
  }
});
