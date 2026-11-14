import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("credit snapshot RPC is read-only and resolves only verified subscription plans", async () => {
  const source = await read("supabase/migrations/20261114020000_secure_credit_snapshot.sql");
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.get_credit_snapshot\(p_user_id UUID\)/);
  assert.match(source, /FROM public\.billing_subscriptions/);
  assert.match(source, /status IN \('active', 'trialing'\)/);
  assert.match(source, /v_active_count > 1/);
  assert.match(source, /v_plan_id := 'free'/);
  assert.match(source, /FROM public\.credit_accounts/);
  assert.match(source, /FROM public\.plan_entitlements/);
  assert.doesNotMatch(source, /INSERT INTO public\.(credit_accounts|credit_ledger)/i);
  assert.doesNotMatch(source, /UPDATE public\.(credit_accounts|credit_ledger)/i);
});

test("credit snapshot RPC is callable only by trusted server functions", async () => {
  const source = await read("supabase/migrations/20261114020000_secure_credit_snapshot.sql");
  assert.match(source, /SECURITY DEFINER/);
  assert.match(source, /SET search_path = ''/);
  assert.match(source, /REVOKE ALL ON FUNCTION public\.get_credit_snapshot\(UUID\) FROM PUBLIC, anon, authenticated/);
  assert.match(source, /GRANT EXECUTE ON FUNCTION public\.get_credit_snapshot\(UUID\) TO service_role/);
});

test("credit snapshot endpoint authenticates and derives identity from the verified user", async () => {
  const source = await read("supabase/functions/credit-snapshot/index.ts");
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /p_user_id: user\.id/);
  assert.doesNotMatch(source, /body\.userId|body\.user_id/);
  assert.match(source, /Number\.isInteger\(data\.balance\)/);
  assert.match(source, /FEATURE_KEY_PATTERN|feature_key/);
});

test("Subscription Hub displays only backend-provided credit and feature data", async () => {
  const source = await read("src/pages/enhanced/SubscriptionHub.tsx");
  assert.match(source, /functions\.invoke\('credit-snapshot'/);
  assert.match(source, /snapshot\.balance/);
  assert.match(source, /snapshot\.features/);
  assert.match(source, /not available for verification/i);
  assert.doesNotMatch(source, /mock|sample credits|1000 credits/i);
});
