import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/ai-job-finalization.ts");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const finalization = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const uuid = (tail) => ["00000000", "0000", "4000", "8000", tail.padStart(12, "0")].join("-");
const jobId = uuid("1");
const leaseToken = uuid("2");
const success = {
  jobId, leaseToken, nextStatus: "succeeded",
  eventCode: "worker.provider_success_materialized",
  outputObjectKey: "user-owned/job-output/video.mp4",
  finalCredits: 4,
  providerId: "mock", modelId: "mock-video", providerTaskId: "task_123",
};

test("successful finalization passes materialized object and final charge to atomic RPC", async () => {
  let call;
  const client = { rpc: async (name, args) => {
    call = { name, args };
    return { data: { job_id: jobId, status: "succeeded", already_processed: false }, error: null };
  }};
  const result = await finalization.finalizeAIGenerationJob(client, success);
  assert.deepEqual(result, { jobId, status: "succeeded", alreadyProcessed: false });
  assert.equal(call.name, "finalize_ai_generation_job");
  assert.equal(call.args.p_output_object_key, success.outputObjectKey);
  assert.equal(call.args.p_final_credits, 4);
  assert.equal(call.args.p_lease_token, leaseToken);
});

test("success cannot finalize without an object key and explicit final credit amount", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: null }; } };
  for (const input of [
    { ...success, outputObjectKey: undefined },
    { ...success, finalCredits: undefined },
    { ...success, finalCredits: -1 },
    { ...success, finalCredits: 1.5 },
  ]) {
    await assert.rejects(
      finalization.finalizeAIGenerationJob(client, input),
      (error) => error.code === "INVALID_REQUEST",
    );
  }
  assert.equal(calls, 0);
});

test("failure and cancellation require distinct terminal inputs and never settle credits", async () => {
  let call;
  const client = { rpc: async (name, args) => {
    call = { name, args };
    return { data: { job_id: jobId, status: args.p_next_status, already_processed: false }, error: null };
  }};
  await assert.rejects(
    finalization.finalizeAIGenerationJob(client, {
      jobId, leaseToken, nextStatus: "failed", eventCode: "worker.failed",
    }),
    (error) => error.code === "INVALID_REQUEST",
  );
  const failed = await finalization.finalizeAIGenerationJob(client, {
    jobId, leaseToken, nextStatus: "failed", eventCode: "worker.failed",
    failureCode: "PROVIDER_FAILED",
  });
  assert.equal(failed.status, "failed");
  assert.equal(call.args.p_final_credits, null);
  assert.equal(call.args.p_output_object_key, null);

  const cancelled = await finalization.finalizeAIGenerationJob(client, {
    jobId, leaseToken, nextStatus: "cancelled", eventCode: "worker.cancelled",
  });
  assert.equal(cancelled.status, "cancelled");
});

test("uncertain outcomes preserve the credit hold and require a failure code", async () => {
  let calls = 0;
  const client = { rpc: async (_name, args) => {
    calls++;
    return { data: {
      job_id: jobId, status: args.p_next_status,
      already_processed: false, credit_hold_preserved: true,
    }, error: null };
  }};
  await assert.rejects(
    finalization.finalizeAIGenerationJob(client, {
      jobId, leaseToken, nextStatus: "reconciliation_required",
      eventCode: "worker.uncertain",
    }),
    (error) => error.code === "INVALID_REQUEST",
  );
  const result = await finalization.finalizeAIGenerationJob(client, {
    jobId, leaseToken, nextStatus: "reconciliation_required",
    eventCode: "worker.uncertain", failureCode: "PROVIDER_OUTCOME_UNKNOWN",
  });
  assert.equal(result.creditHoldPreserved, true);
  assert.equal(calls, 1);
});

test("invalid identifiers, metadata, status, and event codes are rejected before RPC", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: null }; } };
  for (const input of [
    { ...success, jobId: "not-a-uuid" },
    { ...success, leaseToken: "not-a-uuid" },
    { ...success, providerId: "Bad Provider" },
    { ...success, modelId: " " },
    { ...success, providerTaskId: "bad task id" },
    { ...success, eventCode: "Bad Event" },
    { ...success, nextStatus: "processing" },
    { ...success, outputObjectKey: "../outside-bucket" },
  ]) {
    await assert.rejects(
      finalization.finalizeAIGenerationJob(client, input),
      (error) => error.code === "INVALID_REQUEST",
    );
  }
  assert.equal(calls, 0);
});

test("RPC errors and malformed responses fail closed without leaking database details", async () => {
  await assert.rejects(
    finalization.finalizeAIGenerationJob({
      rpc: async () => ({ data: null, error: { message: "private lease detail" } }),
    }, success),
    (error) => error.code === "FINALIZATION_REJECTED" && !error.message.includes("private"),
  );
  await assert.rejects(
    finalization.finalizeAIGenerationJob({
      rpc: async () => ({ data: { job_id: jobId, status: "failed", already_processed: false }, error: null }),
    }, success),
    (error) => error.code === "FINALIZATION_SERVICE_INVALID_RESPONSE",
  );
});
