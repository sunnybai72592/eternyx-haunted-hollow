import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [checkout, tiers, hub, webhook, audit] = await Promise.all([
  "supabase/functions/create-checkout/index.ts",
  "src/components/enhanced/SubscriptionTiers.tsx",
  "src/pages/enhanced/SubscriptionHub.tsx",
  "supabase/functions/stripe-webhook/index.ts",
  "RELEASE_AUDIT_2026-11-19.md",
].map(read));

test("server checkout has an explicit disabled-by-default environment gate", () => {
  assert.match(checkout, /Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"/);
  assert.match(checkout, /jsonResponse\(\{ error: "Subscription checkout is not enabled" \}, 503\)/);
  assert.ok(checkout.indexOf('Deno.env.get("ETERNYX_STRIPE_CHECKOUT_MODE")') <
    checkout.indexOf('const stripe = new Stripe('), "gate must execute before any Stripe session");
});

test("server checkout refuses live secret and restricted keys even if the launch gate is enabled", () => {
  assert.match(checkout, /\/\^\(sk_test_\|rk_test_\)\//);
  assert.match(checkout, /Test checkout requires Stripe test credentials/);
  assert.ok(checkout.indexOf('const testStripeKey') < checkout.indexOf('const stripe = new Stripe('));
  assert.match(checkout, /const stripeKey = testStripeKey/);
});

test("gates appear after verified user authentication and before parsing customer data", () => {
  const auth = checkout.indexOf('supabaseClient.auth.getUser(bearerMatch[1])');
  const gate = checkout.indexOf('Deno.env.get("ETERNYX_STRIPE_CHECKOUT_MODE")');
  const body = checkout.indexOf("const rawBody = await readLimitedRequestText(req");
  assert.ok(auth >= 0 && gate > auth && body > gate);
  assert.match(checkout, /!user\?\.id \|\| !user\.email/);
});

test("checkout accepts only vetted Stripe test Price IDs rather than inline amounts", () => {
  assert.match(checkout, /const plans = \{/);
  assert.match(checkout, /premium: \{ name:/);
  assert.match(checkout, /elite: \{ name:/);
  assert.match(checkout, /hasOwnProperty\.call\(plans, planId\)/);
  assert.match(checkout, /Deno\.env\.get\(selectedPlan\.priceEnv\)/);
  assert.match(checkout, /stripe\.prices\.retrieve\(configuredPriceId/);
  assert.match(checkout, /price\.unit_amount === null \|\| price\.unit_amount <= 0/);
  assert.match(checkout, /price\.recurring\?\.interval !== "month"/);
  assert.match(checkout, /line_items: \[\{ price: configuredPriceId, quantity: 1 \}\]/);
  assert.doesNotMatch(checkout, /body\.price|unit_amount: body|body\.amount|price_data:/);
});

test("client checkout feature flag is default-off and never replaces server enforcement", () => {
  assert.match(hub, /import\.meta\.env\.VITE_ENABLE_STRIPE_TEST_CHECKOUT === 'true'/);
  assert.match(hub, /if \(!sandboxProvider\)/);
  assert.match(hub, /testCheckoutEnabled=\{sandboxProvider !== null\}/);
  assert.match(hub, /sandboxCheckoutEndpoint\(sandboxProvider\)/);
  assert.match(hub, /noopener,noreferrer/);
});

test("subscription cards do not promise unapproved prices, unlimited AI, or enterprise monitoring", () => {
  assert.match(tiers, /Live subscriptions are not for sale/);
  assert.match(tiers, /Final entitlements, costs and prices are not published/);
  assert.doesNotMatch(tiers, /\$29\.99|\$99\.99|MOST POPULAR|24\/7 threat monitoring|AI assistant \(unlimited\)|99\.9% Uptime|Military-grade encryption/);
  assert.match(tiers, /testCheckoutEnabled \? \(/);
  assert.match(tiers, /disabled className="w-full"/);
});

test("enabled UI explicitly calls test checkout and never claims real subscription activation", () => {
  assert.match(tiers, /Open sandbox test checkout/);
  assert.match(tiers, /No real card charges are supported/);
  assert.doesNotMatch(tiers, /payment_method_types|sk_test_|rk_test_|sk_live_/);
});

test("webhook still verifies signatures and preserves idempotent subscription synchronization", () => {
  assert.match(webhook, /constructEventAsync\(/);
  assert.match(webhook, /claim_stripe_webhook_event/);
  assert.match(webhook, /complete_stripe_webhook_event/);
  assert.match(webhook, /customer\.metadata\?\.user_id !== userId/);
});

test("Stripe readiness checklist keeps secret handling and deployment gates explicit", async () => {
  const doc = await read("STRIPE_TEST_MODE_READINESS_2026-11.md");
  assert.match(doc, /ETERNYX_STRIPE_CHECKOUT_MODE/);
  assert.match(doc, /VITE_ENABLE_STRIPE_TEST_CHECKOUT/);
  assert.match(doc, /test credentials/);
  assert.match(doc, /tax/);
  assert.match(doc, /not deployed/);
});

test("release audit keeps failed production deployment and live billing as separate blockers", () => {
  assert.match(audit, /critical/i);
  assert.match(audit, /November 23/);
  assert.match(audit, /November 25/);
});
