import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL(
  "../supabase/migrations/20261115020000_atomic_ai_job_enqueue_reservation.sql",
  import.meta.url,
), "utf8");

test("AI enqueue and credit reservation share one transaction", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enqueue_ai_generation_job_with_credits/);
  assert.match(migration, /INSERT INTO public\.ai_generation_jobs/);
  assert.match(migration, /INSERT INTO public\.ai_generation_job_credit_reservations/);
  assert.match(migration, /INSERT INTO public\.credit_ledger/);
  assert.match(migration, /INSERT INTO public\.ai_generation_job_events/);
  assert.match(migration, /LANGUAGE plpgsql[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
});

test("insufficient credits or missing entitlement abort the entire enqueue", () => {
  assert.match(migration, /IF NOT FOUND OR v_enabled IS DISTINCT FROM true/);
  assert.match(migration, /IF v_balance < v_cost THEN\s+RAISE EXCEPTION 'Insufficient credits'/);
  assert.match(migration, /Existing AI job requires credit reservation reconciliation/);
});

test("retries return the original job and reservation without charging twice", () => {
  assert.match(migration, /ON CONFLICT \(user_id, idempotency_key\) DO NOTHING/);
  assert.match(migration, /WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key/);
  assert.match(migration, /'already_exists', true/);
  assert.match(migration, /'reservation_status', v_reservation\.status/);
});

test("new jobs remain queued with a reserved hold and no provider execution", () => {
  assert.match(migration, /'status', 'queued'/);
  assert.match(migration, /'reservation_status', 'reserved'/);
  assert.doesNotMatch(migration, /https?:\/\/|\bfetch\s*\(|Deno\.env|provider_task_id\s*=/i);
});

test("only the trusted service role may execute the enqueue function", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.enqueue_ai_generation_job_with_credits[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.enqueue_ai_generation_job_with_credits[\s\S]*?TO service_role/);
});
