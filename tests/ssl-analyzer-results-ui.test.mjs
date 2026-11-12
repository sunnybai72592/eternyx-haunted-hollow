import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Cyber Arena renders structured SSL/TLS assessment evidence", async () => {
  const source = await readFile(new URL("../src/pages/CyberArena.tsx", import.meta.url), "utf8");

  assert.match(source, /activeTool === 'ssl-analyzer'/);
  assert.match(source, /scanResults\.ssl_result/);
  assert.match(source, /SSL Labs grade:/);
  assert.match(source, /Certificate evidence/);
  assert.match(source, /Assessed endpoints/);
  assert.match(source, /Protocol support/);
  assert.match(source, /Cipher suite evidence/);
  assert.match(source, /Security findings/);
  assert.match(source, /Coverage limitations/);
  assert.match(source, /value === true \? 'Yes' : value === false \? 'No' : 'Unknown'/);
  assert.match(source, /Source: \{scanResults\.source/);
});

test("SSL/TLS results keep unknown checks distinct from negative checks", async () => {
  const source = await readFile(new URL("../src/pages/CyberArena.tsx", import.meta.url), "utf8");

  assert.match(source, /value === true \? 'Yes'/);
  assert.match(source, /value === false \? 'No'/);
  assert.match(source, /: 'Unknown'/);
  assert.match(source, /certificate_chain_valid/);
});
