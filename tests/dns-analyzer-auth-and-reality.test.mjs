import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("DNS analyzer requires a verified user session", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /req\.method !== 'POST'/);
  assert.match(source, /authorization\?\.startsWith\('Bearer '\)/);
  assert.match(source, /supabaseClient\.auth\.getUser\(\)/);
  assert.match(source, /const user_id = user\.id/);
  assert.doesNotMatch(source, /const \{ domain, user_id \}: DNSAnalysisRequest/);
});

test("DNS analyzer validates and normalizes public domain input", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /domain\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /const domainRegex = \/\^\(\?=\.\{1,253\}\$\)/);
  assert.match(source, /Enter a valid public domain name/);
});

test("DNS analyzer uses live DNS-over-HTTPS queries without simulated findings", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /cloudflare-dns\.com\/dns-query/);
  assert.doesNotMatch(source, /Math\.random|testZoneTransfer|testCachePoisoning|hasZoneTransferVuln/);
});

test("DNS analyzer discloses checks outside its actual coverage", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /DNS zone transfers \(AXFR\) are not tested/);
  assert.match(source, /DNS cache-poisoning resistance is not tested/);
  assert.match(source, /default\._domainkey selector/);
  assert.match(source, /not a full DNSSEC validation/);
  assert.match(source, /coverage_limitations: coverageLimitations/);
  assert.doesNotMatch(source, /confidence_score: 0\.95/);
});
