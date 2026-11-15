import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/ai-worker-reconciliation.ts");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = (name, content) => `data:text/javascript;base64,${Buffer.from(content).toString("base64")}`;
const providerSource = await read("supabase/functions/_shared/ai-generation-provider.ts");
const providerJs = ts.transpileModule(providerSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const providerUrl = moduleUrl("provider", providerJs);
const rewritten = js.replace('"./ai-generation-provider.ts"', `"${providerUrl}"`)
  .replace('"./ai-job-claim.ts"', '"data:text/javascript,export {}"')
  .replace('"./ai-job-transition.ts"', '"data:text/javascript,export {}"')
  .replace('"./ai-job-finalization.ts"', '"data:text/javascript,export {}"');
const reconciliation = await import(moduleUrl("reconciliation", rewritten));

const uuid = (tail) => ["00000000", "0000", "4000", "8000", tail.padStart(12, "0")].join("-");
const job = (status = "processing") => ({
  id: uuid("1"), userId: uuid("2"), featureKey: "video.generate",
  idempotencyKey: "job-idem-1", status, inputPayload: {},
  providerId: "mock", modelId: "mock-video", providerTaskId: "task_123",
  attemptCount: 1, maxAttempts: 3, leaseOwner: "worker",
  leaseToken: uuid("3"), leaseExpiresAt: new Date(Date.now() + 60000).toISOString(),
});
const snapshot = (state, extra = {}) => ({ providerTaskId: "task_123", state, ...extra });
function setup(state, status = "processing", overrides = {}) {
  const calls = [];
  const dependencies = {
    provider: {
      providerId: "mock",
      submit: async () => { calls.push("submit"); throw new Error("must not submit"); },
      cancel: async () => { calls.push("cancel"); return "accepted"; },
      getStatus: async () => { calls.push("status"); return snapshot(state, overrides.snapshot); },
    },
    renewLease: async (input) => { calls.push("renew"); return { jobId: input.jobId, status, leaseExpiresAt: new Date(Date.now() + 120000).toISOString() }; },
    transition: async (input) => { calls.push(["transition", input]); return { jobId: input.jobId, status: input.nextStatus }; },
    finalize: async (input) => { calls.push(["finalize", input]); },
    materializeSuccess: async () => { calls.push("materialize"); return { outputObjectKey: "private/job/output.mp4", finalCredits: 3 }; },
  };
  Object.assign(dependencies, overrides.dependencies || {});
  return { calls, dependencies, job: job(status) };
}

test("reconciles a confirmed processing task without submitting it again", async () => {
  const ctx = setup("processing", "submitted");
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.deepEqual(result, { outcome: "pending", jobId: ctx.job.id, status: "processing" });
  assert.equal(ctx.calls.includes("submit"), false);
  assert.equal(ctx.calls.filter((x) => x === "renew").length, 1);
  assert.equal(ctx.calls.filter((x) => Array.isArray(x) && x[0] === "transition").length, 1);
});

test("provider-confirmed success materializes output before atomic finalization", async () => {
  const ctx = setup("succeeded", "processing", { snapshot: { outputReference: "opaque-output-ref" } });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.status, "succeeded");
  const materializeIndex = ctx.calls.indexOf("materialize");
  const finalizeIndex = ctx.calls.findIndex((x) => Array.isArray(x) && x[0] === "finalize");
  assert.ok(materializeIndex >= 0 && finalizeIndex > materializeIndex);
  assert.equal(ctx.calls[finalizeIndex][1].outputObjectKey, "private/job/output.mp4");
});

test("materialization failure does not finalize success or release credits", async () => {
  const ctx = setup("succeeded", "processing", {
    snapshot: { outputReference: "opaque-output-ref" },
    dependencies: { materializeSuccess: async () => { throw new Error("storage unavailable"); } },
  });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "retry_later");
  assert.equal(ctx.calls.some((x) => Array.isArray(x) && x[0] === "finalize"), false);
});

test("provider-confirmed failure finalizes with provider failure code", async () => {
  const ctx = setup("failed", "processing", { snapshot: { failureCode: "PROVIDER_FAILED" } });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.status, "failed");
  const final = ctx.calls.find((x) => Array.isArray(x) && x[0] === "finalize")[1];
  assert.equal(final.failureCode, "PROVIDER_FAILED");
});

