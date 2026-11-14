import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("AI job credit reservations reuse the central ledger and remain private", async () => {
  const sql = await read("supabase/migrations/20261114050000_ai_generation_job_credit_reservations.sql");
  assert.match(sql, /REFERENCES public\.ai_generation_jobs\(id\)/);
  assert.match(sql, /REFERENCES public\.credit_ledger\(transaction_id\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_generation_job_credit_reservations FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /source_key/);
  assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.ai_job_credit_ledger/);
});

test("reservation is idempotent and requires the current worker lease", async () => {
  const sql = await read("supabase/migrations/20261114050000_ai_generation_job_credit_reservations.sql");
  assert.match(sql, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(sql, /v_job\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(sql, /v_job\.lease_expires_at <= now\(\)/);
  assert.match(sql, /reserve_ai_generation_job_credits/);
  assert.match(sql, /already_processed/);
  assert.match(sql, /Return the original reservation before checking the lease/);
});

test("settlement requires confirmed success and cannot exceed the reserved amount", async () => {
  const sql = await read("supabase/migrations/20261114050000_ai_generation_job_credit_reservations.sql");
  assert.match(sql, /v_job\.status <> 'succeeded'/);
  assert.match(sql, /p_final_credits > v_reservation\.reserved_credits/);
  assert.match(sql, /settlement-release/);
  assert.match(sql, /status = 'settled'/);
});

test("release requires confirmed terminal failure and preserves uncertain holds", async () => {
  const sql = await read("supabase/migrations/20261114050000_ai_generation_job_credit_reservations.sql");
  assert.match(sql, /v_job\.status NOT IN \('failed', 'cancelled'\)/);
  assert.match(sql, /reconciliation_required job intentionally keeps its reservation/);
  assert.match(sql, /status = 'released'/);
  assert.match(sql, /original_transaction_id/);
});

test("all reservation RPCs are service-role only and migration remains review-only", async () => {
  const sql = await read("supabase/migrations/20261114050000_ai_generation_job_credit_reservations.sql");
  assert.match(sql, /Review-only foundation: do not apply/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_ai_generation_job_credits[\s\S]*?TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.settle_ai_generation_job_credits[\s\S]*?TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.release_ai_generation_job_credits[\s\S]*?TO service_role/);
});

test("server helper validates IDs, amounts, and returns typed reservation outcomes", async () => {
  const source = await read("supabase/functions/_shared/ai-job-credits.ts");
  assert.match(source, /export async function reserveAIJobCredits/);
  assert.match(source, /export async function settleAIJobCredits/);
  assert.match(source, /export async function releaseAIJobCredits/);
  assert.match(source, /SETTLEMENT_EXCEEDS_RESERVATION/);
  assert.match(source, /CREDIT_SERVICE_UNAVAILABLE/);
});
