import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Subscription service is unavailable" }, 503);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(bearerMatch[1]);
    const user = authData.user;
    if (authError || !user?.id) return jsonResponse({ error: "Authentication required" }, 401);

    // This table is created by the reviewed webhook migration. If it is not
    // installed yet, fail closed instead of falling back to a live Stripe lookup.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: stripeRecords, error: stripeError } = await admin
      .from("billing_subscriptions")
      .select("stripe_subscription_id, status, plan_id, current_period_end, cancel_at_period_end, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(101);
    const { data: polarRecords, error: polarError } = await admin
      .from("polar_billing_subscriptions")
      .select("polar_subscription_id, status, plan_id, current_period_end, cancel_at_period_end, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(101);
    // Both private provider projections must be healthy. Never silently
    // downgrade to a partial payment view, and never assume a free plan.
    const lookupError = stripeError || polarError;
    const records = [
      ...(stripeRecords ?? []).map((record) => ({ ...record, subscription_provider: "stripe" as const })),
      ...(polarRecords ?? []).map((record) => ({ ...record, subscription_provider: "polar" as const })),
    ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    if (lookupError) {
      console.error("[CHECK-SUBSCRIPTION] Authoritative projection lookup failed");
      return jsonResponse({ error: "Subscription status is not available for verification" }, 503);
    }
    if (!stripeRecords || !polarRecords || stripeRecords.length > 100 || polarRecords.length > 100 || records.length > 200) {
      return jsonResponse({ error: "Subscription records require reconciliation" }, 503);
    }

    const activeRecords = records.filter(
      (record) => record.status === "active" || record.status === "trialing",
    );
    if (activeRecords.length > 1) {
      return jsonResponse({ error: "Multiple active subscriptions require reconciliation" }, 409);
    }

    const current = activeRecords[0];
    if (!current) {
      const latest = records[0];
      return jsonResponse({
        subscribed: false,
        subscription_tier: null,
        subscription_end: latest?.current_period_end ?? null,
        subscription_status: latest?.status ?? "none",
        subscription_provider: latest?.subscription_provider ?? null,
        cancel_at_period_end: latest?.cancel_at_period_end ?? false,
      }, 200);
    }

    const tier = current.plan_id === "premium" || current.plan_id === "elite"
      ? current.plan_id
      : null;
    // Polar billing here is SANDBOX ONLY: never promote a test subscription
    // to production entitlement. Keep its verified state visible for QA.
    const polarSandbox = current.subscription_provider === "polar";

    return jsonResponse({
      subscribed: !polarSandbox,
      subscription_tier: polarSandbox ? null : tier,
      subscription_end: current.current_period_end,
      subscription_status: current.status,
      subscription_provider: current.subscription_provider,
      sandbox_subscription: polarSandbox ? {
        provider: "polar", plan_id: tier, status: current.status,
      } : null,
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
