import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const builder = await readFile(new URL("../src/lib/ai/image-request-builder.ts", import.meta.url), "utf8");
const serverContract = await readFile(new URL("../supabase/functions/_shared/ai-image-request.ts", import.meta.url), "utf8");

test("edit drafts use the server contract's feature key and verified asset identifier", () => {
  assert.match(builder, /featureKey: "ai\.image\.edit"/);
  assert.match(builder, /imageAssetId: asset\.assetId/);
  assert.match(builder, /UUID_PATTERN\.test\(asset\.assetId\)/);
  assert.match(serverContract, /featureKey: "ai\.image\.edit"/);
  assert.match(serverContract, /imageAssetId: validateAssetId\(value\.imageAssetId\)/);
});

test("upscale drafts require a verified asset and do not add a prompt", () => {
  assert.match(builder, /featureKey: "ai\.image\.upscale"/);
  assert.match(builder, /imageAssetId: asset\.assetId/);
  assert.doesNotMatch(builder, /providerUrl|imageUrl|storagePath/);
});

test("edit prompts are trimmed and bounded, including negative prompts", () => {
  assert.match(builder, /prompt\.trim\(\)/);
  assert.match(builder, /prompt\.length > 4000/);
  assert.match(builder, /options\.negativePrompt\.length > 2000/);
});

test("request preparation is local and never enqueues, reserves credits, or contacts providers", () => {
  assert.match(builder, /local request preparation only/);
  assert.doesNotMatch(builder, /ai-generation-job-enqueue|supabase\.functions\.invoke|fetch\(/);
});


test("text-to-image drafts match the server generation contract without an uploaded asset", () => {
  assert.match(builder, /featureKey: "ai\\.image\\.generate"/);
  assert.match(builder, /buildAIImageGenerationRequest/);
  assert.match(serverContract, /featureKey: "ai\\.image\\.generate"/);
  assert.match(builder, /prompt: prompt\.trim\(\)/);
  assert.doesNotMatch(builder, /providerUrl|imageUrl|storagePath/);
});
