import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/ai-generation-job-enqueue/index.ts", import.meta.url), "utf8");

test("AI Image generation requests use the shared image contract and central enqueue RPC", () => {
  assert.match(source, /validateAIImageRequest\(body\.request\)/);
  assert.match(source, /featureKey\.startsWith\("ai\.image\."\)/);
  assert.match(source, /enqueue_ai_generation_job_with_credits/);
  assert.match(source, /p_feature_key: generationRequest\.featureKey/);
  assert.match(source, /p_input_payload: inputPayload/);
});

test("AI Image edit and upscale require a verified owner-scoped private input asset", () => {
  assert.match(source, /generationRequest\.featureKey === "ai\.image\.edit"/);
  assert.match(source, /generationRequest\.featureKey === "ai\.image\.upscale"/);
  assert.match(source, /\.eq\("id", inputAssetId\)/);
  assert.match(source, /\.eq\("user_id", user\.id\)/);
  assert.match(source, /\.eq\("bucket_id", "ai-generation-inputs"\)/);
  assert.match(source, /validateVerifiedAIImageAsset\(asset, user\.id, inputAssetId\)/);
});

test("AI Image validation and safety approval happen before central job or credit reservation", () => {
  const assetValidation = source.indexOf("validateVerifiedAIImageAsset(asset");
  const safetyApproval = source.indexOf("requireAIGenerationSafetyApproval(null,");
  const enqueue = source.indexOf("enqueue_ai_generation_job_with_credits");
  assert.ok(assetValidation >= 0);
  assert.ok(safetyApproval > assetValidation);
  assert.ok(enqueue > safetyApproval);
});

test("AI Image enqueue remains provider-neutral and does not expose storage internals", () => {
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEYS|service_role|secretKey/);
  assert.doesNotMatch(source, /object_path|createSignedUrl|createSignedUploadUrl/);
  assert.doesNotMatch(source, /providerTaskId|provider_task_id/);
});
