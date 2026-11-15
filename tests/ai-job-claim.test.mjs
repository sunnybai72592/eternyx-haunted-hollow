import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/ai-job-claim.ts");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const claim = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const jobId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const leaseToken = "00000000-0000-4000-8000-000000000003";
const workerId = "worker-test-1";
const row = {
  id: jobId, user_id: userId, feature_key: "video.generate",
  idempotency_key: "request-1", status: "reserved",
  input_payload: { prompt: "private prompt" },
  provider_id: null, model_id: null, provider_task_id: null,
  attempt_count: 1, max_attempts: 3, lease_owner: workerId,
  lease_token: leaseToken, lease_expires_at: "2026-11-15T13:00:00Z",
};

test("claim validates worker identity and bounded lease and batch limits before RPC", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: [], error: null }; } };
  await assert.rejects(claim.claimAIJobs(client, { workerId: " " }),
    (error) => error.code === "INVALID_REQUEST");
  await assert.rejects(claim.claimAIJobs(client, { workerId, leaseSeconds: 901 }),
    (error) => error.code === "INVALID_REQUEST");
  await assert.rejects(claim.claimAIJobs(client, { workerId, limit: 26 }),
    (error) => error.code === "INVALID_REQUEST");
  assert.equal(calls, 0);
});

test("claim calls the atomic RPC and returns a validated safe projection", async () => {
  let call;
  const client = { rpc: async (name, args) => {
    call = { name, args };
    return { data: [row], error: null };
  }};
  const jobs = await claim.claimAIJobs(client, { workerId, leaseSeconds: 120, limit: 4 });
  assert.deepEqual(call, {
    name: "claim_ai_generation_jobs",
    args: { p_worker_id: workerId, p_lease_seconds: 120, p_limit: 4 },
  });
  assert.deepEqual(jobs, [{
    id: jobId, userId, featureKey: "video.generate", idempotencyKey: "request-1",
    status: "reserved", inputPayload: { prompt: "private prompt" },
    providerId: null, modelId: null, providerTaskId: null,
    attemptCount: 1, maxAttempts: 3, leaseOwner: workerId,
    leaseToken, leaseExpiresAt: "2026-11-15T13:00:00Z",
  }]);
});

test("claim rejects stale owner, invalid token, terminal state and malformed payload", async () => {
  for (const bad of [
    { ...row, lease_owner: "another-worker" },
    { ...row, lease_token: "invalid" },
    { ...row, status: "succeeded" },
    { ...row, input_payload: [] },
    { ...row, attempt_count: 4 },
    { ...row, lease_expires_at: "not-a-date" },
  ]) {
    const client = { rpc: async () => ({ data: [bad], error: null }) };
    await assert.rejects(claim.claimAIJobs(client, { workerId }),
      (error) => error.code === "CLAIM_SERVICE_INVALID_RESPONSE");
  }
});

test("claim rejects oversized batches and unavailable RPC responses", async () => {
  const tooMany = { rpc: async () => ({ data: Array(6).fill(row), error: null }) };
  await assert.rejects(claim.claimAIJobs(tooMany, { workerId, limit: 5 }),
    (error) => error.code === "CLAIM_SERVICE_INVALID_RESPONSE");
  const unavailable = { rpc: async () => ({ data: null, error: { message: "offline" } }) };
  await assert.rejects(claim.claimAIJobs(unavailable, { workerId }),
    (error) => error.code === "CLAIM_SERVICE_UNAVAILABLE");
});
