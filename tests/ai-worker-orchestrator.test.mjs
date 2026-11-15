import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
async function loadTypeScript(path) {
  const source = await read(path);
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const providerModule = await loadTypeScript("supabase/functions/_shared/ai-generation-provider.ts");
const policyModule = await loadTypeScript("supabase/functions/_shared/ai-worker-execution-policy.ts");
globalThis.__aiProvider = providerModule;
globalThis.__aiPolicy = policyModule;
let source = await read("supabase/functions/_shared/ai-worker-orchestrator.ts");
let js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
js = js.replace(/import \{[\s\S]*?\} from ["']\.\/ai-generation-provider\.ts["'];/,
  "const { AIGenerationAdapterError, validateAIGenerationSubmissionResult } = globalThis.__aiProvider;");
js = js.replace(/import \{ decideAIWorkerExecution \} from ["']\.\/ai-worker-execution-policy\.ts["'];/,
  "const { decideAIWorkerExecution } = globalThis.__aiPolicy;");
const worker = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const job = {
  id: ["00000000", "0000", "4000", "8000", "000000000001"].join("-"),
  userId: ["00000000", "0000", "4000", "8000", "000000000002"].join("-"),
  featureKey: "video.generate", idempotencyKey: "request-1", status: "reserved",
  inputPayload: { prompt: "test" }, providerId: "mock", modelId: "mock-video",
  providerTaskId: null, attemptCount: 1, maxAttempts: 3, leaseOwner: "worker-test",
  leaseToken: ["00000000", "0000", "4000", "8000", "000000000003"].join("-"),
  leaseExpiresAt: "2026-11-15T14:00:00.000Z",
};
const accepted = { outcome: "accepted", providerTaskId: "task_123", state: "queued" };

function dependencies(overrides = {}) {
  const calls = [];
  const deps = {
    provider: { providerId: "mock", submit: async () => { calls.push("provider"); return accepted; },
      getStatus: async () => { throw new Error("unused"); }, cancel: async () => "unsupported" },
    buildSubmission: async () => ({ payload: { prompt: "test" }, idempotencyKey: "request-1" }),
    transition: async (input) => { calls.push(["transition", input]); return { jobId: job.id, status: input.nextStatus }; },
    renewLease: async () => { calls.push("renew"); return {}; },
    finalize: async (input) => { calls.push(["finalize", input]); return {}; },
    ...overrides,
  };
  return { deps, calls };
}

test("submission intent is persisted and lease renewed before provider call", async () => {
  const { deps, calls } = dependencies();
  const result = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call),
    ["transition", "renew", "provider", "transition"]);
  assert.equal(calls[0][1].nextStatus, "submitted");
  assert.equal(calls[3][1].providerTaskId, "task_123");
  assert.deepEqual(result, { outcome: "submitted", jobId: job.id, providerTaskId: "task_123" });
});

test("failed submitted transition prevents all provider calls", async () => {
  const { deps, calls } = dependencies({
    transition: async () => { calls.push("transition_failed"); throw new Error("offline"); },
  });
  const result = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.deepEqual(calls, ["transition_failed"]);
  assert.equal(result.reason, "submission_intent_not_persisted");
});

test("failed lease renewal prevents provider call", async () => {
  const { deps, calls } = dependencies({
    renewLease: async () => { calls.push("renew_failed"); throw new Error("lease lost"); },
  });
  const result = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call),
    ["transition", "renew_failed"]);
  assert.equal(result.reason, "lease_not_confirmed_before_provider");
});

test("uncertain provider acknowledgement is quarantined, never blindly resubmitted", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, submit: async () => ({
      outcome: "uncertain", reason: "timeout",
    }) },
  });
  const result = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.status, "reconciliation_required");
  assert.equal(calls.at(-1)[1].failureCode, "PROVIDER_SUBMISSION_UNCERTAIN");
});

test("provider-confirmed non-acceptance finalizes without retrying in the same worker pass", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, submit: async () => {
      throw new providerModule.AIGenerationAdapterError("request_rejected", true);
    } },
  });
  const result = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.outcome, "finalized");
  assert.equal(result.status, "failed");
  assert.equal(calls.at(-1)[1].failureCode, "PROVIDER_REJECTED_BEFORE_ACCEPTANCE");
});

test("expired leases and existing provider tasks do not submit", async () => {
  const { deps, calls } = dependencies();
  const expired = await worker.submitReservedAIJob(job, deps, Date.parse("2026-11-15T15:00:00Z"));
  const existing = await worker.submitReservedAIJob({ ...job, providerTaskId: "task_existing" }, deps,
    Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(expired.reason, "invalid_or_expired_lease");
  assert.equal(existing.outcome, "requires_reconciliation");
  assert.equal(calls.length, 0);
});
