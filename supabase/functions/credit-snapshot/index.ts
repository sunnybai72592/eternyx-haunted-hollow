import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { authenticateUser } from "../_shared/user-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

type Feature = { featureKey: string; creditsPerUse: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const { user, supabase } = await authenticateUser(req);
  if (!user || !supabase) return reply({ error: "Authentication required" }, 401);

  try {
    // Identity comes only from the verified bearer token. No caller-supplied
    // user ID or account selector is accepted by this endpoint.
    const { data, error } = await supabase.rpc("get_credit_snapshot", {
      p_user_id: user.id,
    });

    if (error) {
      const message = (error.message ?? "").toLowerCase();
      if (message.includes("multiple active subscriptions")) {
        return reply({ error: "Subscription records require reconciliation" }, 409);
      }
      if (message.includes("active subscription plan is not recognized")) {
        return reply({ error: "The active subscription plan could not be verified" }, 503);
      }
      console.error("[CREDIT-SNAPSHOT] Authoritative snapshot lookup failed");
      return reply({ error: "Credit information is not available for verification" }, 503);
    }

    if (!isRecord(data) ||
        (data.plan_id !== "free" && data.plan_id !== "premium" && data.plan_id !== "elite") ||
        !Number.isInteger(data.balance) ||
        (data.balance as number) < 0 ||
        !Array.isArray(data.features)) {
      console.error("[CREDIT-SNAPSHOT] Snapshot response failed validation");
      return reply({ error: "Credit service returned an invalid response" }, 503);
    }

    const features: Feature[] = [];
    for (const item of data.features) {
      if (!isRecord(item) ||
          typeof item.feature_key !== "string" ||
          !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(item.feature_key) ||
          !Number.isInteger(item.credits_per_use) ||
          (item.credits_per_use as number) < 0) {
        console.error("[CREDIT-SNAPSHOT] Feature policy failed validation");
        return reply({ error: "Credit service returned an invalid response" }, 503);
      }
      features.push({
        featureKey: item.feature_key,
        creditsPerUse: item.credits_per_use as number,
      });
    }

    return reply({
      planId: data.plan_id,
      balance: data.balance,
      features,
    });
  } catch {
    console.error("[CREDIT-SNAPSHOT] Snapshot request could not be completed");
    return reply({ error: "Credit information is temporarily unavailable" }, 503);
  }
});
