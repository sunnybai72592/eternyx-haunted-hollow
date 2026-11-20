import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = async file => readFile(new URL("../supabase/functions/_shared/" + file, import.meta.url), "utf8");
const convert = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const providerSource = await source("ai-generation-provider.ts");
const providerUrl = "data:text/javascript;base64," + Buffer.from(convert(providerSource)).toString("base64");
const adapterSource = (await source("ai-self-hosted-video-worker.ts"))
  .replace('"./ai-generation-provider.ts"', JSON.stringify(providerUrl));
const adapter = await import("data:text/javascript;base64," + Buffer.from(convert(adapterSource)).toString("base64"));
const config = (handler) => ({
  baseUrl: "https://gpu.example.com", hostname: "gpu.example.com",
  secret: "this-is-a-very-long-server-secret-2026",
  fetchImpl: handler,
});
const input = { payload: { featureKey: "ai.video.text_to_video", prompt: "Ocean" }, idempotencyKey: "job-2026-0001" };
test("submits a real HTTP request to trusted host without redirect or callback", async () => {
  const observed = [];
  const worker = adapter.createSelfHostedVideoWorkerAdapter(config(async (url, init) => {
    observed.push({ url, init });
    return new Response(JSON.stringify({ taskId: "task-123", state: "queued" }), { status: 202 });
  }));
  assert.deepEqual(await worker.submit(input), {
    outcome: "accepted", providerTaskId: "task-123", state: "queued",
  });
  assert.equal(observed[0].url, "https://gpu.example.com/v1/jobs");
  assert.equal(observed[0].init.redirect, "error");
  assert.match(observed[0].init.headers.Authorization, /^Bearer /);
  assert.equal(JSON.parse(observed[0].init.body).idempotencyKey, "job-2026-0001");
});
test("status and cancellation use validated task identifiers", async () => {
  const seen = [];
  const worker = adapter.createSelfHostedVideoWorkerAdapter(config(async (url, init) => {
    seen.push([url, init.method]);
    if (url.endsWith("/cancel")) return new Response('{"accepted":true}', { status: 200 });
    return new Response(JSON.stringify({
      taskId: "task-123", state: "succeeded", outputReference: "asset_123",
    }), { status: 200 });
  }));
  assert.equal((await worker.getStatus("task-123")).state, "succeeded");
  assert.equal(await worker.cancel("task-123"), "accepted");
  assert.deepEqual(seen, [
    ["https://gpu.example.com/v1/jobs/task-123", "GET"],
    ["https://gpu.example.com/v1/jobs/task-123/cancel", "POST"],
  ]);
  await assert.rejects(() => worker.getStatus("../admin"));
  await assert.rejects(() => worker.cancel("../admin"));
});
test("uncertain submit network failures do not trigger blind retry", async () => {
  let count = 0;
  const worker = adapter.createSelfHostedVideoWorkerAdapter(config(async () => {
    count++; throw new Error("timeout");
  }));
  assert.deepEqual(await worker.submit(input),
    { outcome: "uncertain", reason: "connection_lost" });
  assert.equal(count, 1);
});
test("invalid acknowledgement and unknown upstream status are uncertain", async () => {
  const invalid = adapter.createSelfHostedVideoWorkerAdapter(config(async () =>
    new Response('{"taskId":"../bad","state":"queued"}', { status: 202 })));
  assert.equal((await invalid.submit(input)).outcome, "uncertain");
  const serverError = adapter.createSelfHostedVideoWorkerAdapter(config(async () =>
    new Response("unavailable", { status: 503 })));
  assert.equal((await serverError.submit(input)).outcome, "uncertain");
});
test("rejects rogue host, missing secret, redirects, callbacks and oversized answers", async () => {
  for (const bad of [
    { baseUrl: "http://gpu.example.com" }, { baseUrl: "https://evil.example.com" },
    { baseUrl: "https://gpu.example.com/admin" }, { baseUrl: "https://gpu.example.com/?debug=1" },
    { secret: "short" }, { hostname: "localhost" },
  ]) assert.throws(() => adapter.createSelfHostedVideoWorkerAdapter({ ...config(async () => {}), ...bad }));
  const worker = adapter.createSelfHostedVideoWorkerAdapter(config(async () =>
    new Response("x".repeat(17000), { status: 202 })));
  assert.equal((await worker.submit(input)).outcome, "uncertain");
  await assert.rejects(() => worker.submit({ ...input, callbackUrl: "https://callback.example.com" }));
});
test("worker cannot claim success without output reference", async () => {
  const worker = adapter.createSelfHostedVideoWorkerAdapter(config(async () =>
    new Response('{"taskId":"task-123","state":"succeeded"}', { status: 200 })));
  await assert.rejects(() => worker.getStatus("task-123"));
});
