import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/ai-video-request.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const assetId = "123e4567-e89b-42d3-a456-426614174000";

test("validates and normalizes text-to-video requests", () => {
  assert.deepEqual(contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.text_to_video",
    prompt: "  A cinematic mountain sunrise  ",
    durationSeconds: 12,
    aspectRatio: "16:9",
  }), {
    featureKey: "ai.video.text_to_video",
    prompt: "A cinematic mountain sunrise",
    durationSeconds: 12,
    aspectRatio: "16:9",
  });
});

test("image-to-video requires an opaque uploaded asset UUID", () => {
  const result = contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.image_to_video",
    prompt: "Animate the scene gently",
    durationSeconds: 8,
    imageAssetId: assetId,
  });
  assert.equal(result.imageAssetId, assetId);
  assert.throws(() => contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.image_to_video",
    prompt: "Animate this",
    durationSeconds: 8,
    imageAssetId: "https://example.com/image.png",
  }), { code: "invalid_image_asset" });
});

test("rejects empty or oversized prompts and invalid durations", () => {
  for (const prompt of ["   ", "x".repeat(4001)]) {
    assert.throws(() => contract.validateAIVideoGenerationRequest({
      featureKey: "ai.video.text_to_video", prompt, durationSeconds: 5,
    }), { code: "invalid_prompt" });
  }
  for (const durationSeconds of [0, 61, 1.5, "5"]) {
    assert.throws(() => contract.validateAIVideoGenerationRequest({
      featureKey: "ai.video.text_to_video", prompt: "A scene", durationSeconds,
    }), { code: "invalid_duration" });
  }
});

test("rejects unsupported feature keys, unknown fields and invalid options", () => {
  assert.throws(() => contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.avatar", prompt: "A scene", durationSeconds: 5,
  }), { code: "unsupported_feature" });
  assert.throws(() => contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.text_to_video", prompt: "A scene", durationSeconds: 5, callbackUrl: "https://example.com",
  }), { code: "invalid_request" });
  assert.throws(() => contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.text_to_video", prompt: "A scene", durationSeconds: 5, aspectRatio: "4:3",
  }), { code: "invalid_aspect_ratio" });
  assert.throws(() => contract.validateAIVideoGenerationRequest({
    featureKey: "ai.video.text_to_video", prompt: "A scene", durationSeconds: 5, negativePrompt: "x".repeat(2001),
  }), { code: "invalid_negative_prompt" });
});

test("request validation remains a pure contract with no provider or job side effects", async () => {
  const text = await readFile(new URL("../supabase/functions/_shared/ai-video-request.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /fetch\(|Deno\.env|getAIJobStatus|enqueue|reserveCredit/i);
});
