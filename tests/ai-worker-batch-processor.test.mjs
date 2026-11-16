import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const readSource = async (path) => readFile(
  new URL("../" + path, import.meta.url),
  "utf8",
);
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

const [processorSource, claimSource, runnerSource] = await Promise.all([
  readSource("supabase/functions/_shared/ai-worker-batch-processor.ts"),
  readSource("supabase/functions/_shared/ai-job-claim.ts"),
  readSource("supabase/functions/_shared/ai-worker-batch-runner.ts"),
]);

const claimModule = dataUrl(transpile(claimSource));
const runnerModule = dataUrl(transpile(runnerSource));
const dispatcherModule = dataUrl(`
  export function createAIWorkerJobDispatcher(dependencies) {
    if (!dependencies || typeof dependencies.dispatch !== "function") {
      throw new Error("dispatcher dependencies missing");
    }
    return dependencies.dispatch;
  }
`);
const processorJs = transpile(processorSource)
  .replace('"./ai-job-claim.ts"', `"${claimModule}"`)
  .replace('"./ai-worker-job-dispatcher.ts"', `"${dispatcherModule}"`)
  .replace('"./ai-worker-batch-runner.ts"', `"${runnerModule}"`);
const processor = await import(dataUrl(processorJs));

const workerId = "worker-integration-test";
const uuid = (tail) => `00000000-0000-4000-8000-${tail.padStart(12, "0")}`;
const rows = [
  {
    id: uuid("1"), user_id: uuid("101"), feature_key: "video.generate",
    idempotency_key: "request-one", status: "reserved",
    input_payload: { prompt: "private prompt" },
    provider_id: null, model_id: null, provider_task_id: null,
    attempt_count: 1, max_attempts: 3, lease_owner: workerId,
    lease_token: uuid("201"),
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
  },
  {
    id: uuid("2"), user_id: uuid("102"), feature_key: "video.generate",
    idempotency_key: "request-two", status: "reserved",
    input_payload: { prompt: "another private prompt" },
    provider_id: null, model_id: null, provider_task_id: null,
    attempt_count: 1, max_attempts: 3, lease_owner: workerId,
    lease_token: uuid("202"),
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
  },
];

test("composes the real atomic claim helper and bounded sequential runner", async () => {
  const calls = [];
  const processBatch = processor.createAIWorkerBatchProcessor({
    claimClient: { rpc: async (name, args) => {
      calls.push(["claim", name, args]);
      return { data: rows, error: null };
    }},
    dispatcher: { dispatch: async (job) => {
      calls.push(["dispatch", job.id]);
      return { outcome: "stopped", jobId: job.id, reason: "test" };
    }},
  });

  const result = await processBatch({
    workerId, leaseSeconds: 90, limit: 2,
  });

  assert.deepEqual(calls, [
    ["claim", "claim_ai_generation_jobs", {
      p_worker_id: workerId, p_lease_seconds: 90, p_limit: 2,
    }],
    ["dispatch", rows[0].id],
    ["dispatch", rows[1].id],
  ]);
  assert.equal(result.claimedCount, 2);
  assert.equal(result.attemptedCount, 2);
  assert.equal(result.dispatchErrorCount, 0);
  assert.deepEqual(result.jobs.map((item) => item.outcome), [
    "dispatched", "dispatched",
  ]);
});

test("real claim validation blocks dispatch when the lease owner is wrong", async () => {
  let dispatchCalls = 0;
  const processBatch = processor.createAIWorkerBatchProcessor({
    claimClient: { rpc: async () => ({
      data: [{ ...rows[0], lease_owner: "different-worker" }],
      error: null,
    })},
    dispatcher: { dispatch: async () => {
      dispatchCalls += 1;
      return { outcome: "stopped", jobId: rows[0].id, reason: "test" };
    }},
  });

  await assert.rejects(
    processBatch({ workerId }),
    (error) => error.code === "CLAIM_SERVICE_INVALID_RESPONSE",
  );
  assert.equal(dispatchCalls, 0);
});

test("real batch runner isolates one dispatch failure and continues sequentially", async () => {
  const attempted = [];
  const processBatch = processor.createAIWorkerBatchProcessor({
    claimClient: { rpc: async () => ({ data: rows, error: null }) },
    dispatcher: { dispatch: async (job) => {
      attempted.push(job.id);
      if (job.id === rows[0].id) throw new Error("sensitive provider detail");
      return { outcome: "stopped", jobId: job.id, reason: "test" };
    }},
  });

  const result = await processBatch({ workerId });
  assert.deepEqual(attempted, [rows[0].id, rows[1].id]);
  assert.deepEqual(result.jobs.map((item) => item.outcome), [
    "dispatch_error", "dispatched",
  ]);
  assert.equal(result.dispatchErrorCount, 1);
  assert.equal(JSON.stringify(result).includes("sensitive provider detail"), false);
});

test("rejects incomplete dependencies before any claim attempt", () => {
  assert.throws(
    () => processor.createAIWorkerBatchProcessor({}),
    /dependencies are incomplete/,
  );
  assert.throws(
    () => processor.createAIWorkerBatchProcessor({
      claimClient: { rpc: "not-a-function" }, dispatcher: {},
    }),
    /dependencies are incomplete/,
  );
});
