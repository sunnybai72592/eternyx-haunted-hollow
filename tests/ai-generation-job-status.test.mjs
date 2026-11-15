import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL(
  "../supabase/functions/ai-generation-job-status/index.ts",
  import.meta.url,
), "utf8");

test("job status endpoint authenticates callers and requires a valid job UUID", () => {
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /if \(!user \|\| !supabase\)/);
  assert.match(source, /isUuid\(body\.jobId\)/);
});

test("job lookup is scoped to the authenticated user", () => {
  assert.match(source, /\.eq\("id", body\.jobId\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /maybeSingle\(\)/);
});

test("response selects and returns only safe lifecycle metadata", () => {
  assert.match(source, /select\("id, feature_key, status, attempt_count, max_attempts/);
  assert.doesNotMatch(source, /input_payload|provider_task_id|output_object_key|service_role|Deno\.env/i);
  assert.match(source, /failureCode: data\.failure_code/);
});

test("endpoint handles unsupported methods and malformed JSON safely", () => {
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /Invalid JSON request/);
  assert.match(source, /SAFE_STATUSES/);
});
