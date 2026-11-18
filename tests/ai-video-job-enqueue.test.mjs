import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/ai-generation-job-enqueue/index.ts", import.meta.url), "utf8");
const enqueueMigration = await readFile(new URL("../supabase/migrations/20261115060000_bind_ai_job_idempotency_to_request.sql", import.meta.url), "utf8");

test("enqueue authenticates the caller and validates a strict request envelope", () => {
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /\["request", "idempotencyKey"\]/);
  assert.match(source, /validateAIVideoGenerationRequest\(body\.request\)/);
  assert.doesNotMatch(source, /body\.(userId|user_id|providerId|provider_id)/);
});

test("image-to-video requires a ready asset owned by the authenticated user", () => {
  assert.match(source, /from\("ai_generation_input_assets"\)/);
  assert.match(source, /\.eq\("id", generationRequest\.imageAssetId\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /validateVerifiedAIImageAsset\(asset, user\.id, generationRequest\.imageAssetId\)/);
  assert.match(source, /\.eq\("bucket_id", "ai-generation-inputs"\)/);
});

test("enqueue uses the central atomic job and credit reservation RPC", () => {
  assert.match(source, /enqueue_ai_generation_job_with_credits/);
  assert.match(source, /p_user_id: user\.id/);
  assert.match(source, /p_feature_key: generationRequest\.featureKey/);
  assert.match(source, /p_idempotency_key: body\.idempotencyKey/);
  assert.match(source, /p_input_payload: inputPayload/);
});

test("the endpoint never calls a provider or exposes storage paths and credentials", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEYS|service_role|secretKey/);
  assert.doesNotMatch(source, /object_path|createSignedUrl|createSignedUploadUrl/);
  assert.doesNotMatch(source, /providerTaskId|provider_task_id/);
});

test("idempotency replays must match the original payload and attempt policy", () => {
  assert.match(enqueueMigration, /v_job\.input_payload IS DISTINCT FROM p_input_payload/);
  assert.match(enqueueMigration, /v_job\.max_attempts IS DISTINCT FROM p_max_attempts/);
  assert.match(enqueueMigration, /idempotency key was reused with a different request/);
  assert.match(source, /idempotency key was reused with a different request/);
  assert.match(source, /status: 409/);
});

test("enqueue returns only a minimal job receipt and maps entitlement/credit failures", () => {
  assert.match(source, /status: data\.status/);
  assert.match(source, /alreadyExists: data\.already_exists/);
  assert.match(source, /Insufficient credits/);
  assert.match(source, /Feature is not enabled/);
});
