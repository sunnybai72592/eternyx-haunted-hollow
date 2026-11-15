import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const source = await read("supabase/functions/_shared/ai-worker-execution-policy.ts");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const policy = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const base = {
  status: "reserved",
  leaseToken: "current-lease-token",
  leaseExpiresAt: "2026-11-15T14:00:00.000Z",
  now: Date.parse("2026-11-15T13:00:00.000Z"),
  providerTaskId: null,
};

test("expired, invalid, or missing lease credentials always stop processing", () => {
  assert.equal(policy.decideAIWorkerExecution({ ...base, leaseExpiresAt: "invalid" }),
    "stop_invalid_or_expired_lease");
  assert.equal(policy.decideAIWorkerExecution({ ...base, leaseExpiresAt: "2026-11-15T12:59:59Z" }),
    "stop_invalid_or_expired_lease");
  assert.equal(policy.decideAIWorkerExecution({ ...base, leaseToken: " " }),
    "stop_invalid_or_expired_lease");
});

test("reserved job without provider task only prepares a fenced submission", () => {
  assert.equal(policy.decideAIWorkerExecution(base), "prepare_submission");
});

test("reserved job with a provider task is reconciled, never resubmitted", () => {
  assert.equal(policy.decideAIWorkerExecution({ ...base, providerTaskId: "provider-task-1" }),
    "reconcile_existing_provider_task");
});

test("submitted and processing jobs reconcile known tasks or quarantine uncertain outcomes", () => {
  for (const status of ["submitted", "processing"]) {
    assert.equal(policy.decideAIWorkerExecution({ ...base, status, providerTaskId: "task-1" }),
      "reconcile_existing_provider_task");
    assert.equal(policy.decideAIWorkerExecution({ ...base, status, providerTaskId: null }),
      "quarantine_uncertain_submission");
  }
});

test("cancellation never starts new provider work", () => {
  assert.equal(policy.decideAIWorkerExecution({ ...base, status: "cancel_requested", providerTaskId: null }),
    "finalize_cancellation_without_provider");
  assert.equal(policy.decideAIWorkerExecution({ ...base, status: "cancel_requested", providerTaskId: "task-1" }),
    "reconcile_cancellation_with_provider");
});
