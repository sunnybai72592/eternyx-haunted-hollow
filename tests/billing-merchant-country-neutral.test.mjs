import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const [catalog, manager, tiers, hub, setup, checkout] = await Promise.all([
  "src/lib/billing/public-saas-plans.ts",
  "src/components/SubscriptionManager.tsx",
  "src/components/enhanced/SubscriptionTiers.tsx",
  "src/pages/enhanced/SubscriptionHub.tsx",
  "SAAS_STRIPE_SAUDI_BUSINESS_SETUP_2026-11.md",
  "supabase/functions/create-checkout/index.ts",
].map(read));
const output = ts.transpileModule(catalog, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plans = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));

test("catalog exposes exact provider-neutral SaaS tier identifiers", () => {
  assert.deepEqual(Object.keys(plans.PUBLIC_SAAS_PLANS).sort(), ["elite", "free", "premium"]);
  assert.equal(plans.PUBLIC_SAAS_PLANS.free.name, "Ghost Access");
  assert.equal(plans.PUBLIC_SAAS_PLANS.premium.name, "Shadow Operative");
  assert.equal(plans.PUBLIC_SAAS_PLANS.elite.name, "Cyber Overlord");
});

test("paid plans have no speculative public price or activated checkout", () => {
  for (const tier of Object.values(plans.PUBLIC_SAAS_PLANS)) {
    assert.equal(tier.publicPrice, null);
    assert.equal(tier.paidCheckoutGenerallyAvailable, false);
    assert.ok(tier.priceNote.length >= 8);
    assert.doesNotMatch(tier.priceNote, /\$\d+|SAR \d+|PKR \d+/);
  }
});

test("unknown or malformed plan identifiers cannot silently become free", () => {
  assert.equal(plans.knownSaasPlan("unknown"), null);
  assert.equal(plans.knownSaasPlan("Premium"), null);
  assert.equal(plans.knownSaasPlan("__proto__"), null);
  assert.equal(plans.knownSaasPlan(""), null);
  assert.equal(plans.knownSaasPlan(null), null);
  assert.equal(plans.knownSaasPlan({ id: "free" }), null);
  assert.equal(plans.knownSaasPlan("free").id, "free");
  assert.equal(plans.knownSaasPlan("elite").id, "elite");
});

test("the public plan catalog never includes gateway keys, real merchant flags or live URLs", () => {
  assert.doesNotMatch(catalog, /STRIPE_SECRET_KEY|sk_(test|live)_|whsec_|SUPABASE_SERVICE_ROLE_KEY|customer\.subscriptions/);
  assert.doesNotMatch(catalog, /checkout\.stripe\.com|Safepay\.create|Moyasar\.create/);
  assert.match(catalog, /server and the verified payment processor remain authoritative/);
});

test("the current subscription manager uses the shared no-price catalog", () => {
  assert.match(manager, /import \{ MERCHANT_ONBOARDING_NOTE, PUBLIC_SAAS_PLANS \}/);
  assert.match(manager, /PUBLIC_SAAS_PLANS\.premium\.priceNote/);
  assert.match(manager, /PUBLIC_SAAS_PLANS\.elite\.priceNote/);
  assert.doesNotMatch(manager, /\$29\.99|\$99\.99|\{planDetails\.price\}\/month/);
});

test("both current and catalog screens are disabled by default without an approved sandbox flag", () => {
  for (const page of [manager, hub]) {
    assert.match(page, /import\.meta\.env\.VITE_ENABLE_STRIPE_TEST_CHECKOUT === 'true'/);
    assert.match(page, /if \(!testCheckoutEnabled\)/);
  }
  assert.match(manager, /disabled=\{isLoading \|\| !testCheckoutEnabled\}/);
  assert.match(tiers, /testCheckoutEnabled = false/);
  assert.match(tiers, /Checkout unavailable/);
});

test("current-plan purchase handler rejects disabled checkout before user lookup", () => {
  const handler = manager.indexOf("const handleSubscribe = async");
  const gate = manager.indexOf("if (!testCheckoutEnabled)", handler);
  const auth = manager.indexOf("if (!user)", handler);
  const invoke = manager.indexOf("supabase.functions.invoke('create-checkout'", handler);
  assert.ok(handler >= 0 && gate > handler && gate < auth && auth < invoke);
});

test("customer portal management handler also refuses disabled test billing", () => {
  const handler = manager.indexOf("const handleManageSubscription = async");
  const gate = manager.indexOf("if (!testCheckoutEnabled)", handler);
  const invoke = manager.indexOf("supabase.functions.invoke('customer-portal'", handler);
  assert.ok(handler >= 0 && gate > handler && gate < invoke);
  assert.match(manager, /The test billing portal is disabled/);
});

test("manager handles unverified status as error and unknown paid plans as unknown", () => {
  assert.match(manager, /Your subscription status could not be verified/);
  assert.match(manager, /No plan or access level is being assumed/);
  assert.match(manager, /An active subscription was found, but its plan could not be identified/);
  assert.match(manager, /subscriptionData\.subscription_tier === 'premium'/);
});

test("plan preview and manager read the exact same tier names", () => {
  assert.match(tiers, /PUBLIC_SAAS_PLANS\.free\.name/);
  assert.match(tiers, /PUBLIC_SAAS_PLANS\.premium\.name/);
  assert.match(tiers, /PUBLIC_SAAS_PLANS\.elite\.name/);
  assert.match(manager, /PUBLIC_SAAS_PLANS\.free\.name/);
  assert.match(manager, /PUBLIC_SAAS_PLANS\.premium\.name/);
  assert.match(manager, /PUBLIC_SAAS_PLANS\.elite\.name/);
});

test("backend remains guarded, customer-bound, and does not infer prices from client input", () => {
  assert.match(checkout, /Deno\.env\.get\("ETERNYX_STRIPE_CHECKOUT_MODE"\) !== "test"/);
  assert.match(checkout, /stripe\.prices\.retrieve\(configuredPriceId/);
  assert.match(checkout, /hasOwnProperty\.call\(plans, planId\)/);
  assert.doesNotMatch(checkout, /price_data:|body\.amount|body\.priceId/);
});

test("Pakistan citizenship and Saudi residence are not confused with incorporated merchant country", () => {
  assert.match(setup, /Pakistan as their home country/);
  assert.match(setup, /Saudi Arabia/);
  assert.match(setup, /does not yet have a registered merchant entity/);
  assert.match(setup, /merchant jurisdiction|registered business location/i);
  assert.match(setup, /Stripe account country is not founder nationality/);
});

test("real payment alternatives are documented as candidates, never activated without merchant review", () => {
  assert.match(setup, /www\.secp\.gov\.pk\/start-your-company/);
  assert.match(setup, /getsafepay\.pk\/subscriptions/);
  assert.match(setup, /www\.moyasar\.com\/en\/resources\/faqs/);
  assert.match(setup, /Do not add it as a live payment method/);
  assert.match(setup, /legal.*tax jurisdiction/i);
});

test("all modified TypeScript/TSX modules still parse", () => {
  for (const [path, source, kind] of [
    ["catalog",catalog,ts.ScriptKind.TS],
    ["manager",manager,ts.ScriptKind.TSX],
    ["tiers",tiers,ts.ScriptKind.TSX],
    ["hub",hub,ts.ScriptKind.TSX],
  ]) {
    const result = ts.createSourceFile(path,source,ts.ScriptTarget.ES2022,true,kind);
    assert.deepEqual(result.parseDiagnostics.map(x => x.messageText),[],path + " must parse");
  }
});
