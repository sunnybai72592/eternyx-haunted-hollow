import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const endpoint = await readFile(new URL(
  "../supabase/functions/ai-generation-job-cancel/index.ts",
  import.meta.url,
), "utf8");
const migration = await readFile(new URL(
  "../supabase/migrations/20261115030000_secure_ai_job_cancellation.sql",
  import.meta.url,
), "utf8");

test("cancellation endpoint authenticates and derives ownership from verified user", () => {
  assert.match(endpoint, /authenticateUser\(req\)/);
  assert.match(endpoint, /p_user_id: user\.id/);
  assert.doesNotMatch(endpoint, /p_user_id:\s*body\./);
});

test("cancellation RPC locks and scopes the job to its owner", () => {
  assert.match(migration, /WHERE id = p_job_id AND user_id = p_user_id\s+FOR UPDATE/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.request_ai_generation_job_cancellation[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.request_ai_generation_job_cancellation[\s\S]*?TO service_role/);
});

test("queued jobs are cancelled and credits released in the same transaction", () => {
  assert.match(migration, /IF v_job\.status = 'queued' THEN/);
  assert.match(migration, /SET status = 'cancelled',[\s\S]*?completed_at = now\(\)/);
  assert.match(migration, /public\.release_ai_generation_job_credits\(p_job_id, p_user_id\)/);
  assert.match(migration, /job\.cancelled_by_user/);
});

test("active jobs receive a cancellation request instead of a false terminal result", () => {
  assert.match(migration, /'reserved', 'submitted', 'processing', 'cancel_requested'/);
  assert.match(migration, /SET status = v_next_status/);
  assert.match(migration, /job\.cancellation_requested/);
  assert.match(migration, /provider_reconciliation_required/);
});

test("terminal jobs are idempotent and malformed requests are rejected", () => {
  assert.match(migration, /'succeeded', 'failed', 'cancelled', 'reconciliation_required'/);
  assert.match(endpoint, /isUuid\(body\.jobId\)/);
  assert.match(endpoint, /req\.method !== "POST"/);
});
