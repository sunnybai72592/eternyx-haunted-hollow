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
    const bearerMatch = authorization?.match(/^Bearer\\s+(.+)$/i);
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
    const { data: records, error: lookupError } = await admin
      .from("billing_subscriptions")
      .select("stripe_subscription_id, status, plan_id, current_period_end, cancel_at_period_end, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(101);

    if (lookupError) {
      console.error("[CHECK-SUBSCRIPTION] Authoritative projection lookup failed");
      return jsonResponse({ error: "Subscription status is not available for verification" }, 503);
    }
    if (!records || records.length > 100) {
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
        cancel_at_period_end: latest?.cancel_at_period_end ?? false,
      }, 200);
    }

    const tier = current.plan_id === "premium" || current.plan_id === "elite"
      ? current.plan_id
      : null;

    return jsonResponse({
      subscribed: true,
      subscription_tier: tier,
      subscription_end: current.current_period_end,
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
