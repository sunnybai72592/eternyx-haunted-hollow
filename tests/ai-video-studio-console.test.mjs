import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/AIVideoStudio.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const arsenal = readFileSync("src/pages/AIArsenal.tsx", "utf8");

assert.match(page, /getAIJobStatus/);
assert.match(page, /requestAIJobCancellation/);
assert.match(page, /isTerminalAIJobStatus/);
assert.match(page, /provider_reconciliation_required/);
assert.match(page, /Generation is intentionally unavailable/);
assert.match(page, /does not submit prompts or make paid provider calls/);
assert.match(app, /path="\/ai-arsenal\/video"/);
assert.match(arsenal, /\/ai-arsenal\/video/);
console.log("AI Video Studio job console checks passed.");

assert.match(page, /setTimeout\(refreshStatus, 15_000\)/);
assert.match(page, /clearTimeout\(timeoutId\)/);
assert.match(page, /isTerminalAIJobStatus\(job.status\)/);
