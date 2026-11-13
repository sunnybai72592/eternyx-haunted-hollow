import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("central entitlement and credit tables are private and empty until configured", async () => {
  const source = await read("supabase/migrations/20261114010000_central_entitlement_credit_ledger_foundation.sql");
  for (const table of ["plan_entitlements", "credit_accounts", "credit_ledger"]) {
    assert.match(source, new RegExp("CREATE TABLE IF NOT EXISTS public\\." + table));
  }
  assert.equal((source.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 3);
  assert.match(source, /REVOKE ALL ON TABLE public\.plan_entitlements FROM PUBLIC, anon, authenticated/);
  assert.match(source, /REVOKE ALL ON TABLE public\.credit_accounts FROM PUBLIC, anon, authenticated/);
  assert.match(source, /REVOKE ALL ON TABLE public\.credit_ledger FROM PUBLIC, anon, authenticated/);
  assert.match(source, /REVOKE ALL ON TABLE public\.credit_accounts FROM service_role/);
  assert.match(source, /REVOKE ALL ON TABLE public\\.credit_ledger FROM service_role/);
  assert.doesNotMatch(source, /INSERT INTO public\.plan_entitlements/i);
});

test("entitlement spending resolves plan from verified subscriptions and fails closed", async () => {
  const source = await read("supabase/migrations/20261114010000_central_entitlement_credit_ledger_foundation.sql");
  assert.match(source, /FROM public\.billing_subscriptions/);
  assert.match(source, /status IN \('active', 'trialing'\)/);
  assert.match(source, /v_active_count > 1/);
  assert.match(source, /v_plan_id := 'free'/);
  assert.match(source, /FROM public\.plan_entitlements/);
  assert.match(source, /v_enabled IS DISTINCT FROM true/);
  assert.match(source, /Insufficient credits/);
  assert.match(source, /FOR UPDATE/);
});

test("credit spends and grants use per-user idempotency and atomic balance updates", async () => {
  const source = await read("supabase/migrations/20261114010000_central_entitlement_credit_ledger_foundation.sql");
  assert.match(source, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.consume_tool_credits/);
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.grant_tool_credits/);
  assert.match(source, /transaction_type, credits/);
  assert.match(source, /balance = balance - v_cost/);
  assert.match(source, /balance = balance \+ p_credits/);
  assert.match(source, /Idempotency key was already used for a different operation/);
});

test("failed tool jobs can receive only one full refund per spend", async () => {
  const source = await read("supabase/migrations/20261114010000_central_entitlement_credit_ledger_foundation.sql");
  assert.match(source, /CREATE OR REPLACE FUNCTION public\.refund_tool_credits/);
  assert.match(source, /UNIQUE \(original_transaction_id\)/);
  assert.match(source, /transaction_type = 'spend'/);
  assert.match(source, /transaction_type, credits/);
  assert.match(source, /'refund', v_spend\.credits/);
  assert.match(source, /'failed_tool_job'/);
  assert.match(source, /already_refunded/);
});

test("credit mutation RPCs are restricted to trusted server execution", async () => {
  const source = await read("supabase/migrations/20261114010000_central_entitlement_credit_ledger_foundation.sql");
  for (const signature of [
    "consume_tool_credits(UUID, TEXT, TEXT)",
    "grant_tool_credits(UUID, INTEGER, TEXT, TEXT)",
    "refund_tool_credits(UUID, UUID)",
  ]) {
    assert.match(source, new RegExp("REVOKE ALL ON FUNCTION public\\." + signature.replace(/[()]/g, "\\$&") + " FROM PUBLIC, anon, authenticated"));
    assert.match(source, new RegExp("GRANT EXECUTE ON FUNCTION public\\." + signature.replace(/[()]/g, "\\$&") + " TO service_role"));
  }
});
