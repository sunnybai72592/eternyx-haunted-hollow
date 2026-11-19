import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [selector, checkout, portal, webhook, sub, migration, manager, hub] = await Promise.all([
  "src/lib/billing/sandbox-provider.ts",
  "supabase/functions/polar-checkout/index.ts",
  "supabase/functions/polar-customer-portal/index.ts",
  "supabase/functions/polar-webhook/index.ts",
  "supabase/functions/check-subscription/index.ts",
  "supabase/migrations/20261119221500_polar_mor_subscription_foundation.sql",
  "src/components/SubscriptionManager.tsx",
  "src/pages/enhanced/SubscriptionHub.tsx",
].map(read));
const selectorESM=ts.transpileModule(selector, {
  compilerOptions:{ module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022 },
}).outputText;
const provider=await import("data:text/javascript;base64,"+Buffer.from(selectorESM).toString("base64"));

test("Polar/Stripe routing fails closed when neither or both providers are enabled",()=>{
  assert.equal(provider.selectSandboxBillingProvider(false,false),null);
  assert.equal(provider.selectSandboxBillingProvider(true,true),null);
  assert.equal(provider.selectSandboxBillingProvider(true,false),"stripe");
  assert.equal(provider.selectSandboxBillingProvider(false,true),"polar");
});
test("each provider maps to its own checkout and customer portal endpoint",()=>{
  assert.equal(provider.sandboxCheckoutEndpoint("polar"),"polar-checkout");
  assert.equal(provider.sandboxCheckoutEndpoint("stripe"),"create-checkout");
  assert.equal(provider.sandboxPortalEndpoint("polar"),"polar-customer-portal");
  assert.equal(provider.sandboxPortalEndpoint("stripe"),"customer-portal");
});
test("both Polar endpoints use exact sandbox API host and default-off server gate",()=>{
  for (const source of [checkout,portal,webhook]){
    assert.match(source,/ETERNYX_POLAR_CHECKOUT_MODE/);
    assert.match(source,/!== "sandbox"/);
    assert.match(source,/https:\/\/sandbox-api\.polar\.sh/);
    assert.doesNotMatch(source,/https:\/\/api\.polar\.sh/);
    assert.match(source,/POLAR_SANDBOX_ACCESS_TOKEN/);
    assert.doesNotMatch(source,/POLAR_LIVE_ACCESS_TOKEN/);
  }
});
test("Polar checkout authenticates the real user and bounds request before provider call",()=>{
  assert.match(checkout,/auth\.auth\.getUser\(bearer\[1\]\)/);
  assert.match(checkout,/MAX_BODY_BYTES = 4096/);
  assert.match(checkout,/await reader\.cancel\(\)/);
  assert.match(checkout,/hasOwnProperty\.call\(plans, planId\)/);
  assert.match(checkout,/!UUID\.test\(productId\)/);
  assert.ok(checkout.indexOf('auth.auth.getUser(bearer[1])')<checkout.indexOf('fetch(POLAR_SANDBOX_API'));
});
test("Polar checkout vets SaaS product mapping and never invents amounts or live charges",()=>{
  assert.match(checkout,/POLAR_PREMIUM_PRODUCT_ID/);
  assert.match(checkout,/POLAR_ELITE_PRODUCT_ID/);
  assert.match(checkout,/product\.is_recurring !== true/);
  assert.match(checkout,/product\.recurring_interval !== "month"/);
  assert.match(checkout,/metadata\?\.eternyx_plan_id !== planId/);
  assert.doesNotMatch(checkout,/unit_amount:|price_data:|amount: 2999|amount: 9999/);
  assert.match(checkout,/products: \[productId\]/);
  assert.match(checkout,/allow_trial: false/);
});
test("Polar checkout binds customer identity to the authenticated Supabase user",()=>{
  assert.match(checkout,/external_customer_id: user\.id/);
  assert.match(checkout,/customer_email: user\.email/);
  assert.match(checkout,/metadata: \{ user_id: user\.id, plan_id: planId \}/);
  assert.match(checkout,/approvedReturnUrl\(\)/);
  assert.doesNotMatch(checkout,/req\.headers\.get\("origin"\)/);
});
test("Polar checkout refuses unexpected checkout redirects",()=>{
  assert.match(checkout,/checkoutUrl\.hostname !== "sandbox\.polar\.sh"/);
  assert.match(checkout,/checkoutUrl\.username \|\| checkoutUrl\.password/);
  assert.match(checkout,/Provider returned an untrusted checkout destination/);
});
test("Polar portal refuses to create sessions for unverified users or another customer",()=>{
  assert.match(portal,/client\.auth\.getUser\(bearer\[1\]\)/);
  assert.match(portal,/external_customer_id: user\.id/);
  assert.match(portal,/session\.customer\?\.external_id !== user\.id/);
  assert.match(portal,/portal\.hostname !== "sandbox\.polar\.sh"/);
  assert.doesNotMatch(portal,/req\.headers\.get\("origin"\)/);
});
test("Polar webhook verifies signatures before dedup, lookup or database writes",()=>{
  const signature=webhook.indexOf("validateEvent({");
  const claimed=webhook.indexOf('admin.rpc("claim_polar_webhook_event"');
  const fetched=webhook.indexOf('fetch(SANDBOX_API + "/v1/subscriptions/"');
  assert.ok(signature>=0&&claimed>signature&&fetched>claimed);
  for(const header of ["webhook-id","webhook-timestamp","webhook-signature"]){
    assert.ok(webhook.includes('req.headers.get("'+header+'")'));
  }
  assert.match(webhook,/from "npm:@polar-sh\/sdk\/webhooks"/);
  assert.match(webhook,/POLAR_SANDBOX_WEBHOOK_SECRET/);
});
test("webhook reconciles CURRENT subscription state, not just past event bodies",()=>{
  assert.match(webhook,/provider\.json\(\)/);
  assert.match(webhook,/customer.*external_id/);
  assert.match(webhook,/!UUID\.test\(externalId\)/);
  assert.match(webhook,/productId === premium/);
  assert.match(webhook,/productId === elite/);
  assert.match(webhook,/!premium \|\| !elite \|\| premium === elite/);
  assert.match(webhook,/from\("polar_billing_subscriptions"\)\.upsert/);
  assert.match(webhook,/complete_polar_webhook_event/);
  assert.match(webhook,/fail_polar_webhook_event/);
});
test("Polar webhook ignores checkout or order events as proof of entitlement",()=>{
  assert.match(webhook,/SUBSCRIPTION_EVENTS\.has\(event\.type\)/);
  assert.match(webhook,/received: true, ignored: true/);
  assert.doesNotMatch(webhook,/event\.type === "checkout\.completed"/);
  assert.match(webhook,/STATUSES = new Set/);
});
test("database projection and inbox are server-only with idempotent claim RPC",()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.polar_billing_subscriptions/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.polar_webhook_events/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.polar_billing_subscriptions FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/REVOKE ALL ON TABLE public\.polar_webhook_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/REVOKE ALL ON FUNCTION public\.claim_polar_webhook_event\(TEXT, TEXT\) FROM PUBLIC, anon, authenticated/);
  assert.match(migration,/processing_started_at < now\(\) - interval '10 minutes'/);
});
test("status lookup checks BOTH private projections and withholds access on conflict",()=>{
  assert.match(sub,/from\("billing_subscriptions"\)/);
  assert.match(sub,/from\("polar_billing_subscriptions"\)/);
  assert.match(sub,/stripeError \|\| polarError/);
  assert.match(sub,/stripeRecords\.length > 100 \|\| polarRecords\.length > 100/);
  assert.match(sub,/activeRecords\.length > 1/);
  assert.match(sub,/Multiple active subscriptions require reconciliation/);
  assert.match(sub,/subscription_provider: current\.subscription_provider/);
  assert.doesNotMatch(sub,/import Stripe|import Polar|fetch\(/);
});
test("frontend chooses exactly one sandbox checkout provider",()=>{
  for (const page of [manager,hub]) {
    assert.match(page,/VITE_ENABLE_POLAR_SANDBOX_CHECKOUT/);
    assert.match(page,/VITE_ENABLE_STRIPE_TEST_CHECKOUT/);
    assert.match(page,/selectSandboxBillingProvider\(testCheckoutEnabled, polarSandboxEnabled\)/);
    assert.match(page,/sandboxCheckoutEndpoint\(sandboxProvider\)/);
    assert.match(page,/if \(!sandboxProvider\)/);
  }
  assert.match(hub,/testCheckoutEnabled=\{sandboxProvider !== null\}/);
  assert.match(manager,/sandboxPortalEndpoint\(sandboxProvider\)/);
  assert.match(manager,/verifiedProvider !== sandboxProvider/);
});
test("all new TS and TSX files parse without errors",()=>{
  const files=[
    ["provider",selector,ts.ScriptKind.TS],
    ["checkout",checkout,ts.ScriptKind.TS],
    ["portal",portal,ts.ScriptKind.TS],
    ["webhook",webhook,ts.ScriptKind.TS],
    ["status",sub,ts.ScriptKind.TS],
    ["manager",manager,ts.ScriptKind.TSX],
    ["hub",hub,ts.ScriptKind.TSX],
  ];
  for (const [name,source,kind] of files) {
    const parsed=ts.createSourceFile(name,source,ts.ScriptTarget.ES2022,true,kind);
    assert.deepEqual(parsed.parseDiagnostics.map(x=>x.messageText),[],name+" should parse");
  }
});
test("merchant comparison and setup documents remain truthful",async()=>{
  const doc=await read("PAYMENT_ALTERNATIVES_POLAR_2026-11.md");
  assert.match(doc,/Polar/);
  assert.match(doc,/Paddle/);
  assert.match(doc,/Safepay/);
  assert.match(doc,/Lemon Squeezy/);
  assert.match(doc,/merchant approval/i);
  assert.match(doc,/POLAR_SANDBOX_ACCESS_TOKEN/);
  assert.match(doc,/no real-money charges/i);
});
