import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/ai-image-request.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const contract = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const assetId = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");

test("validates and normalizes text-to-image requests", () => {
  assert.deepEqual(contract.validateAIImageRequest({
    featureKey: "ai.image.generate",
    prompt: "  A detailed mountain landscape  ",
    aspectRatio: "3:2",
    outputFormat: "webp",
  }), {
    featureKey: "ai.image.generate",
    prompt: "A detailed mountain landscape",
    aspectRatio: "3:2",
    outputFormat: "webp",
  });
});

test("image editing requires an opaque uploaded asset UUID", () => {
  const result = contract.validateAIImageRequest({
    featureKey: "ai.image.edit",
    prompt: "  Remove the background  ",
    imageAssetId: assetId,
  });
  assert.equal(result.prompt, "Remove the background");
  assert.equal(result.imageAssetId, assetId);

  for (const imageAssetId of ["https://example.com/image.png", "/private/user/image.png", "not-an-id"]) {
    assert.throws(() => contract.validateAIImageRequest({
      featureKey: "ai.image.edit",
      prompt: "Edit this image",
      imageAssetId,
    }), { code: "invalid_image_asset" });
  }
});

test("upscaling requires an uploaded asset and does not accept a prompt", () => {
  assert.deepEqual(contract.validateAIImageRequest({
    featureKey: "ai.image.upscale",
    imageAssetId: assetId,
    outputFormat: "png",
  }), {
    featureKey: "ai.image.upscale",
    imageAssetId: assetId,
    outputFormat: "png",
  });
  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.upscale",
    imageAssetId: assetId,
    prompt: "Upscale this",
  }), { code: "invalid_request" });
});

test("rejects empty or oversized prompts and invalid negative prompts", () => {
  for (const prompt of ["   ", "x".repeat(4001)]) {
    assert.throws(() => contract.validateAIImageRequest({
      featureKey: "ai.image.generate",
      prompt,
    }), { code: "invalid_prompt" });
  }
  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.generate",
    prompt: "A landscape",
    negativePrompt: "x".repeat(2001),
  }), { code: "invalid_negative_prompt" });
});

test("rejects unsupported features, unknown fields and invalid output options", () => {
  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.variation",
    prompt: "A landscape",
  }), { code: "unsupported_feature" });

  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.generate",
    prompt: "A landscape",
    callbackUrl: "https://example.com/callback",
  }), { code: "invalid_request" });

  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.generate",
    prompt: "A landscape",
    aspectRatio: "5:4",
  }), { code: "invalid_aspect_ratio" });

  assert.throws(() => contract.validateAIImageRequest({
    featureKey: "ai.image.generate",
    prompt: "A landscape",
    outputFormat: "svg",
  }), { code: "invalid_output_format" });
});

test("request validation remains pure and performs no provider, storage or billing work", async () => {
  const text = await readFile(new URL("../supabase/functions/_shared/ai-image-request.ts", import.meta.url), "utf8");
  assert.doesNotMatch(text, /fetch\(|Deno\.env|createClient|storage\.from|enqueue|reserveCredit|submit\\(/i);
});
