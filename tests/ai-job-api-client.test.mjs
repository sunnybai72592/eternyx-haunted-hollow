import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/ai/job-api.ts", import.meta.url), "utf8");

test("AI job API uses authenticated Supabase Edge Function invocation", () => {
  assert.match(source, /supabase\.functions\.invoke\("ai-generation-job-status"/);
  assert.match(source, /supabase\.functions\.invoke\("ai-generation-job-cancel"/);
});

test("AI job API validates identifiers and server response shapes", () => {
  assert.match(source, /UUID_PATTERN/);
  assert.match(source, /parseStatusResponse/);
  assert.match(source, /isJobStatus/);
  assert.match(source, /attemptCount/);
  assert.match(source, /provider_reconciliation_required/);
});

test("AI job API maps service failures to safe user-facing errors", () => {
  assert.match(source, /unauthenticated/);
  assert.match(source, /not_found/);
  assert.match(source, /conflict/);
  assert.match(source, /temporarily unavailable/);
});
