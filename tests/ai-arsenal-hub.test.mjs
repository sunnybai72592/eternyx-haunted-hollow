import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AI Arsenal route opens a dedicated hub and preserves the six-pillar map", async () => {
  const app = await read("src/App.tsx");
  const ecosystem = await read("src/data/ecosystem.ts");
  const page = await read("src/pages/AIArsenal.tsx");

  assert.match(app, /const AIArsenal = lazy\(\(\) => import\("\.\/pages\/AIArsenal"\)\)/);
  assert.match(app, /<Route path="\/ai-arsenal" element={<AIArsenal \/>} \/>/);
  assert.match(ecosystem, /id: "ai-arsenal"[\s\S]*?status: "Existing foundation"/);
  assert.match(page, /ETERNYX AI & Document Workspace/);
  assert.match(page, /to="\/eternyx-ai"/);
  assert.match(page, /AI Video Creation/);
  assert.match(page, /No video is generated yet/);
  assert.match(page, /central credit system/);
  assert.doesNotMatch(page, /mock generation|sample video|fake progress/i);
});
