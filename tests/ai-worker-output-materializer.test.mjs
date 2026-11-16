import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-output-materializer.ts", import.meta.url),
  "utf8",
);
const materializerStub = Buffer.from(`
export async function materializeAIProviderOutput(job, snapshot, dependencies) {
  await dependencies.downloadProviderOutput({
    providerId: job.providerId,
    providerTaskId: job.providerTaskId,
    outputReference: snapshot.outputReference,
  });
  await dependencies.confirmLease();
  const receipt = await dependencies.storage.putIfAbsent({
    bucket: "ai-generation-outputs",
    objectKey: job.userId + "/" + job.id + "/output.mp4",
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "video/mp4",
    sha256: "digest",
  });
  const finalCredits = await dependencies.calculateFinalCredits(job, {
    contentType: "video/mp4", size: 3, sha256: "digest",
  });
  return {
    outputObjectKey: receipt.objectKey,
    finalCredits,
    contentType: "video/mp4",
    size: 3,
    sha256: "digest",
    alreadyExisted: receipt.outcome === "already_exists",
  };
}
`).toString("base64");
const storageStub = Buffer.from(`
export class SupabaseAIOutputStorage {
  constructor(client) { this.client = client; }
  async putIfAbsent(input) {
    this.client.calls.push(["storage", input]);
    return {
      outcome: "created",
      bucket: input.bucket,
      objectKey: input.objectKey,
      contentType: input.contentType,
      size: input.bytes.byteLength,
      sha256: input.sha256,
    };
  }
}
`).toString("base64");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('"./ai-output-materialization.ts"', `"data:text/javascript;base64,${materializerStub}"`)
  .replace('"./ai-output-storage-supabase.ts"', `"data:text/javascript;base64,${storageStub}"`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const composition = await import(moduleUrl);

const job = {
  id: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000001",
  providerId: "mock",
  providerTaskId: "task_123",
};
const snapshot = {
  state: "succeeded",
  providerTaskId: "task_123",
  outputReference: "opaque-provider-reference",
};

function setup(overrides = {}) {
  const calls = [];
  const storageClient = { calls, storage: {} };
  const dependencies = {
    storageClient,
    downloadProviderOutput: async (input) => { calls.push(["download", input]); return {}; },
    calculateFinalCredits: async (_job, output) => { calls.push(["pricing", output]); return 5; },
    maxBytes: 1024,
    ...overrides,
  };
  return { calls, storageClient, dependencies };
}

test("composes trusted private storage and passes the fresh lease guard through", async () => {
  const ctx = setup();
  const materialize = composition.createAIWorkerOutputMaterializer(ctx.dependencies);
  const confirmLease = async () => { ctx.calls.push(["lease"]); };
  const result = await materialize(job, snapshot, confirmLease);

  assert.deepEqual(result, {
    outputObjectKey: job.userId + "/" + job.id + "/output.mp4",
    finalCredits: 5,
  });
  assert.equal(ctx.calls[0][0], "download");
  assert.equal(ctx.calls[0][1].outputReference, snapshot.outputReference);
  assert.equal(ctx.calls[1][0], "lease");
  assert.equal(ctx.calls[2][0], "storage");
  assert.equal(ctx.calls[2][1].bucket, "ai-generation-outputs");
  assert.equal(ctx.calls[3][0], "pricing");
});

test("rejects missing lease guard before materialization", async () => {
  const ctx = setup();
  const materialize = composition.createAIWorkerOutputMaterializer(ctx.dependencies);
  await assert.rejects(materialize(job, snapshot, null), /lease confirmation is required/);
  assert.equal(ctx.calls.length, 0);
});

test("requires an explicit output-size policy and trusted dependencies", () => {
  assert.throws(
    () => composition.createAIWorkerOutputMaterializer({
      ...setup().dependencies,
      maxBytes: 0,
    }),
    /dependencies are incomplete/,
  );
  assert.throws(
    () => composition.createAIWorkerOutputMaterializer({
      ...setup().dependencies,
      calculateFinalCredits: undefined,
    }),
    /dependencies are incomplete/,
  );
});
