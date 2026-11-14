import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("AI provider gateway keeps provider credentials server-side", async () => {
  const gateway = await read("supabase/functions/_shared/ai-provider.ts");
  assert.match(gateway, /Deno\.env\.get\("GROQ_API_KEY"\)/);
  assert.doesNotMatch(gateway, /import\.meta\.env|VITE_GROQ_API_KEY/);
  assert.ok(gateway.includes("Authorization: `Bearer ${apiKey}`"));
});

test("AI provider gateway preserves the existing Groq adapter and model default", async () => {
  const gateway = await read("supabase/functions/_shared/ai-provider.ts");
  assert.match(gateway, /id:\s*"groq"/);
  assert.match(gateway, /GROQ_MODEL/);
  assert.match(gateway, /openai\/gpt-oss-20b/);
  assert.match(gateway, /https:\/\/api\.groq\.com\/openai\/v1\/chat\/completions/);
});

test("AI provider gateway fails closed for unknown providers without fallback", async () => {
  const gateway = await read("supabase/functions/_shared/ai-provider.ts");
  assert.match(gateway, /AI_CHAT_PROVIDER/);
  assert.match(gateway, /if \(!provider\)/);
  assert.match(gateway, /configured AI provider is not supported/);
  assert.match(gateway, /no silent fallback/i);
});

test("AI provider errors distinguish retry-safe and uncertain failures", async () => {
  const gateway = await read("supabase/functions/_shared/ai-provider.ts");
  assert.match(gateway, /"network",\s*false/);
  assert.match(gateway, /"rate_limit",\s*true/);
  assert.match(gateway, /"provider_unavailable",\s*false/);
  assert.match(gateway, /"request_rejected",\s*true/);
  assert.match(gateway, /"invalid_response",\s*false/);
});

test("AI Chat uses the shared provider gateway after central credit enforcement", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  const consumeIndex = edge.indexOf("await consumeToolCredits(supabase");
  const providerIndex = edge.indexOf("await generateChatCompletion({ systemPrompt");
  assert.match(edge, /from "\.\.\/\_shared\/ai-provider\.ts"/);
  assert.ok(consumeIndex >= 0 && providerIndex > consumeIndex);
  assert.match(edge, /error instanceof AIProviderError && error\.safeToRefund/);
});
