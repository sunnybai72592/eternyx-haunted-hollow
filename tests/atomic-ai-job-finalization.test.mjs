import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("AI job finalization is a trusted service-role-only RPC", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.finalize_ai_generation_job/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finalize_ai_generation_job[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.finalize_ai_generation_job[\s\S]*?TO service_role/);
});

test("successful finalization updates the job before settling in the same transaction", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  const updateAt = sql.indexOf("UPDATE public.ai_generation_jobs");
  const settleAt = sql.indexOf("public.settle_ai_generation_job_credits(", updateAt);
  assert.ok(updateAt >= 0 && settleAt > updateAt);
  assert.match(sql, /Successful AI job requires an output object key and final credits/);
  assert.match(sql, /p_final_credits/);
  assert.match(sql, /Finalization[sS]*?same transaction|same transaction[\s\S]*?rolls back/i);
});

test("confirmed failure and cancellation release reservations, while uncertain outcomes retain them", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  assert.match(sql, /p_next_status IN \('failed', 'cancelled'\)[\s\S]*?release_ai_generation_job_credits/);
  assert.match(sql, /reconciliation_required deliberately keeps any reservation on hold/);
  assert.match(sql, /credit_hold_preserved/);
  assert.doesNotMatch(sql, /p_next_status = 'reconciliation_required'[\s\S]{0,300}release_ai_generation_job_credits/);
});

test("finalization requires a live worker lease and validates allowed source states", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  assert.match(sql, /v_job\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(sql, /v_job\.lease_expires_at <= now\(\)/);
  assert.match(sql, /WHEN 'reserved' THEN p_next_status IN \('failed', 'cancelled', 'reconciliation_required'\)/);
  assert.match(sql, /WHEN 'submitted' THEN p_next_status IN \('succeeded', 'failed', 'cancelled', 'reconciliation_required'\)/);
});

test("repeated finalization is idempotent and rejects conflicting outcomes", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  assert.match(sql, /already_processed/);
  assert.match(sql, /already finalized with a different outcome/);
  assert.match(sql, /settle_ai_generation_job_credits\([\s\S]*?p_job_id, v_job\.user_id, p_final_credits/);
  assert.match(sql, /release_ai_generation_job_credits\(p_job_id, v_job\.user_id\)/);
});

test("migration remains review-only and does not activate workers, providers, or billing", async () => {
  const sql = await read("supabase/migrations/20261115010000_atomic_ai_job_finalization.sql");
  assert.match(sql, /Review-only: do not apply/);
  assert.doesNotMatch(sql, /CREATE EXTENSION|CREATE SERVER|http_post|net\.http_post/i);
});
