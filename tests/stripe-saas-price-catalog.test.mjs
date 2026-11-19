import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [checkout, webhook, portal] = await Promise.all([
  "supabase/functions/create-checkout/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
  "supabase/functions/customer-portal/index.ts",
].map(read));

test("both Stripe Edge Function handlers parse as valid TypeScript", () => {
  for (const [name, source] of [["checkout", checkout], ["webhook", webhook]]) {
    const parsed = ts.createSourceFile(name + ".ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics.map(problem => problem.messageText), [], name + " must parse");
  }
});

test("webhook startup guard contains real newlines rather than literal escapes", () => {
  assert.doesNotMatch(webhook, /\\n/);
  assert.match(webhook, /if \(Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"\) \{/);
  assert.match(webhook, /const signature = req\.headers\.get\("Stripe-Signature"\)/);
});

test("checkout defines two digital recurring plans by environment-configured Stripe Price IDs", () => {
  assert.match(checkout, /STRIPE_PREMIUM_MONTHLY_PRICE_ID/);
  assert.match(checkout, /STRIPE_ELITE_MONTHLY_PRICE_ID/);
  assert.match(checkout, /eternyx_premium_monthly/);
  assert.match(checkout, /eternyx_elite_monthly/);
  assert.doesNotMatch(checkout, /2999|9999|price_data:|product_data:|unit_amount: selectedPlan\.amount/);
});

test("checkout rejects absent and invalid Price IDs before any Stripe network request", () => {
  const envCheck = checkout.indexOf('Deno.env.get(selectedPlan.priceEnv)');
  const rejection = checkout.indexOf('error: "Subscription pricing is not configured"');
  const stripeInit = checkout.indexOf('const stripe = new Stripe(');
  assert.ok(envCheck >= 0 && rejection > envCheck && stripeInit > rejection);
  assert.match(checkout, /\/\^price_\[a-zA-Z0-9\]\+\$\//);
});

test("checkout validates live Stripe catalog records before it creates customers", () => {
  const retrieved = checkout.indexOf("stripe.prices.retrieve(configuredPriceId");
  const validated = checkout.indexOf("price.lookup_key !== selectedPlan.lookupKey");
  const customer = checkout.indexOf("stripe.customers.list(");
  assert.ok(retrieved >= 0 && validated > retrieved && customer > validated);
  for (const phrase of [
    'price.type !== "recurring"',
    'price.recurring?.interval !== "month"',
    "price.recurring?.interval_count !== 1",
    "price.unit_amount === null",
    "price.currency !== \"usd\"",
    "price.lookup_key !== selectedPlan.lookupKey",
    "product.metadata?.eternyx_plan_id !== planId",
  ]) assert.ok(checkout.includes(phrase), "Missing price verification: "+phrase);
});

test("price lookup key and product metadata bind subscription purchase to selected tier", () => {
  assert.match(checkout, /line_items: \[\{ price: configuredPriceId, quantity: 1 \}\]/);
  assert.match(checkout, /subscription_data: \{/);
  assert.match(checkout, /metadata: \{ user_id: user\.id, plan_id: planId \}/);
  assert.doesNotMatch(checkout, /body\.priceId|body\.price|body\.amount/);
});

test("checkout remains test-only and source of truth cannot be a client price", () => {
  assert.match(checkout, /Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"/);
  assert.match(checkout, /\/\^\(sk_test_\|rk_test_\)\//);
  assert.match(portal, /Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"/);
  assert.match(webhook, /constructEventAsync\(/);
});

test("test account and Saudi SaaS registration decisions remain documented as separate work", async () => {
  const docs = await read("SAAS_STRIPE_SAUDI_BUSINESS_SETUP_2026-11.md");
  assert.match(docs, /digital services/);
  assert.match(docs, /US test account/);
  assert.match(docs, /No live charges/);
  assert.match(docs, /Stripe Tax/);
  assert.match(docs, /STRIPE_PREMIUM_MONTHLY_PRICE_ID/);
});