test("cancel request is followed by a fresh lease check and provider status confirmation", async () => {
  const ctx = setup("processing", "cancel_requested");
  await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.deepEqual(ctx.calls.slice(0, 4), ["renew", "cancel", "renew", "status"]);
  assert.equal(ctx.calls.includes("submit"), false);
});

test("accepted cancellation is not treated as completed until provider confirms cancelled", async () => {
  const ctx = setup("processing", "cancel_requested");
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "pending");
  assert.equal(result.status, "cancel_requested");
  assert.equal(ctx.calls.some((x) => Array.isArray(x) && x[0] === "finalize" && x[1].nextStatus === "cancelled"), false);
});

test("confirmed cancellation releases only through atomic finalization", async () => {
  const ctx = setup("cancelled", "cancel_requested");
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.status, "cancelled");
  const final = ctx.calls.find((x) => Array.isArray(x) && x[0] === "finalize")[1];
  assert.equal(final.nextStatus, "cancelled");
});

test("provider status outage is retryable and never falsely fails or releases credits", async () => {
  const ctx = setup("processing", "processing", {
    dependencies: { provider: { ...setup("processing").dependencies.provider, getStatus: async () => { throw new Error("offline"); } } },
  });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "retry_later");
  assert.equal(ctx.calls.some((x) => Array.isArray(x) && x[0] === "finalize"), false);
});

test("lease loss before provider read prevents all provider calls", async () => {
  const ctx = setup("processing", "processing", {
    dependencies: { renewLease: async () => { throw new Error("lease lost"); } },
  });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "stopped");
  assert.equal(ctx.calls.includes("status"), false);
  assert.equal(ctx.calls.includes("cancel"), false);
});

test("lease renewal receipt must match the job and current status before provider access", async () => {
  const ctx = setup("processing", "processing", {
    dependencies: { renewLease: async () => ({ jobId: uuid("9"), status: "processing", leaseExpiresAt: new Date(Date.now() + 120000).toISOString() }) },
  });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "stopped");
  assert.equal(ctx.calls.includes("status"), false);
  assert.equal(ctx.calls.includes("cancel"), false);
});

test("provider task mismatch is quarantined without another submission", async () => {
  const ctx = setup("processing", "processing", { snapshot: { providerTaskId: "different_task" } });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "quarantined");
  assert.equal(ctx.calls.includes("submit"), false);
});

test("success finalization failure remains retryable after materialization", async () => {
  const ctx = setup("succeeded", "processing", {
    snapshot: { outputReference: "opaque-output-ref" },
    dependencies: { finalize: async () => { throw new Error("rpc unavailable"); } },
  });
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "retry_later");
  assert.equal(result.reason, "success_finalization_unavailable");
});

test("reserved job with an existing queued provider task transitions to submitted without resubmitting", async () => {
  const ctx = setup("queued", "reserved");
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.deepEqual(result, { outcome: "pending", jobId: ctx.job.id, status: "submitted" });
  const transition = ctx.calls.find((x) => Array.isArray(x) && x[0] === "transition")[1];
  assert.equal(transition.currentStatus, "reserved");
  assert.equal(transition.nextStatus, "submitted");
  assert.equal(ctx.calls.includes("submit"), false);
});

test("reserved job with an existing processing task transitions directly to processing", async () => {
  const ctx = setup("processing", "reserved");
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.deepEqual(result, { outcome: "pending", jobId: ctx.job.id, status: "processing" });
  const transition = ctx.calls.find((x) => Array.isArray(x) && x[0] === "transition")[1];
  assert.equal(transition.currentStatus, "reserved");
  assert.equal(transition.nextStatus, "processing");
  assert.equal(ctx.calls.includes("submit"), false);
});

test("missing task ID or unsupported status stops before provider access", async () => {
  const ctx = setup("processing", "processing");
  ctx.job.providerTaskId = null;
  const result = await reconciliation.reconcileClaimedAIJob(ctx.job, ctx.dependencies);
  assert.equal(result.outcome, "stopped");
  assert.equal(ctx.calls.includes("status"), false);
});
