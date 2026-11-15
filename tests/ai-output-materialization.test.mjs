import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/ai-output-materialization.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const rewritten = js
  .replace('"./ai-job-claim.ts"', '"data:text/javascript,export {}"')
  .replace('"./ai-generation-provider.ts"', '"data:text/javascript,export {}"');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`;
const materializer = await import(moduleUrl);

const userId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000002";
const job = {
  id: jobId, userId, providerId: "mock", providerTaskId: "task_123",
  status: "processing", leaseToken: "00000000-0000-4000-8000-000000000003",
};
const snapshot = {
  providerTaskId: "task_123", state: "succeeded", outputReference: "opaque-output-reference",
};
const bytes = new TextEncoder().encode("sample-video-output");

function setup(overrides = {}) {
  const calls = [];
  const dependencies = {
    maxBytes: 1024,
    downloadProviderOutput: async (input) => {
      calls.push(["download", input]);
      return { bytes, contentType: "video/mp4" };
    },
    storage: {
      putIfAbsent: async (input) => {
        calls.push(["store", input]);
        return {
          outcome: "created", bucket: input.bucket, objectKey: input.objectKey,
          contentType: input.contentType, size: input.bytes.byteLength, sha256: input.sha256,
        };
      },
    },
    calculateFinalCredits: async () => 7,
    ...overrides,
  };
  return { calls, dependencies };
}

test("stores successful output under deterministic user and job namespace", async () => {
  const ctx = setup();
  const result = await materializer.materializeAIProviderOutput(job, snapshot, ctx.dependencies);
  assert.equal(result.outputObjectKey, `${userId}/${jobId}/output.mp4`);
  assert.equal(result.finalCredits, 7);
  assert.equal(result.alreadyExisted, false);
  assert.equal(ctx.calls[1][1].bucket, "ai-generation-outputs");
});

test("retry accepts an existing object only when its digest and metadata match", async () => {
  const ctx = setup({
    storage: {
      putIfAbsent: async (input) => ({
        outcome: "already_exists", bucket: input.bucket, objectKey: input.objectKey,
        contentType: input.contentType, size: input.bytes.byteLength, sha256: input.sha256,
      }),
    },
  });
  const result = await materializer.materializeAIProviderOutput(job, snapshot, ctx.dependencies);
  assert.equal(result.alreadyExisted, true);
});

test("rejects a pre-existing object with a different digest", async () => {
  const ctx = setup({
    storage: {
      putIfAbsent: async (input) => ({
        outcome: "already_exists", bucket: input.bucket, objectKey: input.objectKey,
        contentType: input.contentType, size: input.bytes.byteLength, sha256: "different-digest",
      }),
    },
  });
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, snapshot, ctx.dependencies),
    (error) => error.code === "OUTPUT_OBJECT_CONFLICT",
  );
});

test("rejects task mismatch and non-success snapshots before downloading", async () => {
  const ctx = setup();
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, { ...snapshot, providerTaskId: "another_task" }, ctx.dependencies),
    (error) => error.code === "INVALID_JOB",
  );
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, { ...snapshot, state: "processing" }, ctx.dependencies),
    (error) => error.code === "INVALID_JOB",
  );
  assert.equal(ctx.calls.length, 0);
});

test("rejects unsupported MIME types and oversized output before storage", async () => {
  const unsupported = setup({
    downloadProviderOutput: async () => ({ bytes, contentType: "text/html" }),
  });
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, snapshot, unsupported.dependencies),
    (error) => error.code === "INVALID_PROVIDER_OUTPUT",
  );

  const oversized = setup({ maxBytes: 2 });
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, snapshot, oversized.dependencies),
    (error) => error.code === "OUTPUT_TOO_LARGE",
  );
  assert.equal(oversized.calls.some((call) => call[0] === "store"), false);
});

test("pricing failure after idempotent storage remains retryable and does not invent credits", async () => {
  const ctx = setup({ calculateFinalCredits: async () => { throw new Error("pricing unavailable"); } });
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, snapshot, ctx.dependencies),
    (error) => error.code === "OUTPUT_PRICING_UNAVAILABLE",
  );
  assert.equal(ctx.calls.some((call) => call[0] === "store"), true);
});

test("validates returned storage receipt against exact key, type, size and digest", async () => {
  const ctx = setup({
    storage: { putIfAbsent: async (input) => ({
      outcome: "created", bucket: input.bucket, objectKey: "another-user/output.mp4",
      contentType: input.contentType, size: input.bytes.byteLength, sha256: input.sha256,
    }) },
  });
  await assert.rejects(
    materializer.materializeAIProviderOutput(job, snapshot, ctx.dependencies),
    (error) => error.code === "OUTPUT_OBJECT_CONFLICT",
  );
});
