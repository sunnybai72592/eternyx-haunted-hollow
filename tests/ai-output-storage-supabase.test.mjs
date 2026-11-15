import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/_shared/ai-output-storage-supabase.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('"./ai-output-materialization.ts"', '"data:text/javascript,export const AI_GENERATION_OUTPUT_BUCKET = "ai-generation-outputs"; export class AIOutputMaterializationError extends Error {}"');
const adapter = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const key = "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/output.mp4";
const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256 = async (value) => {
  const hash = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const hash = await sha256(bytes);

function clientWith(upload, download = async () => ({ data: null, error: null })) {
  const calls = [];
  return {
    calls,
    client: {
      storage: {
        from(bucket) {
          calls.push(["bucket", bucket]);
          return {
            upload: async (path, body, options) => {
              calls.push(["upload", path, options, body.type]);
              return upload(path, body, options);
            },
            download: async (path) => {
              calls.push(["download", path]);
              return download(path);
            },
          };
        },
      },
    },
  };
}

test("creates a private output with upsert disabled", async () => {
  const ctx = clientWith(async (path) => ({ data: { path }, error: null }));
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  const receipt = await storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: hash,
  });
  assert.equal(receipt.outcome, "created");
  assert.deepEqual(ctx.calls[1][2], { contentType: "video/mp4", upsert: false });
});

test("accepts a duplicate only after exact existing object verification", async () => {
  const ctx = clientWith(
    async () => ({ data: null, error: { statusCode: "409", message: "duplicate" } }),
    async () => ({ data: new Blob([bytes], { type: "video/mp4" }), error: null }),
  );
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  const receipt = await storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: hash,
  });
  assert.equal(receipt.outcome, "already_exists");
  assert.equal(ctx.calls.some((call) => call[0] === "download"), true);
});

test("rejects an existing object whose bytes differ", async () => {
  const ctx = clientWith(
    async () => ({ data: null, error: { status: 409 } }),
    async () => ({ data: new Blob([new Uint8Array([9, 9, 9])], { type: "video/mp4" }), error: null }),
  );
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  await assert.rejects(storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: hash,
  }));
});

test("rejects a duplicate whose stored MIME type differs", async () => {
  const ctx = clientWith(
    async () => ({ data: null, error: { status: 409 } }),
    async () => ({ data: new Blob([bytes], { type: "application/octet-stream" }), error: null }),
  );
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  await assert.rejects(storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: hash,
  }));
});

test("does not download after non-conflict upload failures", async () => {
  const ctx = clientWith(async () => ({ data: null, error: { status: 500 } }));
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  await assert.rejects(storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: hash,
  }));
  assert.equal(ctx.calls.some((call) => call[0] === "download"), false);
});

test("rejects unsafe object paths and mismatched digests before storage access", async () => {
  const ctx = clientWith(async () => ({ data: { path: key }, error: null }));
  const storage = new adapter.SupabaseAIOutputStorage(ctx.client);
  await assert.rejects(storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: "../output.mp4", bytes, contentType: "video/mp4", sha256: hash,
  }));
  await assert.rejects(storage.putIfAbsent({
    bucket: "ai-generation-outputs", objectKey: key, bytes, contentType: "video/mp4", sha256: "wrong",
  }));
  assert.equal(ctx.calls.length, 0);
});
