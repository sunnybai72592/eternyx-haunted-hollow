import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20261115090000_private_ai_generation_outputs.sql", import.meta.url), "utf8");

test("output bucket is private and restricts stored MIME types", () => {
  assert.match(migration, /'ai-generation-outputs'[\s\S]*?false[\s\S]*?'video\/mp4'/);
  assert.match(migration, /'application\/pdf'/);
  assert.match(migration, /public = false/);
});

test("authenticated users can only read outputs in their own user/job namespace", () => {
  assert.match(migration, /FOR SELECT[\s\S]*?TO authenticated[\s\S]*?auth\.uid\(\)::text/);
  assert.match(migration, /output\[\.\]\(mp4\|webm\|jpg\|png\|webp/);
});

test("no browser write, update, delete, anonymous, or public policy is introduced", () => {
  assert.doesNotMatch(migration, /TO anon|TO public|FOR INSERT|FOR UPDATE|FOR DELETE|FOR ALL/i);
});

test("database constraint binds output key to the owning user and job", () => {
  assert.match(migration, /output_object_key ~ \([\s\S]*?user_id::text[\s\S]*?id::text[\s\S]*?output\[\.\]/);
});
