import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("passive subdomain discovery requires a verified user session", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /req\.method !== "POST"/);
  assert.match(source, /authorization\?\.startsWith\("Bearer "\)/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /if \(authError \|\| !user\)/);
});

test("passive subdomain discovery validates a public root domain", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /body\.domain/);
  assert.match(source, /domain\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /const domainRegex = \/\^\(\?=\.\{1,253\}\$\)/);
  assert.match(source, /Enter a valid public root domain name/);
});

test("subdomain discovery uses Certificate Transparency and clearly labels passive evidence", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /https:\/\/crt\.sh\//);
  assert.match(source, /Certificate Transparency \(crt\.sh\)/);
  assert.match(source, /historical names/);
  assert.match(source, /not active DNS enumeration/);
  assert.match(source, /No ports are probed/);
  assert.doesNotMatch(source, /nmap|masscan|Deno\.connect|Deno\.listen/);
});

test("Certificate Transparency requests have a timeout and bounded response", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /CT_TIMEOUT_MS = 10000/);
  assert.match(source, /CT_RESPONSE_LIMIT_BYTES = 1024 \* 1024/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), CT_TIMEOUT_MS\)/);
  assert.match(source, /readLimitedResponseText\(response, CT_RESPONSE_LIMIT_BYTES\)/);
  assert.match(source, /total > limit/);
  assert.match(source, /clearTimeout\(timeout\)/);
});

test("subdomain results are restricted to the requested domain and bounded", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /MAX_CERTIFICATE_ROWS = 5000/);
  assert.match(source, /MAX_SUBDOMAINS = 250/);
  assert.match(source, /hostname\.endsWith/);
  assert.match(source, /hostname !== domain/);
  assert.match(source, /records\.slice\(0, MAX_CERTIFICATE_ROWS\)/);
  assert.match(source, /\.slice\(0, MAX_SUBDOMAINS\)/);
  assert.match(source, /results_truncated/);
});

test("Cyber Arena exposes and invokes the real passive subdomain discovery function", async () => {
  const source = await read("src/pages/CyberArena.tsx");
  assert.match(source, /id: 'subdomain-discovery'/);
  assert.match(source, /functionName = 'subdomain-discovery'/);
  assert.match(source, /payload\.domain = input/);
  assert.match(source, /Passive Subdomain Discovery/);
});


test("DNS verification uses Cloudflare DoH with bounded time and response size", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /DNS_TIMEOUT_MS = 5000/);
  assert.match(source, /DNS_RESPONSE_LIMIT_BYTES = 16 \* 1024/);
  assert.match(source, /cloudflare-dns\.com\/dns-query/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /readLimitedResponseText\(response, DNS_RESPONSE_LIMIT_BYTES\)/);
});

test("DNS verification is bounded by hostname count and concurrency", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /MAX_DNS_VERIFICATIONS = 100/);
  assert.match(source, /DNS_CONCURRENCY = 5/);
  assert.match(source, /subdomains\.slice\(0, MAX_DNS_VERIFICATIONS\)/);
  assert.match(source, /Math\.min\(DNS_CONCURRENCY, verificationTargets\.length\)/);
  assert.match(source, /not_checked_limit/);
});

test("DNS verification distinguishes resolved, no-address, and inconclusive results", async () => {
  const source = await read("supabase/functions/subdomain-discovery/index.ts");
  assert.match(source, /"resolved"/);
  assert.match(source, /"no_address_records"/);
  assert.match(source, /"inconclusive"/);
  assert.match(source, /verification_complete: verificationComplete/);
  assert.match(source, /A or AAAA address answer is observed/);
});
