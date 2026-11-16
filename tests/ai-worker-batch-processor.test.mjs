import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-batch-processor.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = (value) => `data:text/javascript;base64,${Buffer.from(value).toString("base64")}`;

const claimStub = dataUrl(`
 export async function claimAIJobs(client, input) {
   return client.rpc("claim_ai_generation_jobs", {
     p_worker_id: input.workerId,
     p_lease_seconds: input.leaseSeconds ?? 60,
     p_limit: input.limit ?? 5,
   }).then((result) => {
     if (result.error) throw new Error("claim unavailable");
     return result.data;
   });
 }`);
const dispatcherStub = dataUrl(`
 export function createAIWorkerJobDispatcher(dependencies) {
   if (!dependencies) throw new Error("dispatcher dependencies missing");
   return dependencies.dispatch;
 }`);
const runnerStub = dataUrl(`
 export async function runAIWorkerBatch(dependencies, input) {
   const claimed = await dependencies.claim(input);
   const jobs = [];
   let dispatchErrorCount = 0;
   for (const job of claimed) {
     try { jobs.push({ jobId: job.id, outcome: "dispatched", result: await dependencies.dispatch(job) }); }
     catch { jobs.push({ jobId: job.id, outcome: "dispatch_error" }); dispatchErrorCount++; }
   }
   return { workerId: input.workerId, claimedCount: claimed.length, attemptedCount: jobs.length, dispatchErrorCount, jobs };
 }`);
const rewritten = js
 .replace('"./ai-job-claim.ts"', `"${claimStub}"`)
 .replace('"./ai-worker-job-dispatcher.ts"', `"${dispatcherStub}"`)
 .replace('"./ai-worker-batch-runner.ts"', `"${runnerStub}"`);
const processor = await import(dataUrl(rewritten));

const job = { id: "job-1" };

test("composes atomic claim and the existing dispatcher into one bounded batch", async () => {
 const calls = [];
 const processBatch = processor.createAIWorkerBatchProcessor({
   claimClient: { rpc: async (name, args) => {
     calls.push(["claim", name, args]);
     return { data: [job], error: null };
   }},
   dispatcher: { dispatch: async (claimed) => {
     calls.push(["dispatch", claimed.id]);
     return { outcome: "stopped", jobId: claimed.id, reason: "test" };
   }},
 });
 const result = await processBatch({ workerId: "worker-1", leaseSeconds: 90, limit: 4 });
 assert.deepEqual(calls, [
   ["claim", "claim_ai_generation_jobs", { p_worker_id: "worker-1", p_lease_seconds: 90, p_limit: 4 }],
   ["dispatch", "job-1"],
 ]);
 assert.equal(result.claimedCount, 1);
 assert.equal(result.attemptedCount, 1);
});

test("rejects missing trusted claim or dispatcher dependencies before processing", () => {
 assert.throws(() => processor.createAIWorkerBatchProcessor({}), /dependencies are incomplete/);
 assert.throws(() => processor.createAIWorkerBatchProcessor({
   claimClient: { rpc: "not-a-function" }, dispatcher: {},
 }), /dependencies are incomplete/);
});

test("claim failure prevents dispatch", async () => {
 let dispatchCalls = 0;
 const processBatch = processor.createAIWorkerBatchProcessor({
   claimClient: { rpc: async () => ({ data: null, error: { message: "offline" } }) },
   dispatcher: { dispatch: async () => { dispatchCalls++; return {}; } },
 });
 await assert.rejects(processBatch({ workerId: "worker-1" }), /claim unavailable/);
 assert.equal(dispatchCalls, 0);
});

test("dispatch exceptions remain isolated by the batch runner", async () => {
 const processBatch = processor.createAIWorkerBatchProcessor({
   claimClient: { rpc: async () => ({ data: [job, { id: "job-2" }], error: null }) },
   dispatcher: { dispatch: async (claimed) => {
     if (claimed.id === "job-1") throw new Error("sensitive failure");
     return { outcome: "stopped", jobId: claimed.id, reason: "test" };
   }},
 });
 const result = await processBatch({ workerId: "worker-1" });
 assert.deepEqual(result.jobs.map((item) => item.outcome), ["dispatch_error", "dispatched"]);
 assert.equal(JSON.stringify(result).includes("sensitive failure"), false);
});
