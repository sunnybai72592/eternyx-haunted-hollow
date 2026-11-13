import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const REQUEST_BODY_LIMIT_BYTES = 4 * 1024;
const DEFAULT_APP_BASE_URL = "https://eternyx-haunted-hollow.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const plans = {
  premium: { name: "Shadow Operative", amount: 2999 },
  elite: { name: "Cyber Overlord", amount: 9999 },
} as const;

async function readLimitedRequestText(req: Request, limit: number): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error("REQUEST_BODY_TOO_LARGE");
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

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Authenticate before reading or processing customer-supplied data.
    const authorization = req.headers.get("Authorization");
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase authentication is not configured");
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(bearerMatch[1]);
    const user = userData.user;
    if (userError || !user?.id || !user.email) {
      return jsonResponse({ error: "Authentication required" }, 401);
    }

    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > REQUEST_BODY_LIMIT_BYTES) {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ error: "Content-Type must be application/json" }, 415);
    }

    const rawBody = await readLimitedRequestText(req, REQUEST_BODY_LIMIT_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Request body must contain valid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Request body must be a JSON object" }, 400);
    }

    const planId = (body as { planId?: unknown }).planId;
    if (typeof planId !== "string" || !Object.prototype.hasOwnProperty.call(plans, planId)) {
      return jsonResponse({ error: "Invalid subscription plan" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe is not configured");

    // Never use an untrusted Origin header as a payment redirect destination.
    const configuredBaseUrl = Deno.env.get("APP_BASE_URL") || DEFAULT_APP_BASE_URL;
    const appUrl = new URL(configuredBaseUrl);
    if (
      (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost" && appUrl.hostname !== "127.0.0.1") ||
      appUrl.username ||
      appUrl.password
    ) {
      throw new Error("APP_BASE_URL must be a trusted HTTPS URL");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const existingCustomers = await stripe.customers.list({ email: user.email, limit: 100 });
    const existingCustomer = existingCustomers.data.find(
      (customer) => customer.metadata?.user_id === user.id,
    );
    const customer = existingCustomer ?? await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    });

    const selectedPlan = plans[planId as keyof typeof plans];
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: selectedPlan.name,
            description: \`\${selectedPlan.name} subscription plan\`,
          },
          unit_amount: selectedPlan.amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      mode: "subscription",
      success_url: \`\${appUrl.origin}/subscription?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${appUrl.origin}/subscription?cancelled=true\`,
      metadata: { user_id: user.id, plan_id: planId },
      subscription_data: {
        metadata: { user_id: user.id, plan_id: planId },
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return jsonResponse({ url: session.url }, 200);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE") {
      return jsonResponse({ error: "Request body is too large" }, 413);
    }
    console.error("Checkout session creation failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Unable to create checkout session" }, 500);
  }
});
