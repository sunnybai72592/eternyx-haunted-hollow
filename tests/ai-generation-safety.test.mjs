import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const helperSource = await readFile(new URL("../supabase/functions/_shared/ai-generation-safety.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const safety = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const digest = "a".repeat(64), now = Date.parse("2026-11-15T12:00:00.000Z");
test("fails closed when no trusted moderation decision exists", () => {
  assert.throws(() => safety.requireAIGenerationSafetyApproval(null, digest, now), { code: "safety_unavailable" });
  assert.throws(() => safety.requireAIGenerationSafetyApproval(undefined, digest, now), { code: "safety_unavailable" });
});
test("accepts only a fresh approval bound to the exact request digest", () => {
  const decision = { status: "approved", policyVersion: "policy-v1", checkedAt: "2026-11-15T11:59:00.000Z", requestDigest: digest };
  assert.deepEqual(safety.requireAIGenerationSafetyApproval(decision, digest, now), decision);
  assert.throws(() => safety.requireAIGenerationSafetyApproval({ ...decision, requestDigest: "b".repeat(64) }, digest, now), { code: "safety_not_approved" });
});
test("rejects pending, rejected, malformed, future-dated and stale decisions", () => {
  const base = { policyVersion: "policy-v1", checkedAt: "2026-11-15T11:59:00.000Z", requestDigest: digest };
  for (const status of ["pending", "rejected", "unavailable", "approved-but-unknown"]) {
    assert.throws(() => safety.requireAIGenerationSafetyApproval({ ...base, status }, digest, now), { code: "safety_not_approved" });
  }
  for (const checkedAt of ["2026-11-15T11:50:00.000Z", "2026-11-15T12:01:00.000Z"]) {
    assert.throws(() => safety.requireAIGenerationSafetyApproval({ ...base, status: "approved", checkedAt }, digest, now), { code: "safety_decision_stale" });
  }
});
test("enqueue checks safety before reserving credits or creating a job", async () => {
  const source = await readFile(new URL("../supabase/functions/ai-generation-job-enqueue/index.ts", import.meta.url), "utf8");
  assert.match(source, /requireAIGenerationSafetyApproval\(null,/);
  assert.ok(source.indexOf("requireAIGenerationSafetyApproval(null,") < source.indexOf("enqueue_ai_generation_job_with_credits"));
  assert.match(source, /AI generation safety checks are not currently available/);
});
