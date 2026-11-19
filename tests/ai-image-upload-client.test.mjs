import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/lib/ai/image-upload-api.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/pages/AIImageStudio.tsx", import.meta.url), "utf8");

test("AI Image upload validates supported image types and the 10 MiB boundary", () => {
  assert.match(client, /image\/jpeg/);
  assert.match(client, /image\/png/);
  assert.match(client, /image\/webp/);
  assert.match(client, /10 \* 1024 \* 1024/);
  assert.match(client, /file\.size > MAX_IMAGE_SIZE/);
});

test("upload uses the authenticated signed URL and server verification endpoints", () => {
  assert.match(client, /ai-generation-input-upload-url/);
  assert.match(client, /uploadToSignedUrl/);
  assert.match(client, /ai-generation-input-verify/);
  assert.match(client, /status !== "ready"/);
  assert.match(client, /UUID_PATTERN\.test\(signed\.assetId\)/);
});

test("image upload never enqueues generation or calls a provider", () => {
  assert.doesNotMatch(client, /ai-generation-job-enqueue|fetch\(/);
  assert.match(client, /never enqueues a job, reserves credits, or calls a provider/);
});

test("AI Image Studio exposes upload status without enabling generation", () => {
  assert.match(page, /uploadAIImageAsset/);
  assert.match(page, /Generation remains unavailable/);
  assert.match(page, /does not submit prompts or make paid provider calls/);
});


test("signed upload path is restricted to safe relative storage keys", () => {
  assert.match(client, /function isSafeStoragePath/);
  assert.match(client, /path\.startsWith\("\/"\)/);
  assert.match(client, /path\.includes\("\\\\"\)/);
  assert.match(client, /segment !== "\.\."/);
  assert.match(client, /isSafeStoragePath\(signed\.path\)/);
});

test("signed upload tokens must be nonempty and bounded", () => {
  assert.match(client, /signed\.token\.length < 1/);
  assert.match(client, /signed\.token\.length > 4096/);
});

test("all three network stages normalize thrown failures to typed errors", () => {
  for (const code of ["upload_unavailable", "upload_failed", "verification_failed"]) {
    assert.match(client, new RegExp('catch \\{\\s*throw new AIImageUploadError\\("' + code + '"\\)'));
  }
});

test("signed storage upload is create-only and never exposes its token in the result", () => {
  assert.match(client, /upsert: false/);
  assert.match(client, /return \\{\\s*assetId: signed\.assetId/);
  assert.doesNotMatch(client, /return \\{\\s*token:/);
});
