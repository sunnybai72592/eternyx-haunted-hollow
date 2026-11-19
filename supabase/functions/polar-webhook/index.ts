import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { validateEvent } from "npm:@polar-sh/sdk/webhooks";

/**
 * Isolated sandbox Polar webhook:
 * - Raw body, official signed-event verification before parsing/trusting
 * - Idempotent database inbox; Polar API latest-state reconciliation
 * - Account ownership bound to Supabase auth UUID via external customer id
 * - Provider-side plan/product mapping; no client-controlled entitlements
 *
 * ETERNYX_POLAR_CHECKOUT_MODE=sandbox must be explicitly configured.
 */
const SANDBOX_API = "https://sandbox-api.polar.sh";
const BODY_LIMIT = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created", "subscription.updated", "subscription.active",
  "subscription.canceled", "subscription.uncanceled", "subscription.revoked",
  "subscription.past_due",
]);
const STATUSES = new Set([
  "incomplete", "incomplete_expired", "trialing", "active",
  "past_due", "canceled", "unpaid",
]);
function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
async function readLimited(req: Request): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BODY_LIMIT) {
        await reader.cancel();
        throw new Error("WEBHOOK_BODY_TOO_LARGE");
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
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Deno.env.get("ETERNYX_POLAR_CHECKOUT_MODE") !== "sandbox") {
    return json({ error: "Polar webhooks are disabled" }, 503);
  }
  const secret = Deno.env.get("POLAR_SANDBOX_WEBHOOK_SECRET");
  const token = Deno.env.get("POLAR_SANDBOX_ACCESS_TOKEN");
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !secret.startsWith("polar_whs_") || !token ||
      !token.startsWith("polar_oat_") || !url || !serviceRole) {
    return json({ error: "Polar sandbox webhook is not configured" }, 503);
  }

  const webhookId = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signature = req.headers.get("webhook-signature");
  if (!webhookId || !timestamp || !signature ||
      webhookId.length > 255 || timestamp.length > 80 || signature.length > 1000) {
    return json({ error: "Missing webhook signature" }, 400);
  }
  let event: { type?: unknown; data?: unknown };
  try {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declared) && declared > BODY_LIMIT) return json({ error: "Webhook too large" }, 413);
    const rawBody = await readLimited(req);
    // Official Polar SDK verifies standard-webhook HMAC & timestamp; never
    // accept unverified JSON or infer trust from a client-supplied header.
    event = validateEvent({
      payload: rawBody,
      headers: {
        "webhook-id": webhookId,
        "webhook-timestamp": timestamp,
        "webhook-signature": signature,
      },
      secret,
    }) as { type?: unknown; data?: unknown };
  } catch (error) {
    return json({ error: error instanceof Error && error.message === "WEBHOOK_BODY_TOO_LARGE"
      ? "Webhook too large" : "Invalid webhook signature or payload" },
      error instanceof Error && error.message === "WEBHOOK_BODY_TOO_LARGE" ? 413 : 400);
  }

  if (typeof event.type !== "string" || !SUBSCRIPTION_EVENTS.has(event.type)) {
    // No entitlement mutation for orders, checkouts or unsupported events.
    return json({ received: true, ignored: true }, 200);
  }
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json({ error: "Unsupported subscription event" }, 400);
  }
  const subscriptionId = (data as { id?: unknown }).id;
  if (typeof subscriptionId !== "string" || !UUID.test(subscriptionId)) {
    return json({ error: "Unsupported subscription ID" }, 400);
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: claim, error: claimError } = await admin.rpc("claim_polar_webhook_event", {
    p_event_id: webhookId,
    p_event_type: event.type,
  });
  if (claimError) return json({ error: "Unable to claim webhook event" }, 503);
  if (claim === "processed") return json({ received: true, duplicate: true }, 200);
  if (claim === "processing") return json({ error: "Event still processing" }, 409);
  if (claim !== "claimed") return json({ error: "Unknown claim state" }, 503);

  try {
    // Query Polar sandbox for its CURRENT authoritative subscription state.
    // This protects from out-of-order delivered events changing status back.
    const provider = await fetch(SANDBOX_API + "/v1/subscriptions/" + encodeURIComponent(subscriptionId), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(12000),
    });
    if (!provider.ok) throw new Error("POLAR_SUBSCRIPTION_UNAVAILABLE");
    const sub = await provider.json() as Record<string, unknown>;
    const status = sub.status;
    const customer = sub.customer;
    const externalId = customer && typeof customer === "object" && !Array.isArray(customer)
      ? (customer as { external_id?: unknown }).external_id : null;
    const customerId = sub.customer_id;
    const productId = sub.product_id;
    if (sub.id !== subscriptionId || typeof status !== "string" || !STATUSES.has(status) ||
        typeof externalId !== "string" || !UUID.test(externalId) ||
        typeof customerId !== "string" || !UUID.test(customerId) ||
        typeof productId !== "string" || !UUID.test(productId)) {
      throw new Error("POLAR_SUBSCRIPTION_VALIDATION_FAILED");
    }
    const premium = Deno.env.get("POLAR_PREMIUM_PRODUCT_ID");
    const elite = Deno.env.get("POLAR_ELITE_PRODUCT_ID");
    const planId = productId === premium && premium ? "premium"
      : productId === elite && elite ? "elite" : null;
    if (!planId || !premium || !elite || premium === elite) {
      throw new Error("POLAR_PRODUCT_MAPPING_UNAVAILABLE");
    }
    const period = sub.current_period_end;
    if (period !== null && period !== undefined &&
        (typeof period !== "string" || !Number.isFinite(Date.parse(period)))) {
      throw new Error("POLAR_INVALID_PERIOD");
    }
    const { error: saveError } = await admin.from("polar_billing_subscriptions").upsert({
      polar_subscription_id: subscriptionId,
      polar_customer_id: customerId,
      user_id: externalId,
      plan_id: planId,
      status,
      cancel_at_period_end: sub.cancel_at_period_end === true,
      current_period_end: period ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "polar_subscription_id" });
    if (saveError) throw new Error("POLAR_SUBSCRIPTION_SAVE_FAILED");
    const { error: finishError } = await admin.rpc("complete_polar_webhook_event", {
      p_event_id: webhookId,
    });
    if (finishError) throw new Error("POLAR_EVENT_COMPLETE_FAILED");
    return json({ received: true }, 200);
  } catch {
    await admin.rpc("fail_polar_webhook_event", {
      p_event_id: webhookId,
      p_error: "Unable to reconcile current Polar subscription state",
    });
    return json({ error: "Polar subscription reconciliation unavailable" }, 503);
  }
});
