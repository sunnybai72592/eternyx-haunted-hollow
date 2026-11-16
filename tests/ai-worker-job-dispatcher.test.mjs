import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-job-dispatcher.ts", import.meta.url),
  "utf8",
);
const submissionStub = Buffer.from(`
export async function submitReservedAIJob(job, dependencies) {
  globalThis.__aiDispatcherCalls.push(["submit", job, dependencies]);
  return { outcome: "submitted", jobId: job.id, providerTaskId: "provider-task" };
}
`).toString("base64");
const reconciliationStub = Buffer.from(`
export function createAIWorkerReconciliation(dependencies) {
  globalThis.__aiDispatcherCalls.push(["create-reconciler", dependencies]);
  return async (job) => {
    globalThis.__aiDispatcherCalls.push(["reconcile", job]);
    return { outcome: "pending", jobId: job.id, status: job.status };
  };
}
`).toString("base64");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replace('"./ai-worker-orchestrator.ts"', `"data:text/javascript;base64,${submissionStub}"`)
  .replace('"./ai-worker-reconciliation-composition.ts"', `"data:text/javascript;base64,${reconciliationStub}"`);
const dispatcherModule = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

function setup() {
  globalThis.__aiDispatcherCalls = [];
  const provider = { providerId: "mock" };
  const dependencies = {
    submission: { provider, buildSubmission: async () => ({}), transition: async () => ({}),
      renewLease: async () => ({}), finalize: async () => ({}) },
    reconciliation: { renewLease: async () => ({}), transition: async () => ({}),
      finalize: async () => ({}), outputMaterializer: { maxBytes: 1024,
        storageClient: { storage: {} }, downloadProviderOutput: async () => ({}),
        calculateFinalCredits: async () => 0 } },
  };
  return { dependencies, provider };
}

test("dispatches a new reserved job without a provider task to submission", async () => {
  const ctx = setup();
  const dispatch = dispatcherModule.createAIWorkerJobDispatcher(ctx.dependencies);
  const job = { id: "job-new", status: "reserved", providerTaskId: null };
  const result = await dispatch(job);
  assert.equal(result.outcome, "submitted");
  const submit = globalThis.__aiDispatcherCalls.find((call) => call[0] === "submit");
  assert.equal(submit[1], job);
  assert.equal(submit[2], ctx.dependencies.submission);
  assert.equal(globalThis.__aiDispatcherCalls.some((call) => call[0] === "reconcile"), false);
});

test("dispatches an existing provider task to reconciliation without resubmitting", async () => {
  const ctx = setup();
  const dispatch = dispatcherModule.createAIWorkerJobDispatcher(ctx.dependencies);
  const job = { id: "job-existing", status: "reserved", providerTaskId: "task-existing" };
  const result = await dispatch(job);
  assert.equal(result.outcome, "pending");
  assert.equal(globalThis.__aiDispatcherCalls.some((call) => call[0] === "submit"), false);
  const reconcile = globalThis.__aiDispatcherCalls.find((call) => call[0] === "reconcile");
  assert.equal(reconcile[1], job);
  const create = globalThis.__aiDispatcherCalls.find((call) => call[0] === "create-reconciler");
  assert.equal(create[1].provider, ctx.provider);
});

test("dispatches active jobs and cancellation with provider tasks to reconciliation", async () => {
  const ctx = setup();
  const dispatch = dispatcherModule.createAIWorkerJobDispatcher(ctx.dependencies);
  await dispatch({ id: "job-processing", status: "processing", providerTaskId: "task-processing" });
  await dispatch({ id: "job-cancel", status: "cancel_requested", providerTaskId: "task-cancel" });
  assert.equal(globalThis.__aiDispatcherCalls.filter((call) => call[0] === "reconcile").length, 2);
  assert.equal(globalThis.__aiDispatcherCalls.some((call) => call[0] === "submit"), false);
});

test("routes cancellation without a provider task through provider-free submission policy", async () => {
  const ctx = setup();
  const dispatch = dispatcherModule.createAIWorkerJobDispatcher(ctx.dependencies);
  const job = { id: "job-cancel-no-task", status: "cancel_requested", providerTaskId: null };
  await dispatch(job);
  const submit = globalThis.__aiDispatcherCalls.find((call) => call[0] === "submit");
  assert.equal(submit[1], job);
  assert.equal(globalThis.__aiDispatcherCalls.some((call) => call[0] === "reconcile"), false);
});

test("rejects incomplete dispatcher configuration", () => {
  assert.throws(
    () => dispatcherModule.createAIWorkerJobDispatcher({ submission: {}, reconciliation: {} }),
    /dispatcher dependencies are incomplete/,
  );
});
