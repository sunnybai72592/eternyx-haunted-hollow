import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/pages/AIImageStudio.tsx", import.meta.url), "utf8");
const builder = await readFile(new URL("../src/lib/ai/image-request-builder.ts", import.meta.url), "utf8");

test("AI Image Studio prepares edit drafts from server-verified uploads", () => {
  assert.match(page, /buildAIImageEditRequest\(uploadedAsset!?, prompt/);
  assert.match(page, /Editing instructions/);
  assert.match(page, /Negative prompt/);
  assert.match(builder, /featureKey: "ai\.image\.edit"/);
});

test("AI Image Studio prepares upscale drafts without requiring an edit prompt", () => {
  assert.match(page, /buildAIImageUpscaleRequest\(uploadedAsset!?, options\)/);
  assert.match(page, /Upscale image/);
  assert.match(builder, /featureKey: "ai\.image\.upscale"/);
});

test("draft controls use only server-contract aspect ratios and output formats", () => {
  for (const ratio of ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"]) {
    assert.ok(page.includes(`"${ratio}"`));
  }
  for (const format of ["png", "jpeg", "webp"]) assert.ok(page.includes(`"${format}"`));
});

test("preparing a draft never submits, enqueues, reserves credits, or calls a provider", () => {
  assert.match(page, /Local only · not submitted/);
  assert.match(page, /No job was created and no credits were reserved/);
  assert.doesNotMatch(page, /ai-generation-job-enqueue|supabase\.functions\.invoke|fetch\(/);
  assert.match(page, /Generation remains unavailable/);
  assert.match(page, /requestDraft\.featureKey !== "ai\.image\.generate".*Verified asset/s);
});
