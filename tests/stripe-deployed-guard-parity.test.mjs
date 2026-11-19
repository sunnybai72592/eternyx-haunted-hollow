import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [checkout, portal, webhook, sub, migration] = await Promise.all([
  "supabase/functions/create-checkout/index.ts",
  "supabase/functions/customer-portal/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
  "supabase/functions/check-subscription/index.ts",
  "supabase/migrations/20261113200000_stripe_webhook_lifecycle_foundation.sql",
].map(read));
test("all billing Stripe-write handlers share explicit opt-in test-mode gate", () => {
  for (const source of [checkout, portal, webhook])
    assert.match(source, /Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"/);
});
test("portal test-mode gate executes before any Stripe customer reads or portal session creation", () => {
  const gate=portal.indexOf('Deno.env.get("ETERNYX_STRIPE_CHECKOUT_MODE")');
  const customers=portal.indexOf('stripe.customers.list(');
  const session=portal.indexOf('stripe.billingPortal.sessions.create(');
  assert.ok(gate>=0 && gate<customers && customers<session);
  assert.match(portal, /Billing portal is not enabled/);
});
test("webhook test-mode gate rejects events before signature processing or database claim", () => {
  const gate=webhook.indexOf('Deno.env.get("ETERNYX_STRIPE_CHECKOUT_MODE")');
  const signature=webhook.indexOf('req.headers.get("Stripe-Signature")');
  const claim=webhook.indexOf('claim_stripe_webhook_event');
  assert.ok(gate>=0 && gate<signature && signature<claim);
  assert.match(webhook, /Stripe webhook is not enabled/);
});
test("all billing Stripe-write handlers reject live keys", () => {
  for (const source of [checkout, portal, webhook])
    assert.match(source, /sk_test_\|rk_test_/);
  assert.match(portal, /Billing service is unavailable/);
  assert.match(webhook, /Webhook endpoint is not configured/);
});
test("portal binds Stripe customer to authenticated account and only allows trusted return URLs", () => {
  assert.match(portal,/supabase\.auth\.getUser\(bearerMatch\[1\]\)/);
  assert.match(portal,/candidate\.metadata\?\.user_id === user\.id/);
  assert.match(portal,/return_url: getTrustedReturnUrl\(\)/);
  assert.doesNotMatch(portal, /req\.headers\.get\("origin"\)/);
});
test("webhook verifies Stripe signature and claims events idempotently", () => {
  assert.match(webhook,/constructEventAsync\(/);
  assert.match(webhook,/claim_stripe_webhook_event/);
  assert.match(webhook,/complete_stripe_webhook_event/);
  assert.match(webhook,/fail_stripe_webhook_event/);
});
test("subscription status lookup reads server-authoritative projection and fails closed", () => {
  assert.match(sub,/from\("billing_subscriptions"\)/);
  assert.match(sub,/Subscription status is not available for verification/);
  assert.match(sub,/Multiple active subscriptions require reconciliation/);
});
test("database migration denies browser reads and privileged webhook mutations", () => {
  assert.match(migration,/REVOKE ALL ON TABLE public\.billing_subscriptions FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.stripe_webhook_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.claim_stripe_webhook_event\(TEXT, TEXT\) FROM PUBLIC, anon, authenticated/);
});
