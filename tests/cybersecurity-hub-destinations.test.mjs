import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Cybersecurity Hub presents six distinct security domains", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");

  assert.match(hub, /Six connected security domains/);
  assert.equal((hub.match(/number: "0[1-6]"/g) || []).length, 6);
  assert.doesNotMatch(hub, /href: "\/tools"|to="\/tools"/);
});

test("Cybersecurity Hub destinations use implemented application routes", async () => {
  const [hub, app] = await Promise.all([
    read("src/pages/CybersecurityHub.tsx"),
    read("src/App.tsx"),
  ]);
  const hrefs = [...hub.matchAll(/href: "(\/[^"]+)"/g)].map((match) => match[1]);
  const links = [...hub.matchAll(/to="(\/[^"]+)"/g)].map((match) => match[1]);
  const destinations = [...new Set([...hrefs, ...links])];

  for (const destination of destinations) {
    assert.match(app, new RegExp(`path="${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`), `Missing route: ${destination}`);
  }
});

test("Cybersecurity Hub communicates genuine results and responsible testing", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");

  assert.match(hub, /No invented scan results/);
  assert.match(hub, /explicitly authorized to assess/);
  assert.match(hub, /checks it does not perform/);
});

test("Cybersecurity Hub exposes keyboard focus and accessible search", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");

  assert.match(hub, /aria-label="Search cybersecurity domains and tools"/);
  assert.match(hub, /focus-visible:ring-2/);
});
