import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("checkout authenticates the caller before parsing request data", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.ok(source.indexOf('req.headers.get("Authorization")') < source.indexOf("const rawBody = await readLimitedRequestText(req"));
  assert.match(source, /authorization\?\.match\(\/\^Bearer/);
  assert.match(source, /supabaseClient\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(source, /!user\?\.id \|\| !user\.email/);
});

test("checkout bounds and validates its JSON request body", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.match(source, /const REQUEST_BODY_LIMIT_BYTES = 4 \* 1024/);
  assert.match(source, /declaredLength > REQUEST_BODY_LIMIT_BYTES/);
  assert.match(source, /readLimitedRequestText\(req, REQUEST_BODY_LIMIT_BYTES\)/);
  assert.match(source, /total > limit/);
  assert.match(source, /await reader\.cancel\(\)/);
  assert.match(source, /JSON\.parse\(rawBody\)/);
  assert.match(source, /Request body must be a JSON object/);
  assert.doesNotMatch(source, /await req\.json\(\)/);
});

test("checkout accepts only server-defined paid plans and prices", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.match(source, /const plans = \{/);
  assert.match(source, /premium: \{ name:/);
  assert.match(source, /elite: \{ name:/);
  assert.match(source, /hasOwnProperty\.call\(plans, planId\)/);
  assert.match(source, /unit_amount: selectedPlan\.amount/);
  assert.doesNotMatch(source, /price_premium_monthly|price_elite_monthly/);
});

test("checkout binds Stripe customer and subscription metadata to the authenticated user", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.match(source, /customer\.metadata\?\.user_id === user\.id/);
  assert.match(source, /metadata: \{ user_id: user\.id \}/);
  assert.match(source, /subscription_data: \{/);
  assert.match(source, /plan_id: planId/);
});

test("checkout redirects only to a server-configured application URL", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.match(source, /Deno\.env\.get\("APP_BASE_URL"\) \|\| DEFAULT_APP_BASE_URL/);
  assert.match(source, /success_url: appUrl\.origin \+/);
  assert.match(source, /cancel_url: appUrl\.origin \+/);
  assert.doesNotMatch(source, /req\.headers\.get\("origin"\).*success_url|req\.headers\.get\("origin"\).*cancel_url/);
});

test("checkout returns generic server errors and rejects non-POST methods", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /Method not allowed/);
  assert.match(source, /Unable to create checkout session/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{ error: errorMessage \}\)/);
});

test("subscription lookup authenticates and reads only the server-managed projection", async () => {
  const source = await read("supabase/functions/check-subscription/index.ts");
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /authClient\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /from\("billing_subscriptions"\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /\.limit\(101\)/);
  assert.match(source, /record\.status === "active" \|\| record\.status === "trialing"/);
  assert.match(source, /activeRecords\.length > 1/);
  assert.match(source, /Subscription status is not available for verification/);
  assert.doesNotMatch(source, /import Stripe|stripe\.customers|stripe\.subscriptions/i);
  assert.doesNotMatch(source, /\.upsert\(/);
});

test("subscription lookup fails closed for ambiguous or excessive subscription records", async () => {
  const source = await read("supabase/functions/check-subscription/index.ts");
  assert.match(source, /records\.length > 100/);
  assert.match(source, /Multiple active subscriptions require reconciliation/);
  assert.match(source, /subscription_tier: tier/);
  assert.match(source, /current\.plan_id === "premium" \|\| current\.plan_id === "elite"/);
});

test("customer portal authenticates ownership and uses a trusted return URL", async () => {
  const source = await read("supabase/functions/customer-portal/index.ts");
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /supabase\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(source, /candidate\.metadata\?\.user_id === user\.id/);
  assert.match(source, /Deno\.env\.get\("APP_BASE_URL"\) \|\| DEFAULT_APP_BASE_URL/);
  assert.match(source, /return_url: getTrustedReturnUrl\(\)/);
  assert.doesNotMatch(source, /req\.headers\.get\("origin"\)/);
});


test("subscription hub does not present fabricated subscription, usage, or payment data", async () => {
  const source = await read("src/pages/enhanced/SubscriptionHub.tsx");
  assert.doesNotMatch(source, /sub_1234567890|4242|Dec 1, 2024|Nov 1, 2024|Oct 1, 2024/);
  assert.doesNotMatch(source, /usageMetrics|setCurrentSubscription|setUsageMetrics/);
  assert.match(source, /Usage reporting is not available yet/);
  assert.match(source, /Billing history and saved payment-method details are not connected yet/);
  assert.match(source, /create-checkout/);
  assert.match(source, /noopener,noreferrer/);
});


test("subscription manager never assumes free access when status lookup fails", async () => {
  const source = await read("src/components/SubscriptionManager.tsx");
  assert.match(source, /type LookupState = 'loading' \| 'ready' \| 'error'/);
  assert.match(source, /Your subscription status could not be verified/);
  assert.match(source, /No plan or access level is being assumed/);
  assert.match(source, /typeof data\.subscribed !== 'boolean'/);
  assert.match(source, /An active subscription was found, but its plan could not be identified/);
  assert.match(source, /subscriptionData\.cancel_at_period_end/);
  assert.doesNotMatch(source, /window\.open\(data\.url, '_blank'\)/);
});


test("Stripe webhook verifies the raw request body signature before processing", async () => {
  const source = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(source, /Stripe-Signature/);
  assert.match(source, /STRIPE_WEBHOOK_SECRET/);
  assert.match(source, /constructEventAsync\(/);
  assert.match(source, /Invalid webhook signature/);
  assert.match(source, /MAX_WEBHOOK_BODY_BYTES/);
  assert.doesNotMatch(source, /req\.json\(\)/);
});

test("Stripe webhook claims events idempotently and retries failed processing", async () => {
  const source = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(source, /claim_stripe_webhook_event/);
  assert.match(source, /complete_stripe_webhook_event/);
  assert.match(source, /fail_stripe_webhook_event/);
  assert.match(source, /claim === "processed"/);
  assert.match(source, /claim === "processing"/);
  assert.match(source, /return jsonResponse\(\{ error: "Webhook processing failed" \}, 500\)/);
});

test("Stripe webhook binds subscription state to verified customer metadata", async () => {
  const source = await read("supabase/functions/stripe-webhook/index.ts");
  assert.match(source, /subscription\.metadata\?\.user_id/);
  assert.match(source, /customer\.metadata\?\.user_id !== userId/);
  assert.match(source, /checkout\.session\.completed/);
  assert.match(source, /customer\.subscription\.updated/);
  assert.match(source, /billing_subscriptions/);
  assert.match(source, /onConflict: "stripe_subscription_id"/);
});

test("Stripe webhook lifecycle migration keeps billing tables server-managed", async () => {
  const source = await read("supabase/migrations/20261113200000_stripe_webhook_lifecycle_foundation.sql");
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.billing_subscriptions/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public\.stripe_webhook_events/);
  assert.match(source, /ENABLE ROW LEVEL SECURITY/);
  assert.match(source, /REVOKE ALL ON TABLE public\.billing_subscriptions FROM PUBLIC, anon, authenticated/);
  assert.match(source, /REVOKE ALL ON TABLE public\.stripe_webhook_events FROM PUBLIC, anon, authenticated/);
  assert.match(source, /claim_stripe_webhook_event/);
  assert.match(source, /processing_started_at < now\(\) - interval '10 minutes'/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.claim_stripe_webhook_event\(TEXT, TEXT\) TO service_role/);
});
