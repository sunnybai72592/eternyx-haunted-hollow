import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI chat requires a verified caller identity", async () => {
  const [chat, auth] = await Promise.all([
    read("supabase/functions/eternyx-ai-chat/index.ts"),
    read("supabase/functions/_shared/user-auth.ts"),
  ]);

  assert.match(chat, /authenticateUser\(req\)/);
  assert.match(chat, /Authentication required/);
  assert.match(auth, /supabase\.auth\.getUser\(match\[1\]\)/);
  assert.match(auth, /Authorization/);
  assert.doesNotMatch(chat, /const\s+\{\s*message,\s*sessionId,\s*documentId,\s*userId\s*\}\s*=\s*body/);
});

test("AI chat scopes documents, sessions, and history to the authenticated user", async () => {
  const chat = await read("supabase/functions/eternyx-ai-chat/index.ts");

  assert.match(chat, /\.eq\("user_id", user\.id\)/g);
  assert.match(chat, /\.eq\("session_id", sessionId\)/);
  assert.match(chat, /\.eq\("document_id", documentId\)/);
  assert.match(chat, /Conversation is linked to a different document/);
});

test("document processing derives storage metadata from an owned document record", async () => {
  const processor = await read("supabase/functions/process-document/index.ts");

  assert.match(processor, /authenticateUser\(req\)/);
  assert.match(processor, /\.eq\("id", body\.documentId\)/);
  assert.match(processor, /\.eq\("user_id", user\.id\)/);
  assert.match(processor, /download\(document\.storage_path\)/);
  assert.match(processor, /const fileType = document\.file_type/);
  assert.match(processor, /const mimeType = document\.mime_type/);
  assert.doesNotMatch(processor, /download\(body\.storagePath\)/);
});

test("document chunking has a terminating final-chunk condition", async () => {
  const processor = await read("supabase/functions/process-document/index.ts");

  assert.match(processor, /if \(end === text\.length\) break/);
  assert.match(processor, /overlap >= chunkSize/);
  assert.match(processor, /start = end - overlap/);
});


test("NVD CVE research bounds the upstream request and response body", async () => {
  const source = await read("supabase/functions/vulnerability-scanner/index.ts");

  assert.match(source, /const NVD_TIMEOUT_MS = 12000/);
  assert.match(source, /const NVD_RESPONSE_LIMIT_BYTES = 2 \* 1024 \* 1024/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), NVD_TIMEOUT_MS\)/);
  assert.match(source, /readLimitedResponseText\(nvdResponse, NVD_RESPONSE_LIMIT_BYTES\)/);
  assert.match(source, /total > limit/);
  assert.match(source, /nvdData\.vulnerabilities\.slice\(0, 20\)/);
  assert.match(source, /output\.length >= 30/);
});

test("NVD CVE research validates and bounds provider-supplied fields", async () => {
  const source = await read("supabase/functions/vulnerability-scanner/index.ts");

  assert.match(source, /description: String\(english \?\?[^\n]+\.slice\(0, 4000\)/);
  assert.match(source, /reference\.url\.startsWith\("https:\/\/"\)/);
  assert.match(source, /reference\.url\.slice\(0, 2048\)/);
  assert.match(source, /tags\.filter\(\(tag: any\) => typeof tag === "string"\)/);
  assert.match(source, /NVD returned an invalid response/);
  assert.match(source, /CVE research could not be completed/);
  assert.doesNotMatch(source, /const safeMessage = error instanceof Error\s*\?\s*error\.message/);
});
