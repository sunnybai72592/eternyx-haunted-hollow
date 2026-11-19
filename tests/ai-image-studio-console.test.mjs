import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const page = await readFile(new URL("../src/pages/AIImageStudio.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const arsenal = await readFile(new URL("../src/pages/AIArsenal.tsx", import.meta.url), "utf8");
test("AI Image Studio is authenticated and uses shared job lifecycle controls", () => {
 assert.match(page, /getAIJobStatus/);
 assert.match(page, /requestAIJobCancellation/);
 assert.match(page, /isTerminalAIJobStatus/);
 assert.match(page, /featureKey\.startsWith\("ai\.image\."\)/);
 assert.match(page, /Generation remains unavailable/);
 assert.match(app, /path="\/ai-arsenal\/image"/);
 assert.match(app, /RequireAuth><AIImageStudio \/><\/RequireAuth>/);
 assert.match(arsenal, /\/ai-arsenal\/image/);
});
test("AI Image Studio polling stops for terminal and reconciliation-required jobs", () => {
 assert.match(page, /isTerminalAIJobStatus\(job\.status\)/);
 assert.match(page, /job\.status==="reconciliation_required"/);
 assert.match(page, /setTimeout\(refresh, 15_000\)/);
 assert.match(page, /clearTimeout\(timeoutId\)/);
});
test("AI Image Studio does not activate provider calls", () => {
 assert.match(page, /does not submit prompts or make paid provider calls/);
 assert.doesNotMatch(page, /supabase\.functions\.invoke\("ai-generation-job-enqueue"/);
});
