import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/lib/ai/image-job-api.ts", import.meta.url), "utf8");
const studio = await readFile(new URL("../src/pages/AIImageStudio.tsx", import.meta.url), "utf8");

test("AI Image enqueue client uses the shared authenticated job endpoint and strict envelope", () => {
  assert.match(client, /supabase\.functions\.invoke\("ai-generation-job-enqueue"/);
  assert.match(client, /body: \{ request, idempotencyKey \}/);
  assert.match(client, /AIImageGenerationRequestDraft/);
  assert.match(client, /AIImageEditRequestDraft/);
  assert.match(client, /AIImageUpscaleRequestDraft/);
});

test("AI Image enqueue requires a reusable bounded idempotency key", () => {
  assert.match(client, /IDEMPOTENCY_KEY_PATTERN/);
  assert.match(client, /\{8,200\}/);
  assert.match(client, /caller must retain and reuse the same idempotency key/i);
  assert.match(client, /invalid_idempotency_key/);
});

test("AI Image enqueue validates the minimal server receipt before returning it", () => {
  assert.match(client, /UUID_PATTERN\.test\(data\.job\.id\)/);
  assert.match(client, /isJobStatus\(data\.job\.status\)/);
  assert.match(client, /typeof data\.job\.alreadyExists !== "boolean"/);
});

test("AI Image enqueue maps authentication, credit, feature, conflict and unavailable errors", () => {
  for (const status of [401, 402, 403, 409]) {
    assert.match(client, new RegExp("case " + status + ":"));
  }
  assert.match(client, /default:[\s\S]*AI image generation is temporarily unavailable/);
  assert.match(client, /AIImageEnqueueError\("unavailable"/);
});

test("AI Image enqueue classifies oversized requests as invalid input", () => {
  assert.match(client, /case 400:[\s\S]*case 413:[\s\S]*case 422:/);
});

test("AI Image enqueue converts thrown transport failures into a safe typed unavailable error", () => {
  assert.match(client, /try \{[\s\S]*supabase\.functions\.invoke/);
  assert.match(client, /catch \{[\s\S]*AIImageEnqueueError\("unavailable"/);
  assert.doesNotMatch(client, /catch \(error\)[\s\S]*throw error/);
});

test("AI Image Studio remains disconnected from enqueue until explicit activation approval", () => {
  assert.doesNotMatch(studio, /enqueueAIImageJob|ai-generation-job-enqueue/);
  assert.match(studio, /Generation remains unavailable/);
});

test("AI Image Studio invalidates stale drafts and validation errors when inputs change", () => {
  assert.ok(studio.includes("const invalidateDraft = () =>"));
  assert.ok(studio.includes("setRequestDraft(null);"));
  assert.ok(studio.includes("setDraftError(null);"));
  for (const fragment of [
    'setOperation("generate"); invalidateDraft();',
    'setOperation("edit"); invalidateDraft();',
    'setOperation("upscale"); invalidateDraft();',
    'setPrompt(e.target.value); invalidateDraft();',
    'setNegativePrompt(e.target.value); invalidateDraft();',
    'setAspectRatio(e.target.value as AIImageRequestAspectRatio); invalidateDraft();',
    'setOutputFormat(e.target.value as AIImageRequestOutputFormat); invalidateDraft();',
  ]) assert.ok(studio.includes(fragment), "Missing draft invalidation for " + fragment);
  assert.match(studio, /setImageFile\(e\.target\.files\?\.\[0\] \?\? null\);\s*setUploadedAsset\(null\);\s*setUploadError\(null\);\s*invalidateDraft\(\);/);
});

test("AI Image Studio clears stale job details when the lookup target changes", () => {
  assert.match(studio, /setJobId\\(e\\.target\\.value\\);[\\s\\S]*setJob\\(null\\);[\\s\\S]*setError\\(null\\);[\\s\\S]*setNotice\\(null\\);/);
  assert.match(studio, /const lookup = async \\(\\) => \\{[\\s\\S]*setLoading\\(true\\);[\\s\\S]*setJob\\(null\\);/);
});

test("AI Image Studio prevents file changes while an upload is in progress", () => {
  assert.match(studio, /type="file"[\\s\\S]*disabled=\\{uploading\\}/);
});

test("AI Image Studio locks job lookup input during lookup and cancellation", () => {
  assert.match(studio, /disabled=\\{loading \\|\\| cancelling\\}/);
  assert.match(studio, /disabled=\\{loading \\|\\| cancelling \\|\\| !jobId\\.trim\\(\\)\\}/);
});

test("AI Image Studio announces status and upload errors accessibly", () => {
  assert.match(studio, /Alert role="status" aria-live="polite"/);
  assert.match(studio, /Alert role="alert" variant="destructive"/);
});

test("AI Image upload start clears the prior asset and stale request draft", () => {
  assert.match(studio, /setUploading\\(true\\);[\\s\\S]*setUploadedAsset\\(null\\);[\\s\\S]*invalidateDraft\\(\\);/);
});
