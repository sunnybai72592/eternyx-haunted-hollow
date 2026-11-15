import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/ai/jobs.ts", import.meta.url), "utf8");

test("reserved AI jobs can transition to cancellation requested", () => {
  const reservedBlock = source.match(/reserved:\s*\[([\s\S]*?)\],\s*submitted:/);
  assert.ok(reservedBlock, "reserved transition policy should exist");
  assert.match(reservedBlock[1], /"cancel_requested"/);
});

test("cancellation status remains part of the shared AI job status contract", () => {
  assert.match(source, /"cancel_requested"/);
  assert.match(source, /export function canTransitionAIJob/);
});
