import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const helperSource = await read("supabase/functions/_shared/ai-job-lease.ts");
const js = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const jobId = ["00000000", "0000", "4000", "8000", "000000000001"].join("-");
const leaseToken = ["00000000", "0000", "4000", "8000", "000000000002"].join("-");

test("lease renewal migration is bounded and restricted to service role", async () => {
  const sql = await read("supabase/migrations/20261115070000_renew_ai_generation_job_lease.sql");
  assert.match(sql, /Review-only: do not apply/);
  assert.match(sql, /p_lease_seconds NOT BETWEEN 10 AND 900/);
  assert.match(sql, /WHERE id = p_job_id[\s\S]*?AND lease_token = p_lease_token[\s\S]*?FOR UPDATE/);
  assert.match(sql, /v_job\.lease_expires_at <= now\(\)/);
  assert.match(sql, /status NOT IN \('reserved', 'submitted', 'processing', 'cancel_requested'\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.renew_ai_generation_job_lease[\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.renew_ai_generation_job_lease[\s\S]*?TO service_role/);
});

test("renewal helper validates IDs and the bounded lease duration before RPC", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return { data: null, error: null }; } };
  await assert.rejects(
    helper.renewAIJobLease(client, { jobId: "bad", leaseToken }),
    (error) => error.code === "INVALID_REQUEST",
  );
  await assert.rejects(
    helper.renewAIJobLease(client, { jobId, leaseToken, leaseSeconds: 901 }),
    (error) => error.code === "INVALID_REQUEST",
  );
  assert.equal(calls, 0);
});

test("renewal helper calls only the bounded renewal RPC and parses its receipt", async () => {
  let call;
  const client = {
    rpc: async (name, args) => {
      call = { name, args };
      return {
        data: { job_id: jobId, status: "processing", lease_expires_at: "2026-11-15T13:00:00Z" },
        error: null,
      };
    },
  };
  const result = await helper.renewAIJobLease(client, { jobId, leaseToken, leaseSeconds: 120 });
  assert.equal(call.name, "renew_ai_generation_job_lease");
  assert.deepEqual(call.args, { p_job_id: jobId, p_lease_token: leaseToken, p_lease_seconds: 120 });
  assert.deepEqual(result, {
    jobId, status: "processing", leaseExpiresAt: "2026-11-15T13:00:00Z",
  });
});

test("renewal helper rejects stale leases and malformed RPC receipts", async () => {
  const stale = { rpc: async () => ({ data: null, error: { message: "AI job lease is missing or expired" } }) };
  await assert.rejects(
    helper.renewAIJobLease(stale, { jobId, leaseToken }),
    (error) => error.code === "LEASE_RENEWAL_REJECTED",
  );
  const malformed = { rpc: async () => ({
    data: { job_id: jobId, status: "succeeded", lease_expires_at: "not-a-date" }, error: null,
  }) };
  await assert.rejects(
    helper.renewAIJobLease(malformed, { jobId, leaseToken }),
    (error) => error.code === "LEASE_SERVICE_INVALID_RESPONSE",
  );
});
