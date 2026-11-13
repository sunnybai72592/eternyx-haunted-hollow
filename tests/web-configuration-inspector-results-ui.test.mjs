import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Cyber Arena renders structured Web Configuration Inspector evidence", async () => {
  const source = await readFile(new URL("../src/pages/CyberArena.tsx", import.meta.url), "utf8");

  assert.match(source, /activeTool === 'web-scanner'/);
  assert.match(source, /Array\.isArray\(scanResults\.findings\)/);
  assert.match(source, /Configuration findings/);
  assert.match(source, /HTTP \{scanResults\.http_status/);
  assert.match(source, /OWASP: \{finding\.owasp_category\}/);
  assert.match(source, /Coverage limitations/);
  assert.match(source, /Risk score: not scored/);
});

test("Web Configuration Inspector UI accurately describes its passive scope", async () => {
  const source = await readFile(new URL("../src/pages/CyberArena.tsx", import.meta.url), "utf8");

  assert.match(source, /single-request passive HTTP configuration inspection, not a penetration test/);
  assert.match(source, /No exploit payloads, form submissions, crawling, or vulnerability probes were performed/);
  assert.match(source, /does not establish that the application is vulnerability-free/);
  assert.match(source, /does not follow redirects or test application behavior/);
});
