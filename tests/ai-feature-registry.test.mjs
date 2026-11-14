import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/ai/registry.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const registry = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("AI registry defines all eight planned studios exactly once", () => {
  assert.deepEqual(
    registry.AI_STUDIOS.map((studio) => studio.id),
    ["video", "image", "writing", "audio", "coding", "documents", "research", "agents"],
  );
  assert.equal(new Set(registry.AI_STUDIOS.map((studio) => studio.id)).size, 8);
});

test("video is the single flagship studio and its core features are asynchronous", () => {
  const flagships = registry.AI_STUDIOS.filter((studio) => studio.flagship);
  assert.equal(flagships.length, 1);
  assert.equal(flagships[0].id, "video");

  const videoFeatures = registry.AI_FEATURES.filter((feature) => feature.studioId === "video");
  assert.ok(videoFeatures.some((feature) => feature.id === "ai.video.text_to_video"));
  assert.ok(videoFeatures.some((feature) => feature.id === "ai.video.image_to_video"));
  assert.ok(videoFeatures.every((feature) => feature.execution === "asynchronous_job"));
});

test("feature IDs and central entitlement keys are stable and unique", () => {
  const ids = registry.AI_FEATURES.map((feature) => feature.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const feature of registry.AI_FEATURES) {
    assert.equal(feature.entitlementKey, feature.id);
    assert.match(feature.id, /^ai\.[a-z0-9._-]+$/);
  }
});

test("every feature belongs to a known studio and declares input/output modalities", () => {
  const studios = new Set(registry.AI_STUDIOS.map((studio) => studio.id));
  for (const feature of registry.AI_FEATURES) {
    assert.ok(studios.has(feature.studioId), `Unknown studio for ${feature.id}`);
    assert.ok(feature.inputModalities.length > 0);
    assert.ok(feature.outputModalities.length > 0);
  }
});

test("no provider, model, paid capability or feature is accidentally activated", () => {
  assert.deepEqual(registry.AI_PROVIDERS, []);
  assert.deepEqual(registry.AI_MODELS, []);
  assert.deepEqual(registry.getAvailableAIModels(), []);
  assert.ok(registry.AI_FEATURES.every((feature) =>
    feature.status === "planned" || feature.status === "backend_pending" || feature.status === "disabled"
  ));
});

test("studio and feature lookup helpers return only matching entries", () => {
  assert.equal(registry.getAIStudio("video").title, "AI Video Studio");
  assert.equal(registry.getAIFeature("ai.video.text_to_video").studioId, "video");
  assert.equal(registry.getFeaturesForStudio("audio").every((feature) => feature.studioId === "audio"), true);
  assert.equal(registry.getAIFeature("ai.not_real"), undefined);
});

test("registry structural validation reports no catalogue inconsistencies", () => {
  assert.deepEqual(registry.validateAIRegistry(), []);
});
