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
let source = await read("supabase/functions/_shared/ai-worker-reconciliation.ts");
let js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
js = js.replace(/import \{[\s\S]*?\} from ["']\.\/ai-generation-provider\.ts["'];/,
  "const { validateAIGenerationSnapshot } = globalThis.__aiProvider;");
js = js.replace(/import \{ decideAIWorkerExecution \} from ["']\.\/ai-worker-execution-policy\.ts["'];/,
  "const { decideAIWorkerExecution } = globalThis.__aiPolicy;");
js = js.replace(/import type \{[\s\S]*?\} from ["']\.\/ai-job-claim\.ts["'];/, "");
js = js.replace(/import type \{[\s\S]*?\} from ["']\.\/ai-job-lease\.ts["'];/, "");
js = js.replace(/import type \{[\s\S]*?\} from ["']\.\/ai-job-transition\.ts["'];/, "");
const worker = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const job = {
  id: ["00000000", "0000", "4000", "8000", "000000000001"].join("-"),
  userId: ["00000000", "0000", "4000", "8000", "000000000002"].join("-"),
  featureKey: "video.generate", idempotencyKey: "request-1", status: "submitted",
  inputPayload: { prompt: "test" }, providerId: "mock", modelId: "mock-video",
  providerTaskId: "task_123", attemptCount: 1, maxAttempts: 3, leaseOwner: "worker-test",
  leaseToken: ["00000000", "0000", "4000", "8000", "000000000003"].join("-"),
  leaseExpiresAt: "2026-11-15T14:00:00.000Z",
};
const baseSnapshot = { providerTaskId: "task_123", state: "processing" };

function dependencies(overrides = {}) {
  const calls = [];
  const deps = {
    provider: {
      providerId: "mock",
      submit: async () => { throw new Error("must never submit during reconciliation"); },
      cancel: async () => { calls.push("cancel"); return "accepted"; },
      getStatus: async () => { calls.push("status"); return baseSnapshot; },
    },
    renewLease: async () => { calls.push("renew"); return {
      jobId: job.id, status: job.status, leaseExpiresAt: "2026-11-15T15:00:00.000Z",
    }; },
    transition: async (input) => { calls.push(["transition", input]); return { jobId: job.id, status: input.nextStatus }; },
    finalize: async (input) => { calls.push(["finalize", input]); return {}; },
    completeSuccess: async (input) => { calls.push(["completeSuccess", input]); return {}; },
    ...overrides,
  };
  return { deps, calls };
}

test("submitted jobs are reconciled without submitting again", async () => {
  const { deps, calls } = dependencies();
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.deepEqual(calls, ["renew", "status"]);
  assert.deepEqual(result, { outcome: "pending", jobId: job.id, status: "submitted" });
});

test("provider processing advances submitted job through lease-fenced transition", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, getStatus: async () => ({
      providerTaskId: "task_123", state: "processing", progressPercent: 25,
    }) },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.outcome, "updated");
  assert.equal(calls.at(-1)[1].nextStatus, "processing");
});

test("cancel requests are sent only after lease renewal and verified by status", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, cancel: async () => {
      calls.push("cancel"); return "accepted";
    }, getStatus: async () => { calls.push("status"); return baseSnapshot; } },
  });
  const result = await worker.reconcileAIJob({ ...job, status: "cancel_requested" }, deps,
    Date.parse("2026-11-15T13:00:00Z"));
  assert.deepEqual(calls, ["renew", "cancel", "renew", "status"]);
  assert.deepEqual(result, { outcome: "pending", jobId: job.id, status: "cancel_requested" });
});

test("provider-confirmed cancellation uses atomic finalization callback", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, getStatus: async () => ({
      providerTaskId: "task_123", state: "cancelled",
    }) },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.status, "cancelled");
  assert.equal(calls.at(-1)[1].nextStatus, "cancelled");
});

test("provider failures finalize with provider failure code", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, getStatus: async () => ({
      providerTaskId: "task_123", state: "failed", failureCode: "RENDER_FAILED",
    }) },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.status, "failed");
  assert.equal(calls.at(-1)[1].failureCode, "RENDER_FAILED");
});

test("success delegates output materialization and central credit settlement", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, getStatus: async () => ({
      providerTaskId: "task_123", state: "succeeded", outputReference: "provider-output-ref",
    }) },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.status, "succeeded");
  assert.equal(calls.at(-1)[0], "completeSuccess");
  assert.equal(calls.at(-1)[1].providerSnapshot.outputReference, "provider-output-ref");
});

test("status lookup failures never falsely finalize or release credit holds", async () => {
  const { deps, calls } = dependencies({
    provider: { ...dependencies().deps.provider, getStatus: async () => { throw new Error("offline"); } },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.reason, "provider_status_unavailable");
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "finalize"), false);
});

test("lease renewal failure prevents all provider calls", async () => {
  const { deps, calls } = dependencies({
    renewLease: async () => { calls.push("renew_failed"); throw new Error("lease lost"); },
  });
  const result = await worker.reconcileAIJob(job, deps, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(result.reason, "lease_not_confirmed_before_status");
  assert.deepEqual(calls, ["renew_failed"]);
});
