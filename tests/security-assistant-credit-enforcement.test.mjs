import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Security Assistant requires verified authentication before processing requests", async () => {
  const source = await read("supabase/functions/security-assistant/index.ts");
  const auth = await read("supabase/functions/_shared/user-auth.ts");
  assert.match(source, /authenticateUser\(req\)/);
  assert.match(source, /if \(!user \|\| !supabase\)/);
  assert.match(source, /Authentication required/);
  assert.match(auth, /supabase\.auth\.getUser\(match\[1\]\)/);
});

test("Security Assistant validates request UUID and bounds every message", async () => {
  const source = await read("supabase/functions/security-assistant/index.ts");
  const client = await read("src/pages/AIPoweredSecurity.tsx");
  assert.match(source, /requestId\?: unknown/);
  assert.match(source, /isUuid\(body\.requestId\)/);
  assert.match(source, /body\.messages\.length > 30/);
  assert.match(source, /item\.content\.length > 4000/);
  assert.match(client, /requestId:\s*crypto\.randomUUID\(\)/);
});

test("Security Assistant enforces its central entitlement before the paid provider call", async () => {
  const source = await read("supabase/functions/security-assistant/index.ts");
  const consumeIndex = source.indexOf("await consumeToolCredits(supabase");
  const providerIndex = source.indexOf("await requestAssistant(messages)");
  assert.ok(consumeIndex >= 0, "Expected central credit consumption");
  assert.ok(providerIndex > consumeIndex, "Credit enforcement must precede the provider call");
  assert.match(source, /featureKey:\s*"ai\.security-assistant"/);
  assert.match(source, /idempotencyKey:\s*body\.requestId/);
});

test("Security Assistant blocks duplicate requests and maps entitlement errors safely", async () => {
  const source = await read("supabase/functions/security-assistant/index.ts");
  assert.match(source, /if \(creditResult\.alreadyProcessed\)[\s\S]*?REQUEST_ALREADY_PROCESSED[\s\S]*?409/);
  assert.match(source, /error instanceof CreditOperationError/);
  assert.match(source, /CREDIT_SERVICE_UNAVAILABLE:\s*503/);
  assert.match(source, /Security Assistant is not currently available for this account/);
});

test("Security Assistant refunds only confirmed provider rejections", async () => {
  const source = await read("supabase/functions/security-assistant/index.ts");
  assert.match(source, /spendTransactionId && error instanceof SecurityAssistantProviderError && error\.safeToRefund/);
  assert.match(source, /refundToolCredits\(supabase/);
  assert.match(source, /network failure does not prove the upstream provider did not process/);
  assert.match(source, /Security assistant credit refund requires reconciliation/);
});
