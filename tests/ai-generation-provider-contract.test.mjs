import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("async generation contract defines submit, status, cancellation and normalized states", async () => {
  const source = await read("supabase/functions/_shared/ai-generation-provider.ts");
  for (const value of ["submit(input:", "getStatus(providerTaskId:", "cancel(providerTaskId:",
    '"queued"', '"processing"', '"succeeded"', '"failed"', '"cancelled"']) {
    assert.ok(source.includes(value), `missing contract element: ${value}`);
  }
});

test("no generation provider or adapter is activated by this foundation", async () => {
  const source = await read("supabase/functions/_shared/ai-generation-provider.ts");
  assert.match(source, /AI_GENERATION_PROVIDERS:[\s\S]*?= \[\]/);
  assert.match(source, /const adapters:[\s\S]*?= Object\.freeze\(\{\}\)/);
  assert.match(source, /if \(!adapter \|\| adapter\.providerId !== providerId\)/);
  assert.doesNotMatch(source, /fetch\(|Deno\.env\.get|GROQ_API_KEY/);
});

test("submission uncertainty is explicit and cannot be mistaken for accepted work", async () => {
  const source = await read("supabase/functions/_shared/ai-generation-provider.ts");
  assert.match(source, /outcome: "uncertain"/);
  assert.match(source, /Never blindly resubmit it/);
  assert.match(source, /network_uncertain/);
  assert.match(source, /safeToRetrySubmission/);
});

test("provider and model must both be enabled and support the requested capability", async () => {
  const source = await read("supabase/functions/_shared/ai-generation-provider.ts");
  assert.match(source, /!provider\?\.enabled \|\| !model\?\.enabled/);
  assert.match(source, /!provider\.capabilities\.includes\(capability\)/);
  assert.match(source, /!model\.capabilities\.includes\(capability\)/);
});

test("provider submission and status payloads are validated", async () => {
  const source = await read("supabase/functions/_shared/ai-generation-provider.ts");
  assert.match(source, /byteLength > 65536/);
  assert.match(source, /isHttpsUrl\(input\.callbackUrl\)/);
  assert.match(source, /progressPercent > 100/);
  assert.match(source, /snapshot\.state === "succeeded" && !snapshot\.outputReference/);
  assert.match(source, /snapshot\.state === "failed" && !snapshot\.failureCode/);
});
