import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("checkout authenticates the caller before parsing request data", async () => {
  const source = await read("supabase/functions/create-checkout/index.ts");
  assert.ok(source.indexOf('req.headers.get("Authorization")') < source.indexOf("readLimitedRequestText(req"));
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
