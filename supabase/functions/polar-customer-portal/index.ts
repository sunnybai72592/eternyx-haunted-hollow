import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Authenticate the account, then create a provider-verified Polar sandbox customer portal session. */
const SANDBOX_API = "https://sandbox-api.polar.sh";
const FALLBACK_APP_URL = "https://eternyx-haunted-hollow.lovable.app";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json("Method not allowed", 405);
  if (Deno.env.get("ETERNYX_POLAR_CHECKOUT_MODE") !== "sandbox") {
    return json("Polar sandbox portal is not enabled", 503);
  }
  const token = Deno.env.get("POLAR_SANDBOX_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!token?.startsWith("polar_oat_") || !supabaseUrl || !supabaseAnon) {
    return json("Polar sandbox merchant is not configured", 503);
  }
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return json("Authentication required", 401);
  const client = createClient(supabaseUrl, supabaseAnon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.getUser(bearer[1]);
  const user = data.user;
  if (error || !user?.id) return json("Authentication required", 401);

  try {
    const configured = Deno.env.get("APP_BASE_URL") || FALLBACK_APP_URL;
    const url = new URL(configured);
    if ((url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) ||
        url.username || url.password || url.search || url.hash) throw new Error("BAD_ORIGIN");
    const result = await fetch(SANDBOX_API + "/v1/customer-sessions/", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_customer_id: user.id,
        return_url: url.origin + "/subscriptions",
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!result.ok) return json("No verified Polar customer portal session is available", 503);
    const session = await result.json() as {
      customer_portal_url?: unknown;
      customer?: { external_id?: unknown };
    };
    if (session.customer?.external_id !== user.id ||
        typeof session.customer_portal_url !== "string") {
      return json("Polar customer ownership could not be verified", 503);
    }
    const portal = new URL(session.customer_portal_url);
    if (portal.protocol !== "https:" || portal.hostname !== "sandbox.polar.sh" ||
        portal.username || portal.password) return json("Untrusted Polar portal destination", 502);
    return new Response(JSON.stringify({ url: portal.toString(), provider: "polar", environment: "sandbox" }), {
      status: 200, headers,
    });
  } catch {
    console.error("[POLAR-PORTAL] Sandbox customer session unavailable");
    return json("Polar sandbox portal is unavailable", 503);
  }
});
