import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115060000_ai_generation_input_asset_registry.sql", import.meta.url), "utf8");
const upload = await readFile(new URL("../supabase/functions/ai-generation-input-upload-url/index.ts", import.meta.url), "utf8");
const verify = await readFile(new URL("../supabase/functions/ai-generation-input-verify/index.ts", import.meta.url), "utf8");

test("asset registry is server-owned and has constrained lifecycle and ownership", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REFERENCES auth\.users\(id\)/);
  assert.match(migration, /CHECK \(status IN \('pending', 'ready', 'rejected'\)\)/);
  assert.match(migration, /Deliberately no client policies/);
});

test("upload URL creation persists a pending asset with a server-generated owner path", () => {
  assert.match(upload, /authenticateUser\(req\)/);
  assert.match(upload, /user_id: user\.id/);
  assert.match(upload, /object_path: objectPath/);
  assert.match(upload, /status: "pending"/);
  assert.match(upload, /createSignedUploadUrl\(objectPath, \{ upsert: false \}\)/);
});

test("verification derives ownership from auth and accepts only an asset UUID", () => {
  assert.match(verify, /authenticateUser\(req\)/);
  assert.match(verify, /\.eq\("user_id", user\.id\)/);
  assert.match(verify, /Object\.keys\(body\)\.some\(\(key\) => key !== "assetId"\)/);
  assert.doesNotMatch(verify, /body\.(userId|path|bucket|objectPath)/);
});

test("verification checks actual JPEG, PNG, and WebP file signatures and exact size", () => {
  assert.match(verify, /"image\/jpeg"/);
  assert.match(verify, /"image\/png"/);
  assert.match(verify, /"image\/webp"/);
  assert.match(verify, /file\.size !== asset\.declared_size/);
  assert.match(verify, /file\.arrayBuffer\(\)/);
});

test("only verified pending assets transition to ready; rejected files are removed", () => {
  assert.match(verify, /status: "ready"/);
  assert.match(verify, /\.eq\("status", "pending"\)/);
  assert.match(verify, /status: "rejected"/);
  assert.match(verify, /\.remove\(\[asset\.object_path\]\)/);
  assert.doesNotMatch(verify, /create_ai_generation_job|ai_generation_jobs|fetch\(/);
});
