import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Polar Merchant-of-Record hosted checkout. Sandbox ONLY.
 * No account, prices, or Stripe data are fabricated. The signed provider
 * subscription webhook (not a browser redirect) controls any entitlement.
 */
const POLAR_SANDBOX_API = "https://sandbox-api.polar.sh";
const DEFAULT_APP_BASE_URL = "https://eternyx-haunted-hollow.lovable.app";
const MAX_BODY_BYTES = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plans = {
  premium: { productEnv: "POLAR_PREMIUM_PRODUCT_ID" },
  elite: { productEnv: "POLAR_ELITE_PRODUCT_ID" },
} as const;
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

function response(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}
async function readBody(req: Request): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
function approvedReturnUrl(): string {
  const configured = Deno.env.get("APP_BASE_URL") || DEFAULT_APP_BASE_URL;
  const url = new URL(configured);
  if ((url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error("Trusted application base URL is invalid");
  }
  return url.origin + "/subscriptions";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return response("Method not allowed", 405);

  // This independent server gate is required even if the UI flag is enabled.
  // Only Polar's ISOLATED sandbox API is ever contacted in this function.
  if (Deno.env.get("ETERNYX_POLAR_CHECKOUT_MODE") !== "sandbox") {
    return response("Polar sandbox checkout is not enabled", 503);
  }
  const token = Deno.env.get("POLAR_SANDBOX_ACCESS_TOKEN");
  if (!token || !token.startsWith("polar_oat_")) {
    return response("Polar sandbox merchant is not configured", 503);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return response("Authentication service unavailable", 503);

  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return response("Authentication required", 401);
  const auth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await auth.auth.getUser(bearer[1]);
  const user = data.user;
  if (error || !user?.id || !user.email || !UUID.test(user.id)) {
    return response("Authentication required", 401);
  }

  try {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return response("Request too large", 413);
    if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      return response("Content-Type must be application/json", 415);
    }
    const raw = await readBody(req);
    let input: unknown;
    try { input = JSON.parse(raw); }
    catch { return response("Invalid request JSON", 400); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return response("Invalid request", 400);
    const planId = (input as { planId?: unknown }).planId;
    if (typeof planId !== "string" || !Object.prototype.hasOwnProperty.call(plans, planId)) {
      return response("Unknown subscription tier", 400);
    }
    const plan = plans[planId as keyof typeof plans];
    const productId = Deno.env.get(plan.productEnv);
    if (!productId || !UUID.test(productId)) return response("Polar catalog is not configured", 503);
    const returnUrl = approvedReturnUrl();
    const apiHeaders = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };

    // Verify the actual catalog product and its plan metadata BEFORE checkout.
    const productResult = await fetch(POLAR_SANDBOX_API + "/v1/products/" + encodeURIComponent(productId), {
      method: "GET", headers: apiHeaders, signal: AbortSignal.timeout(12000),
    });
    if (!productResult.ok) return response("Polar catalog verification unavailable", 503);
    const product = await productResult.json() as Record<string, unknown>;
    const metadata = product.metadata as Record<string, unknown> | undefined;
    if (product.id !== productId || product.is_archived === true ||
        product.is_recurring !== true || product.recurring_interval !== "month" ||
        metadata?.eternyx_plan_id !== planId) {
      return response("Polar recurring product does not match this tier", 503);
    }

    const checkout = await fetch(POLAR_SANDBOX_API + "/v1/checkouts/", {
      method: "POST", headers: apiHeaders, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        products: [productId],
        external_customer_id: user.id,
        customer_email: user.email,
        metadata: { user_id: user.id, plan_id: planId },
        allow_trial: false,
        success_url: returnUrl + "?polar_checkout=completed",
        return_url: returnUrl,
      }),
    });
    if (!checkout.ok) return response("Unable to create Polar sandbox checkout", 503);
    const result = await checkout.json() as { url?: unknown };
    if (typeof result.url !== "string") return response("Provider did not return checkout URL", 502);
    const checkoutUrl = new URL(result.url);
    if (checkoutUrl.protocol !== "https:" ||
        checkoutUrl.hostname !== "sandbox.polar.sh" ||
        checkoutUrl.username || checkoutUrl.password) {
      return response("Provider returned an untrusted checkout destination", 502);
    }
    return new Response(JSON.stringify({ url: checkoutUrl.toString(), provider: "polar", environment: "sandbox" }), {
      status: 200, headers,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "BODY_TOO_LARGE") return response("Request too large", 413);
    console.error("[POLAR-CHECKOUT] Sandbox request unavailable");
    return response("Polar sandbox checkout could not be verified", 503);
  }
});
