import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/ai-job-transition.ts");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const transition = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const jobId = "00000000-0000-4000-8000-000000000001";
const leaseToken = "00000000-0000-4000-8000-000000000002";
const base = {
  jobId, leaseToken, currentStatus: "reserved", nextStatus: "submitted",
  eventCode: "job.provider_submission_prepared",
};

test("valid transition invokes the lease-fenced RPC with explicit nullable fields", async () => {
  let call;
  const client = { rpc: async (name, args) => {
    call = { name, args };
    return { data: { job_id: jobId, status: "submitted" }, error: null };
  }};
  const result = await transition.transitionAIJob(client, base);
  assert.deepEqual(result, { jobId, status: "submitted" });
  assert.equal(call.name, "transition_ai_generation_job");
  assert.equal(call.args.p_lease_token, leaseToken);
  assert.equal(call.args.p_output_object_key, null);
});

test("invalid identifiers, event codes, and transition pairs are rejected before RPC", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: null }; } };
  for (const input of [
    { ...base, jobId: "not-a-uuid" },
    { ...base, leaseToken: "not-a-uuid" },
    { ...base, eventCode: "Bad Event" },
    { ...base, currentStatus: "processing", nextStatus: "submitted" },
    { ...base, currentStatus: "cancel_requested", nextStatus: "submitted" },
    { ...base, nextStatus: "reconciliation_required" },
    { ...base, nextStatus: "queued" },
  ]) {
    await assert.rejects(
      transition.transitionAIJob(client, input),
      (error) => error.code === "INVALID_REQUEST",
    );
  }
  assert.equal(calls, 0);
});

test("reconciliation requires a failure code and retry requires a bounded delay", async () => {
  const client = { rpc: async () => ({ data: { job_id: jobId, status: "reconciliation_required" }, error: null }) };
  await assert.rejects(
    transition.transitionAIJob(client, { ...base, nextStatus: "reconciliation_required" }),
    (error) => error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    transition.transitionAIJob(client, { ...base, nextStatus: "queued", retryAfterSeconds: 0 }),
    (error) => error.code === "INVALID_REQUEST",
  );
});

test("RPC failures and malformed responses fail closed with stable errors", async () => {
  await assert.rejects(
    transition.transitionAIJob({ rpc: async () => ({ data: null, error: { message: "private db detail" } }) }, base),
    (error) => error.code === "TRANSITION_SERVICE_UNAVAILABLE" && !error.message.includes("private"),
  );
  await assert.rejects(
    transition.transitionAIJob({ rpc: async () => ({ data: { job_id: jobId, status: "processing" }, error: null }) }, base),
    (error) => error.code === "TRANSITION_SERVICE_INVALID_RESPONSE",
  );
});

test("terminal outcomes are excluded so callers must use atomic finalization", async () => {
  const client = { rpc: async () => ({ data: null, error: null }) };
  for (const nextStatus of ["succeeded", "failed", "cancelled"]) {
    await assert.rejects(
      transition.transitionAIJob(client, { ...base, nextStatus }),
      (error) => error.code === "INVALID_REQUEST",
    );
  }
});
