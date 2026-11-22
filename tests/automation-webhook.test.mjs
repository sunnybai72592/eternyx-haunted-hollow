import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  issueWebhookCredential, openWebhookCredential,
  signWebhookRequest, validateWebhookEnvelope, verifyWebhookRequest,
} from "../supabase/functions/_shared/automation-webhook-crypto.mjs";
import { parseAutomationControlRequest } from "../supabase/functions/_shared/automation-control-contract.mjs";

const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const master = "a".repeat(64);
const id = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const now = 1795360000;
const raw = JSON.stringify({ triggerId: id, input: " hello " });

test("issue 256-bit random credential, encrypt at rest and decrypt with correct key", async () => {
  const generated = await issueWebhookCredential(master);
  assert.match(generated.secret, /^[a-f0-9]{64}$/);
  assert.match(generated.credential_iv, /^[a-f0-9]{24}$/);
  assert.match(generated.credential_ciphertext, /^[a-f0-9]{96}$/);
  assert.ok(!generated.credential_ciphertext.includes(generated.secret));
  const restored = await openWebhookCredential(master, generated.credential_iv, generated.credential_ciphertext);
  assert.equal([...restored].map((b) => b.toString(16).padStart(2, "0")).join(""), generated.secret);
  const second = await issueWebhookCredential(master);
  assert.notEqual(generated.secret, second.secret);
});
test("rotated/master-key mismatch or corrupted ciphertext fails closed", async () => {
  const value = await issueWebhookCredential(master);
  await assert.rejects(openWebhookCredential("b".repeat(64), value.credential_iv, value.credential_ciphertext));
  await assert.rejects(openWebhookCredential(master, value.credential_iv, "f".repeat(96)));
  await assert.rejects(openWebhookCredential("not-a-key", value.credential_iv, value.credential_ciphertext));
});
test("valid signed payload verifies; every modified field fails HMAC", async () => {
  const value = await issueWebhookCredential(master);
  const bytes = await openWebhookCredential(master, value.credential_iv, value.credential_ciphertext);
  const timestamp = String(now);
  const signed = "sha256=" + await signWebhookRequest(value.secret, timestamp, requestId, raw);
  assert.equal(await verifyWebhookRequest(bytes, timestamp, requestId, raw, signed), true);
  assert.equal(await verifyWebhookRequest(bytes, timestamp, requestId, raw + " ", signed), false);
  assert.equal(await verifyWebhookRequest(bytes, timestamp, id, raw, signed), false);
  assert.equal(await verifyWebhookRequest(bytes, String(now + 1), requestId, raw, signed), false);
  assert.equal(await verifyWebhookRequest(bytes, timestamp, requestId, raw, "sha256=bad"), false);
});
test("signed envelope limits clock drift, payload, id format and hidden fields", () => {
  assert.equal(validateWebhookEnvelope(raw, String(now), requestId, now).ok, true);
  assert.equal(validateWebhookEnvelope(raw, String(now), requestId, now + 300).ok, true);
  assert.equal(validateWebhookEnvelope(raw, String(now), requestId, now + 301).ok, false);
  assert.equal(validateWebhookEnvelope(raw, String(now), requestId, now - 301).ok, false);
  assert.equal(validateWebhookEnvelope(raw, String(now), "not-uuid", now).ok, false);
  assert.equal(validateWebhookEnvelope(raw, "0", requestId, now).ok, false);
  assert.equal(validateWebhookEnvelope(JSON.stringify({ triggerId: id, input: "a", command: "whoami" }), String(now), requestId, now).ok, false);
  assert.equal(validateWebhookEnvelope(JSON.stringify({ triggerId: id, input: "x".repeat(12001) }), String(now), requestId, now).ok, false);
  assert.equal(validateWebhookEnvelope("not json", String(now), requestId, now).ok, false);
});
test("webhook lifecycle requires supported IDs and refuses schedules/unknown fields", () => {
  for (const action of ["webhooks", "createWebhook", "rotateWebhook", "toggleWebhook", "deleteWebhook"]) {
    const req = action === "webhooks" ? { action } :
      action === "createWebhook" ? { action, workflowId: id } :
      action === "toggleWebhook" ? { action, triggerId: id, enabled: false } :
      { action, triggerId: id };
    assert.equal(parseAutomationControlRequest(req).ok, true, action);
  }
  assert.equal(parseAutomationControlRequest({ action: "rotateWebhook", triggerId: "not-a-uuid" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "toggleWebhook", triggerId: id, enabled: "true" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "createWebhook", workflowId: id, url: "http://internal" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "webhook" }).ok, false);
  assert.equal(parseAutomationControlRequest({ action: "schedule" }).ok, false);
});
test("public webhook endpoint is HMAC-bound and never accepts unsigned browser identity", async () => {
  const handler = await read("supabase/functions/automation-webhook/index.ts");
  const config = await read("supabase/config.toml");
  const controller = await read("supabase/functions/automation-control/index.ts");
  const ui = await read("src/components/AutomationWebhookPanel.tsx");
  const cloud = await read("src/components/AutomationCloudPanel.tsx");
  assert.match(config, /\[functions\.automation-webhook\]\s+verify_jwt\s*=\s*false/);
  assert.match(handler, /verifyWebhookRequest\(secretBytes, timestamp, requestId, raw, signature\)/);
  assert.match(handler, /validateWebhookEnvelope\(raw, timestamp, requestId\)/);
  assert.match(handler, /runLocalWorkflow\(envelope\.input, workflow\.steps\)/);
  assert.match(handler, /automation_record_webhook_run/);
  assert.match(handler, /getSupabaseSecretKey\(\)/);
  assert.doesNotMatch(handler, /eval\s*\(|new Function|Deno\.run|Deno\.Command/);
  assert.match(controller, /authenticateUser\(req\)/);
  assert.match(controller, /issueWebhookCredential\(master\)/);
  assert.match(ui, /Create disabled trigger/);
  assert.match(ui, /Rotate key/);
  assert.match(cloud, /<AutomationWebhookPanel/);
});
test("SQL enforces encrypted credentials, owner-scoped grants and atomic run recording", async () => {
  const sql = await read("supabase/migrations/20261122230000_automation_signed_webhook_triggers.sql");
  assert.match(sql, /credential_ciphertext text NOT NULL/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.automation_webhook_triggers FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql, /credential_version=p_credential_version/);
  assert.match(sql, /automation_record_run\(/);
  assert.match(sql, /trigger_type='webhook'/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
});
