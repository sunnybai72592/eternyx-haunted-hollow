import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
      return jsonResponse({ error: "Subscription service is unavailable" }, 503);
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
      return jsonResponse({
        subscribed: false,
        subscription_tier: null,
        subscription_end: null,
        subscription_status: "none",
      }, 200);
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 100,
    });
    const current = subscriptions.data
      .filter((subscription) => subscription.status === "active" || subscription.status === "trialing")
      .sort((a, b) => b.created - a.created)[0];

    if (!current) {
      const latest = subscriptions.data.sort((a, b) => b.created - a.created)[0];
      return jsonResponse({
        subscribed: false,
        subscription_tier: null,
        subscription_end: latest?.current_period_end
          ? new Date(latest.current_period_end * 1000).toISOString()
          : null,
        subscription_status: latest?.status ?? "none",
      }, 200);
    }

    const planId = current.metadata?.plan_id;
    const tier = planId === "premium" || planId === "elite" ? planId : null;

    return jsonResponse({
      subscribed: true,
      subscription_tier: tier,
      subscription_end: new Date(current.current_period_end * 1000).toISOString(),
      subscription_status: current.status,
      cancel_at_period_end: current.cancel_at_period_end,
    }, 200);
  } catch (error) {
    console.error(
      "[CHECK-SUBSCRIPTION] Lookup failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return jsonResponse({ error: "Unable to retrieve subscription status" }, 500);
  }
});
