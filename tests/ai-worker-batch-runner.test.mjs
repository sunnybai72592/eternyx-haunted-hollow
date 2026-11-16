import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-batch-runner.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runner = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const jobs = [
  { id: "job-one" },
  { id: "job-two" },
  { id: "job-three" },
];

test("claims a bounded batch and dispatches jobs sequentially", async () => {
  const calls = [];
  const result = await runner.runAIWorkerBatch({
    claim: async (input) => { calls.push(["claim", input]); return jobs; },
    dispatch: async (job) => {
      calls.push(["dispatch-start", job.id]);
      await Promise.resolve();
      calls.push(["dispatch-end", job.id]);
      return { outcome: "stopped", jobId: job.id, reason: "test" };
    },
  }, { workerId: "worker-test", leaseSeconds: 120, limit: 3 });

  assert.deepEqual(calls[0], ["claim", {
    workerId: "worker-test", leaseSeconds: 120, limit: 3,
  }]);
  assert.deepEqual(calls.slice(1), [
    ["dispatch-start", "job-one"], ["dispatch-end", "job-one"],
    ["dispatch-start", "job-two"], ["dispatch-end", "job-two"],
    ["dispatch-start", "job-three"], ["dispatch-end", "job-three"],
  ]);
  assert.equal(result.claimedCount, 3);
  assert.equal(result.attemptedCount, 3);
  assert.equal(result.dispatchErrorCount, 0);
});

test("isolates a dispatch exception and continues with later claimed jobs", async () => {
  const attempted = [];
  const result = await runner.runAIWorkerBatch({
    claim: async () => jobs,
    dispatch: async (job) => {
      attempted.push(job.id);
      if (job.id === "job-two") throw new Error("sensitive provider detail");
      return { outcome: "stopped", jobId: job.id, reason: "test" };
    },
  }, { workerId: "worker-test" });

  assert.deepEqual(attempted, ["job-one", "job-two", "job-three"]);
  assert.deepEqual(result.jobs.map((item) => item.outcome), [
    "dispatched", "dispatch_error", "dispatched",
  ]);
  assert.equal(JSON.stringify(result).includes("sensitive provider detail"), false);
  assert.equal(result.dispatchErrorCount, 1);
});

test("does not dispatch when claiming fails", async () => {
  let dispatchCalls = 0;
  await assert.rejects(runner.runAIWorkerBatch({
    claim: async () => { throw new Error("claim unavailable"); },
    dispatch: async () => { dispatchCalls += 1; return {}; },
  }, { workerId: "worker-test" }), /claim unavailable/);
  assert.equal(dispatchCalls, 0);
});

test("rejects invalid limits before calling the claim dependency", async () => {
  let claimCalls = 0;
  const dependencies = {
    claim: async () => { claimCalls += 1; return []; },
    dispatch: async () => ({}),
  };
  for (const input of [
    { workerId: " " },
    { workerId: "worker-test", leaseSeconds: 9 },
    { workerId: "worker-test", leaseSeconds: 901 },
    { workerId: "worker-test", limit: 0 },
    { workerId: "worker-test", limit: 26 },
  ]) {
    await assert.rejects(runner.runAIWorkerBatch(dependencies, input),
      /request is invalid/);
  }
  assert.equal(claimCalls, 0);
});

test("rejects a claim response larger than the requested bound", async () => {
  let dispatchCalls = 0;
  await assert.rejects(runner.runAIWorkerBatch({
    claim: async () => Array(3).fill({ id: "job-overflow" }),
    dispatch: async () => { dispatchCalls += 1; return {}; },
  }, { workerId: "worker-test", limit: 2 }), /invalid batch/);
  assert.equal(dispatchCalls, 0);
});

test("an empty claim is a successful no-work batch", async () => {
  const result = await runner.runAIWorkerBatch({
    claim: async () => [],
    dispatch: async () => { throw new Error("must not run"); },
  }, { workerId: "worker-test" });
  assert.deepEqual(result, {
    workerId: "worker-test", claimedCount: 0, attemptedCount: 0,
    dispatchErrorCount: 0, jobs: [],
  });
});
