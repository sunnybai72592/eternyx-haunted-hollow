import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("authorization event writer is server-only and uses an allowlisted payload", async () => {
  const writer = await read("supabase/functions/_shared/security-events.ts");

  assert.match(writer, /getSupabaseSecretKey\(\)/);
  assert.match(writer, /SUPABASE_URL/);
  assert.match(writer, /event_type: "edge_authorization_rejected"/);
  assert.match(writer, /actor_user_id: input\.actorUserId/);
  assert.doesNotMatch(writer, /req\.headers|get\(["']x-forwarded-for|Authorization:|access_token|document_content/i);
  assert.match(writer, /Monitoring must never break/);
});

test("only verified AI chat authorization mismatches are recorded", async () => {
  const chat = await read("supabase/functions/eternyx-ai-chat/index.ts");

  const authIndex = chat.indexOf("authenticateUser(req)");
  const mismatchIndex = chat.indexOf('reason: "request_user_id_mismatch"');
  assert.ok(authIndex >= 0 && mismatchIndex > authIndex);
  assert.match(chat, /reason: "conversation_document_mismatch"/);
});

test("document storage-reference mismatches are recorded after user authentication", async () => {
  const processor = await read("supabase/functions/process-document/index.ts");

  const authIndex = processor.indexOf("authenticateUser(req)");
  const mismatchIndex = processor.indexOf('reason: "document_storage_reference_mismatch"');
  assert.ok(authIndex >= 0 && mismatchIndex > authIndex);
  assert.match(processor, /recordAuthorizationEvent/);
});
