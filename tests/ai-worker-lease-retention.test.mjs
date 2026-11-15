import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("worker transition migration is review-only and keeps terminal accounting separate", async () => {
  const sql = await read("supabase/migrations/20261115080000_preserve_ai_worker_leases_on_transition.sql");
  assert.match(sql, /Review-only: do not apply/);
  assert.match(sql, /Terminal outcomes must use finalize_ai_generation_job/);
  assert.match(sql, /p_next_status NOT IN \([\s\S]*?'reconciliation_required', 'queued'/);
  assert.doesNotMatch(sql, /p_next_status NOT IN \([\s\S]*?'succeeded', 'failed', 'cancelled'/);
});

test("active non-terminal transitions retain the current worker lease", async () => {
  const sql = await read("supabase/migrations/20261115080000_preserve_ai_worker_leases_on_transition.sql");
  assert.match(sql, /WHERE id = p_job_id AND lease_token = p_lease_token/);
  assert.match(sql, /v_job\.lease_expires_at <= now\(\)/);
  assert.match(sql, /lease_owner = CASE WHEN p_next_status IN \('queued', 'reconciliation_required'\) THEN NULL ELSE lease_owner END/);
  assert.match(sql, /lease_token = CASE WHEN p_next_status IN \('queued', 'reconciliation_required'\) THEN NULL ELSE lease_token END/);
  assert.match(sql, /lease_expires_at = CASE WHEN p_next_status IN \('queued', 'reconciliation_required'\) THEN NULL ELSE lease_expires_at END/);
});

test("only requeue and reconciliation quarantine release a non-terminal lease", async () => {
  const sql = await read("supabase/migrations/20261115080000_preserve_ai_worker_leases_on_transition.sql");
  assert.match(sql, /WHEN 'reserved' THEN p_next_status IN \('submitted', 'processing', 'cancel_requested', 'reconciliation_required', 'queued'\)/);
  assert.match(sql, /WHEN 'submitted' THEN p_next_status IN \('processing', 'cancel_requested', 'reconciliation_required'\)/);
  assert.match(sql, /WHEN 'processing' THEN p_next_status IN \('cancel_requested', 'reconciliation_required'\)/);
  assert.match(sql, /WHEN 'cancel_requested' THEN p_next_status IN \('reconciliation_required'\)/);
  assert.match(sql, /p_next_status = 'reconciliation_required' AND p_failure_code IS NULL/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.transition_ai_generation_job[\s\S]*?TO service_role/);
});
