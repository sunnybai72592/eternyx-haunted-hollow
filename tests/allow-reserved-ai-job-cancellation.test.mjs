import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL(
  "../supabase/migrations/20261115040000_allow_reserved_ai_job_cancellation.sql",
  import.meta.url,
), "utf8");

test("reserved AI jobs can acknowledge user cancellation under the existing lease", () => {
  assert.match(migration, /WHEN 'reserved' THEN p_next_status IN \('submitted', 'processing', 'cancel_requested'/);
  assert.match(migration, /WHERE id = p_job_id AND lease_token = p_lease_token/);
  assert.match(migration, /v_job\.lease_expires_at <= now\(\)/);
});

test("cancellation acknowledgement still follows the existing state transition guard", () => {
  assert.match(migration, /IF NOT v_allowed THEN/);
  assert.match(migration, /INSERT INTO public\.ai_generation_job_events/);
  assert.match(migration, /lease_owner = NULL/);
  assert.match(migration, /lease_token = NULL/);
});
