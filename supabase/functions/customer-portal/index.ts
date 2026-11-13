import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DEFAULT_APP_BASE_URL = "https://eternyx-haunted-hollow.lovable.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getTrustedReturnUrl(): string {
  const configured = Deno.env.get("APP_BASE_URL") || DEFAULT_APP_BASE_URL;
  const appUrl = new URL(configured);
  if (
    (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost" && appUrl.hostname !== "127.0.0.1") ||
    appUrl.username ||
    appUrl.password
  ) {
    throw new Error("APP_BASE_URL must be a trusted HTTPS URL");
  }
  return new URL("/subscription", appUrl.origin).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!bearerMatch) return jsonResponse({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !stripeKey) {
      return jsonResponse({ error: "Billing service is unavailable" }, 503);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(bearerMatch[1]);
    const user = data.user;
    if (error || !user?.id) return jsonResponse({ error: "Authentication required" }, 401);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const customers = await stripe.customers.list({
      email: user.email ?? undefined,
      limit: 100,
    });
    const customer = customers.data.find((candidate) => candidate.metadata?.user_id === user.id);
    if (!customer) {
      return jsonResponse({ error: "No billing account is associated with this user" }, 404);
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: getTrustedReturnUrl(),
    });

    return jsonResponse({ url: portalSession.url }, 200);
  } catch (error) {
    console.error(
      "[CUSTOMER-PORTAL] Session creation failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonResponse({ error: "Unable to create customer portal session" }, 500);
  }
});
