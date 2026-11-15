import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115050000_private_ai_generation_input_assets.sql", import.meta.url), "utf8");

test("AI generation source assets use a private bucket with strict upload limits", () => {
  assert.match(migration, /'ai-generation-inputs'[\s\S]*?false[\s\S]*?10485760/);
  assert.match(migration, /'image\/jpeg', 'image\/png', 'image\/webp'/);
});

test("authenticated users can upload only into their own UUID-scoped source folder", () => {
  assert.match(migration, /FOR INSERT[\s\S]*?TO authenticated[\s\S]*?auth\.uid\(\)::text/);
  assert.match(migration, /source\\\.\(jpg\|jpeg\|png\|webp\)/);
});

test("reads and deletes are owner-scoped and bucket-specific", () => {
  for (const operation of ["SELECT", "DELETE"]) {
    const policy = new RegExp(`FOR ${operation}[\\s\\S]*?bucket_id = 'ai-generation-inputs'[\\s\\S]*?auth\\.uid\\(\\)::text`);
    assert.match(migration, policy);
  }
});

test("migration does not expose public or anonymous access or permit overwrites", () => {
  assert.match(migration, /public = false/);
  assert.doesNotMatch(migration, /TO anon|TO public|FOR UPDATE|FOR ALL/i);
});
