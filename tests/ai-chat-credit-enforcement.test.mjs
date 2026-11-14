import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Eternyx AI Chat requires a client-generated request UUID", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  const ui = await read("src/pages/EternyxAI.tsx");
  assert.match(edge, /requestId\?: unknown/);
  assert.match(edge, /if \(!isUuid\(body\.requestId\)\)/);
  assert.match(ui, /requestId:\s*crypto\.randomUUID\(\)/);
});

test("AI Chat consumes the central ai.chat entitlement before calling the provider", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  const consumeIndex = edge.indexOf("await consumeToolCredits(supabase");
  const providerIndex = edge.indexOf("await generateChatCompletion({ systemPrompt");
  assert.ok(consumeIndex >= 0, "Expected central credit consumption");
  assert.ok(providerIndex > consumeIndex, "Credits must be checked before provider execution");
  assert.match(edge, /featureKey:\s*"ai\.chat"/);
  assert.match(edge, /idempotencyKey:\s*body\.requestId/);
});

test("duplicate AI Chat requests are rejected before another provider call", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  assert.match(edge, /if \(creditResult\.alreadyProcessed\)[\s\S]*?REQUEST_ALREADY_PROCESSED[\s\S]*?409/);
});

test("AI Chat refunds a charged request only when provider generation fails", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  const refundIndex = edge.indexOf("await refundToolCredits(supabase");
  const providerIndex = edge.indexOf("await generateChatCompletion({ systemPrompt");
  assert.ok(refundIndex > providerIndex, "Refund path must follow provider execution failure");
  assert.match(edge, /spendTransactionId\s*=\s*creditResult\.transactionId/);
  assert.match(edge, /if \(spendTransactionId && error instanceof AIProviderError && error\.safeToRefund\)/);
  assert.match(edge, /AI chat credit refund requires reconciliation/);
  const gateway = await read("supabase/functions/_shared/ai-provider.ts");
  assert.match(gateway, /AI provider network request failed[\s\S]*?"network",\s*false/);
});

test("AI Chat maps entitlement failures to safe client-facing errors", async () => {
  const edge = await read("supabase/functions/eternyx-ai-chat/index.ts");
  assert.match(edge, /error instanceof CreditOperationError/);
  assert.match(edge, /CREDIT_SERVICE_UNAVAILABLE:\s*503/);
  assert.match(edge, /AI chat is not currently available for this account/);
});
