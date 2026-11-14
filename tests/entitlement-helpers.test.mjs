import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("shared entitlement helpers use only the three trusted ledger RPCs", async () => {
  const source = await read("supabase/functions/_shared/entitlements.ts");
  assert.match(source, /client\.rpc\(functionName, args\)/);
  assert.match(source, /"consume_tool_credits"/);
  assert.match(source, /"grant_tool_credits"/);
  assert.match(source, /"refund_tool_credits"/);
  assert.doesNotMatch(source, /serve\(/);
  assert.doesNotMatch(source, /Deno\.env/);
  assert.doesNotMatch(source, /createClient\(/);
});

test("shared entitlement helpers validate user, feature, idempotency, and grant inputs", async () => {
  const source = await read("supabase/functions/_shared/entitlements.ts");
  assert.match(source, /UUID_PATTERN/);
  assert.match(source, /FEATURE_KEY_PATTERN/);
  assert.match(source, /requireUuid\(input\.userId\)/);
  assert.match(source, /requireIdempotencyKey\(input\.idempotencyKey\)/);
  assert.match(source, /input\.credits < 1/);
  assert.match(source, /input\.credits > 100_000_000/);
});

test("shared entitlement helpers normalize RPC failures without exposing database messages", async () => {
  const source = await read("supabase/functions/_shared/entitlements.ts");
  for (const code of [
    "INSUFFICIENT_CREDITS",
    "FEATURE_NOT_ENTITLED",
    "SUBSCRIPTION_RECONCILIATION_REQUIRED",
    "SUBSCRIPTION_PLAN_UNRECOGNIZED",
    "CREDIT_SERVICE_UNAVAILABLE",
    "CREDIT_SERVICE_INVALID_RESPONSE",
  ]) {
    assert.ok(source.includes(code), "Expected safe error code " + code);
  }
  assert.match(source, /throw new CreditOperationError\("CREDIT_SERVICE_UNAVAILABLE"\)/);
});

test("shared helper responses validate balances and transaction identifiers", async () => {
  const source = await read("supabase/functions/_shared/entitlements.ts");
  assert.match(source, /Number\.isInteger\(data\.balance\)/);
  assert.match(source, /data\.allowed !== true/);
  assert.match(source, /typeof data\.transaction_id !== "string"/);
  assert.match(source, /data\.already_refunded/);
  assert.match(source, /creditsCharged/);
  assert.match(source, /creditsGranted/);
  assert.match(source, /creditsRefunded/);
});
