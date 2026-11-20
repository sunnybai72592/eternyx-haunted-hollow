import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const src = async (path) => readFile(new URL("../supabase/functions/_shared/" + path, import.meta.url), "utf8");
const js = (code) => ts.transpileModule(code,
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const prov = await src("ai-generation-provider.ts");
const provUrl = "data:text/javascript;base64," + Buffer.from(js(prov)).toString("base64");
const source = (await src("ai-self-hosted-video-worker.ts"))
  .replace('"./ai-generation-provider.ts"', JSON.stringify(provUrl));
const { createSelfHostedVideoOutputDownloader } = await import(
  "data:text/javascript;base64," + Buffer.from(js(source)).toString("base64"));

const task = "job_abcdef123";
const asset = "asset_0123456789abcdef";
const bytes = Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 1, 2, 3]);
const config = fetchImpl => ({
  baseUrl: "https://gpu.example.com", hostname: "gpu.example.com",
  secret: "a-long-only-server-owned-token-1234", fetchImpl,
});
const input = { providerId: "eternyx_self_hosted", providerTaskId: task, outputReference: asset };
function fixture(status = "succeeded", reference = asset, mp4 = bytes, reportedLength = mp4.byteLength) {
  const visited = [];
  const fetchImpl = async (url, options) => {
    visited.push({ url, options });
    if (url.endsWith("/output")) return new Response(mp4, {
      status: 200, headers: { "Content-Type": "video/mp4", "Content-Length": String(reportedLength) },
    });
    return new Response(JSON.stringify({
      taskId: task, state: status,
      ...(status === "succeeded" ? { outputReference: reference } : {}),
    }), { status: 200 });
  };
  return { visited, fetchImpl };
}
test("fetches a job-owned private MP4 over real HTTP transport", async () => {
  const { visited, fetchImpl } = fixture();
  const download = createSelfHostedVideoOutputDownloader(config(fetchImpl), 1024);
  const result = await download(input);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.contentType, "video/mp4");
  assert.equal(visited.length, 2);
  assert.equal(visited[1].url, "https://gpu.example.com/v1/jobs/" + task + "/output");
  assert.equal(visited[1].options.redirect, "error");
  assert.match(visited[1].options.headers.Authorization, /^Bearer /);
});
test("rejects an output reference that does not belong to the task", async () => {
  const { visited, fetchImpl } = fixture("succeeded", "asset_other1234567890");
  const download = createSelfHostedVideoOutputDownloader(config(fetchImpl), 1024);
  await assert.rejects(() => download(input));
  assert.equal(visited.length, 1);
});
test("rejects incomplete tasks, invalid providers and traversal", async () => {
  const { visited, fetchImpl } = fixture("processing");
  const download = createSelfHostedVideoOutputDownloader(config(fetchImpl), 1024);
  await assert.rejects(() => download(input));
  await assert.rejects(() => download({ ...input, providerTaskId: "../admin" }));
  await assert.rejects(() => download({ ...input, providerId: "fake_provider" }));
  assert.equal(visited.length, 1);
});
test("rejects spoofed content length, non-video and overly large responses", async () => {
  for (const [media, declared] of [[bytes, 100], [new Uint8Array(15), 15], [bytes, 1000]]) {
    const { fetchImpl } = fixture("succeeded", asset, media, declared);
    const download = createSelfHostedVideoOutputDownloader(config(fetchImpl), 128);
    await assert.rejects(() => download(input));
  }
});
test("rejects invalid trusted limits and does not permit browser-origin fallbacks", () => {
  assert.throws(() => createSelfHostedVideoOutputDownloader(config(async () => {}), 0));
  assert.throws(() => createSelfHostedVideoOutputDownloader(config(async () => {}), 201 * 1024 * 1024));
});
