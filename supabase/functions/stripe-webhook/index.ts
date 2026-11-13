import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const corsHeaders = { "Content-Type": "application/json" };

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function readLimitedBody(req: Request, limit: number): Promise<string> {
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
  return new TextDecoder().decode(bytes);
}

function stripeObjectId(value: string | { id: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function syncSubscription(
  stripe: Stripe,
  admin: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.user_id;
  const customerId = stripeObjectId(subscription.customer);
  if (!userId || !isUuid(userId) || !customerId) {
    throw new Error("Subscription is missing a valid user or customer association");
  }

  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    throw new Error("Stripe customer is deleted");
  }
  if (customer.metadata?.user_id !== userId) {
    throw new Error("Stripe customer ownership metadata does not match subscription");
  }

  const planId = subscription.metadata?.plan_id;
  const knownPlan = planId === "premium" || planId === "elite" ? planId : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const { error } = await admin.from("billing_subscriptions").upsert({
    stripe_subscription_id: subscription.id,
    user_id: userId,
    stripe_customer_id: customerId,
    status: subscription.status,
    plan_id: knownPlan,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });

  if (error) throw new Error("Unable to persist subscription state");
}

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!signature || !webhookSecret || !stripeKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Webhook endpoint is not configured" }, 503);
  }

  try {
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
      return jsonResponse({ error: "Webhook payload is too large" }, 413);
    }

    const rawBody = await readLimitedBody(req, MAX_WEBHOOK_BODY_BYTES);
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      );
    } catch {
      return jsonResponse({ error: "Invalid webhook signature" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claim, error: claimError } = await admin.rpc("claim_stripe_webhook_event", {
      p_event_id: event.id,
      p_event_type: event.type,
    });
    if (claimError) throw new Error("Unable to claim webhook event");

    if (claim === "processed") return jsonResponse({ received: true, duplicate: true }, 200);
    if (claim === "processing") return jsonResponse({ error: "Event is already processing" }, 409);
    if (claim !== "claimed") throw new Error("Unexpected webhook event claim state");

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = stripeObjectId(session.subscription);
        if (session.mode === "subscription" && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const sessionUserId = session.metadata?.user_id;
          if (!sessionUserId || subscription.metadata?.user_id !== sessionUserId) {
            throw new Error("Checkout session and subscription ownership metadata mismatch");
          }
          await syncSubscription(stripe, admin, subscription);
        }
      } else if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.paused" ||
        event.type === "customer.subscription.resumed"
      ) {
        await syncSubscription(stripe, admin, event.data.object as Stripe.Subscription);
      }

      const { error: completeError } = await admin.rpc("complete_stripe_webhook_event", {
        p_event_id: event.id,
      });
      if (completeError) throw new Error("Unable to complete webhook event");
      return jsonResponse({ received: true }, 200);
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : "Unknown processing error";
      await admin.rpc("fail_stripe_webhook_event", {
        p_event_id: event.id,
        p_error: message,
      });
      console.error("Stripe webhook processing failed:", message);
      return jsonResponse({ error: "Webhook processing failed" }, 500);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "WEBHOOK_BODY_TOO_LARGE") {
      return jsonResponse({ error: "Webhook payload is too large" }, 413);
    }
    console.error("Stripe webhook request failed:", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ error: "Unable to process webhook" }, 500);
  }
});
