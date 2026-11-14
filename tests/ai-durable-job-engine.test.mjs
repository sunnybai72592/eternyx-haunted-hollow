import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("AI job schema is durable, user-owned, idempotent and private by default", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_generation_jobs/);
  assert.match(sql, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(sql, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_generation_job_events/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_generation_jobs FROM PUBLIC, anon, authenticated, service_role/);
});

test("AI job worker claims use atomic row locking and expiring lease tokens", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/);
  assert.match(sql, /lease_expires_at = now\(\) \+ make_interval/);
  assert.match(sql, /p_lease_seconds NOT BETWEEN 10 AND 900/);
});

test("AI job recovery preserves provider task IDs for reconciliation", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /Expired submitted\/processing jobs retain provider_task_id/);
  assert.match(sql, /provider_task_id = COALESCE\(p_provider_task_id, provider_task_id\)/);
  assert.match(sql, /'reconciliation_required'/);
});

test("AI job transitions require the active lease and enforce lifecycle rules", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /WHERE id = p_job_id AND lease_token = p_lease_token/);
  assert.match(sql, /AI job lease is missing or expired/);
  assert.match(sql, /AI job state transition is not allowed/);
  assert.match(sql, /Successful AI job requires an output object key/);
  assert.match(sql, /AI job retry limit has been reached/);
  assert.match(sql, /VALUES \(v_job\.id, v_previous_status, p_next_status, p_event_code\)/);
});

test("AI job RPCs are service-role only and the migration is explicitly review-only", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /Review-only foundation: do not apply/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.create_ai_generation_job[\s\S]*?TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_ai_generation_jobs[\s\S]*?TO service_role/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.transition_ai_generation_job[\s\S]*?TO service_role/);
});

test("AI job client contracts expose only safe status fields", async () => {
  const types = await read("src/lib/ai/jobs.ts");
  assert.match(types, /export const AI_JOB_STATUSES/);
  assert.match(types, /export function canTransitionAIJob/);
  assert.match(types, /export function isTerminalAIJobStatus/);
  assert.match(types, /export interface AIJobStatusSnapshot/);
  assert.doesNotMatch(types, /inputPayload|providerTaskId|leaseToken|outputObjectKey/);
});

test("AI jobs with an unknown provider submission outcome are quarantined, not resubmitted", async () => {
  const sql = await read("supabase/migrations/20261114040000_ai_durable_generation_jobs.sql");
  assert.match(sql, /status = 'reserved'[\\s\\S]*?lease_expires_at < now\\(\\)[\\s\\S]*?provider_task_id IS NULL/);
  assert.match(sql, /SUBMISSION_OUTCOME_UNKNOWN/);
  assert.match(sql, /lease_expires_at IS NULL OR lease_expires_at < now\\(\\)/);
  assert.match(sql, /status <> 'reserved' OR provider_task_id IS NOT NULL/);
});
