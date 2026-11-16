import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-reconciliation-composition.ts", import.meta.url),
  "utf8",
);
const reconciliationStub = Buffer.from(`
export async function reconcileClaimedAIJob(job, dependencies) {
  globalThis.__aiCompositionCalls.push(["reconcile", job, dependencies]);
  return dependencies.materializeSuccess(
    job,
    { state: "succeeded", providerTaskId: job.providerTaskId, outputReference: "opaque-ref" },
    async () => { globalThis.__aiCompositionCalls.push(["lease"]); },
  ).then((output) => ({ outcome: "materialized", output }));
}
`).toString("base64");
const materializerStub = Buffer.from(`
export function createAIWorkerOutputMaterializer(dependencies) {
  globalThis.__aiCompositionCalls.push(["create-materializer", dependencies]);
  return async (job, snapshot, confirmLease) => {
    globalThis.__aiCompositionCalls.push(["materialize", job, snapshot, confirmLease]);
    await confirmLease();
    return { outputObjectKey: job.userId + "/" + job.id + "/output.mp4", finalCredits: 7 };
  };
}
`).toString("base64");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('"./ai-worker-reconciliation.ts"', `"data:text/javascript;base64,${reconciliationStub}"`)
  .replace('"./ai-worker-output-materializer.ts"', `"data:text/javascript;base64,${materializerStub}"`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
const composition = await import(moduleUrl);

function setup() {
  globalThis.__aiCompositionCalls = [];
  const provider = { providerId: "mock" };
  const outputMaterializer = {
    storageClient: { storage: {} },
    downloadProviderOutput: async () => ({}),
    calculateFinalCredits: async () => 7,
    maxBytes: 2048,
  };
  const dependencies = {
    provider,
    renewLease: async () => ({}),
    transition: async () => ({}),
    finalize: async () => ({}),
    outputMaterializer,
  };
  const job = { id: "job-1", userId: "user-1", providerTaskId: "task-1" };
  return { dependencies, job, outputMaterializer, provider };
}

test("binds private output materialization into the reconciliation callback", async () => {
  const ctx = setup();
  const reconcile = composition.createAIWorkerReconciliation(ctx.dependencies);
  assert.equal(typeof reconcile, "function");
  assert.equal(globalThis.__aiCompositionCalls[0][0], "create-materializer");
  assert.equal(globalThis.__aiCompositionCalls[0][1], ctx.outputMaterializer);

  const result = await reconcile(ctx.job);
  assert.equal(result.outcome, "materialized");
  assert.deepEqual(result.output, {
    outputObjectKey: "user-1/job-1/output.mp4",
    finalCredits: 7,
  });

  const reconcileCall = globalThis.__aiCompositionCalls.find((call) => call[0] === "reconcile");
  assert.equal(reconcileCall[1], ctx.job);
  assert.equal(reconcileCall[2].provider, ctx.provider);
  assert.equal(typeof reconcileCall[2].renewLease, "function");
  assert.equal(typeof reconcileCall[2].transition, "function");
  assert.equal(typeof reconcileCall[2].finalize, "function");
  assert.equal(typeof reconcileCall[2].materializeSuccess, "function");

  const materializeCall = globalThis.__aiCompositionCalls.find((call) => call[0] === "materialize");
  assert.equal(materializeCall[1], ctx.job);
  assert.equal(materializeCall[2].outputReference, "opaque-ref");
  assert.equal(typeof materializeCall[3], "function");
  assert.deepEqual(globalThis.__aiCompositionCalls.at(-1), ["lease"]);
});

test("rejects a missing output materializer configuration", () => {
  assert.throws(
    () => composition.createAIWorkerReconciliation({
      provider: { providerId: "mock" },
      renewLease: async () => ({}),
      transition: async () => ({}),
      finalize: async () => ({}),
    }),
    /composition dependencies are incomplete/,
  );
});
