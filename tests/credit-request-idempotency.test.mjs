import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("zero-cost tool requests receive durable server-only idempotency claims", async () => {
  const sql = await read("supabase/migrations/20261114030000_idempotent_zero_cost_tool_requests.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tool_request_claims/);
  assert.match(sql, /PRIMARY KEY \(user_id, idempotency_key\)/);
  assert.match(sql, /credits_charged INTEGER NOT NULL DEFAULT 0 CHECK \(credits_charged >= 0\)/);
  assert.match(sql, /ALTER TABLE public\.tool_request_claims ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.tool_request_claims FROM PUBLIC, anon, authenticated, service_role/);
});

test("credit consumption checks durable claims before executing a duplicate request", async () => {
  const sql = await read("supabase/migrations/20261114030000_idempotent_zero_cost_tool_requests.sql");
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /FROM public\.tool_request_claims[\s\S]*?WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key/);
  assert.match(sql, /IF FOUND THEN[\s\S]*?v_claim\.feature_key IS DISTINCT FROM p_feature_key[\s\S]*?already_processed', true/);
});

test("zero-credit and paid requests both persist their idempotency claim atomically", async () => {
  const sql = await read("supabase/migrations/20261114030000_idempotent_zero_cost_tool_requests.sql");
  assert.match(sql, /IF v_cost = 0 THEN[\s\S]*?INSERT INTO public\.tool_request_claims[\s\S]*?credits_charged[\s\S]*?0/);
  assert.match(sql, /INSERT INTO public\.credit_ledger[\s\S]*?INSERT INTO public\.tool_request_claims/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
});

test("migration preserves historical paid-spend idempotency and does not enable plan policies", async () => {
  const sql = await read("supabase/migrations/20261114030000_idempotent_zero_cost_tool_requests.sql");
  assert.match(sql, /Preserve idempotency for paid spends created before this migration/);
  assert.match(sql, /FROM public\.credit_ledger/);
  assert.doesNotMatch(sql, /INSERT INTO public\.plan_entitlements/i);
  assert.doesNotMatch(sql, /UPDATE public\.plan_entitlements/i);
});
