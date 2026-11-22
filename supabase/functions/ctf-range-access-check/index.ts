import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { getSupabaseSecretKey } from "../_shared/supabase.ts";
import { verifyWorkerToken } from "../_shared/ctf-range-worker-contract.mjs";
import {
  hashAccessToken, parseProxyVerification, validUserJwt,
} from "../_shared/ctf-range-access-contract.mjs";

/**
 * Private ingress verifier: one call for EACH forwarded training HTTP request.
 * Never use in the browser; operator's dedicated proxy secret stays server-side.
 * No CORS/OPTIONS, no direct target access, no account data or secret returned.
 */
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

serve(async (req: Request) => {
  if (req.method !== "POST") return reply({ authorized: false }, 405);
  if (Deno.env.get("CTF_RANGE_PROXY_VALIDATION_ENABLED") !== "true" ||
      Deno.env.get("CTF_RANGE_INGRESS_REVIEWED") !== "true") {
    return reply({ authorized: false }, 503);
  }
  const secret = Deno.env.get("CTF_RANGE_PROXY_TOKEN") ?? "";
  const supplied = req.headers.get("x-range-proxy-token") ?? "";
  if (!await verifyWorkerToken(supplied, secret)) {
    return reply({ authorized: false }, 401);
  }

  // The lab grant alone is insufficient: the signed-in learner must also
  // present a current, Auth-verifiable JWT. Both identities must match SQL.
  const userJwt = req.headers.get("x-range-user-jwt") ?? "";
  if (!validUserJwt(userJwt)) return reply({ authorized: false }, 401);

  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 256) return reply({ authorized: false }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ authorized: false }, 400);
  }
  const parsed = parseProxyVerification(body);
  if (!parsed) return reply({ authorized: false }, 400);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    if (!url) return reply({ authorized: false }, 503);
    const db = createClient(url, getSupabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await db.auth.getUser(userJwt);
    const user = authData?.user;
    if (authError || !user || user.is_anonymous) return reply({ authorized: false }, 403);

    const hash = await hashAccessToken(parsed.accessToken);
    const { data, error } = await db.rpc("ctf_range_check_access_grant", {
      p_session_id: parsed.sessionId,
      p_user_id: user.id,
      p_token_hash: hash,
    });
    if (error) {
      console.error("Range access verification unavailable", { code: error.code });
      return reply({ authorized: false }, 503);
    }
    // No user data, database state, provider address or internal IDs exposed.
    return reply({ authorized: data === true }, data === true ? 200 : 403);
  } catch {
    console.error("Range access verification failed");
    return reply({ authorized: false }, 503);
  }
});
