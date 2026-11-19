import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/ai-verified-image-asset.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const boundary = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const userId = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
const assetId = ["223e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
const validAsset = () => ({
  id: assetId,
  user_id: userId,
  bucket_id: boundary.AI_IMAGE_INPUT_BUCKET,
  status: "ready",
  verified_content_type: "image/png",
  verified_size: 1024,
});

test("accepts a ready image asset owned by the authenticated user", () => {
  assert.deepEqual(boundary.validateVerifiedAIImageAsset(validAsset(), userId, assetId), {
    id: assetId,
    contentType: "image/png",
    size: 1024,
  });
});

test("rejects missing, mismatched, or foreign-owned asset records", () => {
  assert.throws(() => boundary.validateVerifiedAIImageAsset(null, userId, assetId), {
    code: "asset_not_owned",
  });
  assert.throws(() => boundary.validateVerifiedAIImageAsset(
    { ...validAsset(), id: userId }, userId, assetId,
  ), { code: "asset_not_owned" });
  assert.throws(() => boundary.validateVerifiedAIImageAsset(
    { ...validAsset(), user_id: assetId }, userId, assetId,
  ), { code: "asset_not_owned" });
});

test("rejects pending and rejected assets", () => {
  for (const status of ["pending", "rejected"]) {
    assert.throws(() => boundary.validateVerifiedAIImageAsset(
      { ...validAsset(), status }, userId, assetId,
    ), { code: "asset_not_ready" });
  }
});

test("rejects wrong bucket, unverified types, and unsafe sizes", () => {
  for (const patch of [
    { bucket_id: "public-assets" },
    { verified_content_type: "image/svg+xml" },
    { verified_size: 0 },
    { verified_size: -1 },
    { verified_size: 10 * 1024 * 1024 + 1 },
    { verified_size: 1.5 },
    { verified_size: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(() => boundary.validateVerifiedAIImageAsset(
      { ...validAsset(), ...patch }, userId, assetId,
    ), { code: "asset_metadata_invalid" });
  }
});

test("rejects malformed requested user and asset references", () => {
  assert.throws(() => boundary.validateVerifiedAIImageAsset(validAsset(), "not-a-user-id", assetId), {
    code: "invalid_asset_reference",
  });
  assert.throws(() => boundary.validateVerifiedAIImageAsset(validAsset(), userId, "not-an-asset-id"), {
    code: "invalid_asset_reference",
  });
});

test("AI generation enqueue scopes image lookup to owner and private bucket before job creation", async () => {
  const endpoint = await readFile(new URL("../supabase/functions/ai-generation-job-enqueue/index.ts", import.meta.url), "utf8");
  assert.match(endpoint, /validateVerifiedAIImageAsset\(asset, user\.id, inputAssetId\)/);
  assert.match(endpoint, /\.eq\("user_id", user\.id\)/);
  assert.match(endpoint, /\.eq\("bucket_id", "ai-generation-inputs"\)/);
  assert.ok(endpoint.indexOf("validateVerifiedAIImageAsset(asset") < endpoint.indexOf("enqueue_ai_generation_job_with_credits"));
});
