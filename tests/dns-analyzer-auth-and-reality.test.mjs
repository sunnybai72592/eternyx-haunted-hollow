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
  assert.match(source, /if \(!response\.ok\) \{[\s\S]*?DNS provider returned HTTP/);
  assert.match(source, /data\.Status !== 0 && data\.Status !== 3/);
  assert.doesNotMatch(source, /Math\.random|testZoneTransfer|testCachePoisoning|hasZoneTransferVuln/);
});

test("DNS analyzer discloses checks outside its actual coverage", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /DNS zone transfers \(AXFR\) are not tested/);
  assert.match(source, /DNS cache-poisoning resistance is not tested/);
  assert.match(source, /default\._domainkey selector/);
  assert.match(source, /not a full DNSSEC validation/);
  assert.match(source, /ds_record_present: false/);
  assert.match(source, /default_dkim_selector_found: false/);
  assert.match(source, /No issues were detected by the checks completed/);
  assert.match(source, /coverage_limitations: coverageLimitations/);
  assert.doesNotMatch(source, /confidence_score: 0\.95/);
});


test("DNS-over-HTTPS requests have a timeout and bounded response size", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /const DOH_TIMEOUT_MS = 5000/);
  assert.match(source, /const DOH_RESPONSE_LIMIT_BYTES = 128 \* 1024/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.signal/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), DOH_TIMEOUT_MS\)/);
  assert.match(source, /readLimitedResponseText\(response, DOH_RESPONSE_LIMIT_BYTES\)/);
  assert.match(source, /total > limit/);
  assert.match(source, /\.slice\(0, 100\)/);
});

test("DNS analyzer does not return upstream exception details to callers", async () => {
  const source = await read("supabase/functions/dns-analyzer/index.ts");

  assert.match(source, /DNS analysis could not be completed/);
  assert.doesNotMatch(source, /details:\\s*errorMessage/);
});


test("Cyber Arena renders DNS analyzer findings, records, recommendations, and coverage", async () => {
  const source = await read("src/pages/CyberArena.tsx");

  assert.match(source, /activeTool === 'dns-analyzer'/);
  assert.match(source, /Security findings/);
  assert.match(source, /DNS records/);
  assert.match(source, /Risk score:/);
  assert.match(source, /Observed security configuration/);
  assert.match(source, /Coverage limitations/);
  assert.match(source, /Remediation:/);
  assert.match(source, /scanResults\.recommendations/);
});
