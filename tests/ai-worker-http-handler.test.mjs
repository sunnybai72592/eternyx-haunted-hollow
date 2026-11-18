import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../supabase/functions/_shared/ai-worker-http-handler.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
const secret = "a".repeat(48);
const validJobId = ["123e4567", "e89b", "42d3", "a456", "426614174001"].join("-");
const makeHandler = (processBatch = async (input) => ({
  workerId: input.workerId,
  claimedCount: 1,
  attemptedCount: 1,
  dispatchErrorCount: 0,
  jobs: [{ jobId: validJobId, outcome: "dispatched", result: { providerTaskId: "private-task" } }],
})) => module.createAIWorkerHttpHandler({
  secret, workerId: "worker-east-1", processBatch,
});
const authorized = (body, extra = {}) => new Request("https://worker.invalid/batch", {
  method: "POST",
  headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("rejects non-POST methods without invoking the processor", async () => {
  let calls = 0;
  const handler = makeHandler(async () => { calls += 1; throw new Error("unexpected"); });
  const response = await handler(new Request("https://worker.invalid/batch", { method: "GET" }));
  assert.equal(response.status, 405);
  assert.equal(calls, 0);
});

test("rejects missing and incorrect bearer credentials", async () => {
  let calls = 0;
  const handler = makeHandler(async () => { calls += 1; throw new Error("unexpected"); });
  for (const authorization of [undefined, "Bearer wrong-secret"]) {
    const headers = authorization ? { authorization } : {};
    const response = await handler(new Request("https://worker.invalid/batch", { method: "POST", headers }));
    assert.equal(response.status, 401);
  }
  assert.equal(calls, 0);
});

test("passes only server-configured worker identity and bounded options", async () => {
  const received = [];
  const handler = makeHandler(async (input) => {
    received.push(input);
    return { workerId: input.workerId, claimedCount: 0, attemptedCount: 0, dispatchErrorCount: 0, jobs: [] };
  });
  const response = await handler(authorized({ limit: 4, leaseSeconds: 120 }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, [{ workerId: "worker-east-1", limit: 4, leaseSeconds: 120 }]);
});

test("rejects unknown or out-of-range options before processing", async () => {
  let calls = 0;
  const handler = makeHandler(async () => { calls += 1; throw new Error("unexpected"); });
  for (const body of [{ limit: 26 }, { leaseSeconds: 9 }, { workerId: "attacker" }]) {
    const response = await handler(authorized(body));
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("sanitizes processor results and never returns nested provider metadata", async () => {
  const response = await makeHandler()(authorized({}));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.jobs, [{ jobId: validJobId, outcome: "dispatched" }]);
  assert.equal(JSON.stringify(payload).includes("private-task"), false);
});

test("returns generic service errors without leaking internal details", async () => {
  const response = await makeHandler(async () => { throw new Error("database password detail"); })(authorized({}));
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(JSON.stringify(payload).includes("database password detail"), false);
});

test("requires complete secure dependencies at construction", () => {
  assert.throws(() => module.createAIWorkerHttpHandler({
    secret: "short", workerId: "worker", processBatch: async () => ({}),
  }), /dependencies are incomplete/);
});

test("rejects malformed batch results without exposing partial data", async () => {
  const invalidResults = [
    { workerId: "attacker-worker", claimedCount: 0, attemptedCount: 0, dispatchErrorCount: 0, jobs: [] },
    { workerId: "worker-east-1", claimedCount: 1, attemptedCount: 0, dispatchErrorCount: 0, jobs: [] },
    { workerId: "worker-east-1", claimedCount: 1, attemptedCount: 1, dispatchErrorCount: 0, jobs: [{ jobId: "not-a-uuid", outcome: "dispatched" }] },
    { workerId: "worker-east-1", claimedCount: 1, attemptedCount: 1, dispatchErrorCount: 0, jobs: [{ jobId: validJobId, outcome: "secret-detail" }] },
    { workerId: "worker-east-1", claimedCount: 1, attemptedCount: 1, dispatchErrorCount: 0, jobs: [{ jobId: validJobId, outcome: "dispatch_error" }] },
  ];
  for (const result of invalidResults) {
    const response = await makeHandler(async () => result)(authorized({}));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(JSON.stringify(payload).includes("secret-detail"), false);
    assert.equal(JSON.stringify(payload).includes("not-a-uuid"), false);
  }
});

test("requires dispatch error count to match per-job outcomes", async () => {
  const response = await makeHandler(async () => ({
    workerId: "worker-east-1",
    claimedCount: 1,
    attemptedCount: 1,
    dispatchErrorCount: 0,
    jobs: [{ jobId: validJobId, outcome: "dispatch_error" }],
  }))(authorized({}));
  assert.equal(response.status, 503);
});
