import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../supabase/functions/ai-generation-input-upload-url/index.ts", import.meta.url), "utf8");

test("signed upload endpoint authenticates and never accepts a caller-supplied owner or path", () => {
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /Object\.keys\(body\)\.some/);
  assert.match(source, /user\.id.*assetId/s);
  assert.doesNotMatch(source, /body\.(userId|path|bucket|assetId)/);
});

test("upload contract limits images to JPEG, PNG, and WebP and caps size at 10 MiB", () => {
  assert.match(source, /"image\/jpeg"/);
  assert.match(source, /"image\/png"/);
  assert.match(source, /"image\/webp"/);
  assert.match(source, /10 \* 1024 \* 1024/);
  assert.match(source, /Number\.isSafeInteger\(fileSize\)/);
});

test("endpoint creates a non-overwriting signed upload and returns no service credentials", () => {
  assert.match(source, /createSignedUploadUrl\(objectPath, \{ upsert: false \}\)/);
  assert.match(source, /data\.token/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEYS|service_role|secretKey/);
});

test("endpoint does not enqueue jobs or invoke an AI provider", () => {
  assert.doesNotMatch(source, /create_ai_generation_job|ai_generation_jobs|fetch\(/);
});
