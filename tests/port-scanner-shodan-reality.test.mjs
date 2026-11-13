import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("port lookup requires a verified user and a server-side Shodan key", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");
  assert.match(source, /req\.method !== 'POST'/);
  assert.match(source, /authorization\?\.startsWith\('Bearer '\)/);
  assert.match(source, /supabaseClient\.auth\.getUser\(\)/);
  assert.match(source, /const shodanApiKey = Deno\.env\.get\('SHODAN_API_KEY'\)/);
  assert.match(source, /SHODAN_NOT_CONFIGURED/);
  assert.match(source, /user_id: user\.id/);
  assert.doesNotMatch(source, /user_id: string/);
});

test("port lookup accepts only public IPv4 and validates optional port filters", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");
  assert.match(source, /function isPublicIPv4\(value: string\)/);
  assert.match(source, /a === 10/);
  assert.match(source, /a === 127/);
  assert.match(source, /a === 169 && b === 254/);
  assert.match(source, /a === 192 && b === 168/);
  assert.match(source, /Number\.isInteger\(port\)/);
  assert.match(source, /requestedPorts\.length > 100/);
});

test("port lookup reports only Shodan observations, never guessed closed/open states", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");
  assert.match(source, /api\.shodan\.io\/shodan\/host/);
  assert.match(source, /state: 'observed_open'/);
  assert.match(source, /Ports absent from Shodan data are unknown, not closed/);
  assert.doesNotMatch(source, /simulateTCPConnection|checkPort\(|status: 'closed'|status: 'open'/);
});

test("Cyber Arena and tool catalog describe passive Shodan lookup honestly", async () => {
  const arena = await read("src/pages/CyberArena.tsx");
  const catalog = await read("src/data/allTools.ts");
  const securityCatalog = await read("src/data/cybersecurityTools.ts");
  for (const source of [arena, catalog, securityCatalog]) {
    assert.match(source, /Shodan Host Exposure Lookup/);
    assert.match(source, /not a live port scan/);
    assert.doesNotMatch(source, /High-speed stealth port scanning with evasion techniques/);
  }
  assert.match(arena, /delete payload\.user_id/);
});


test("Shodan lookup keeps its timeout active through a bounded response read", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");
  assert.match(source, /const SHODAN_TIMEOUT_MS = 12000/);
  assert.match(source, /const SHODAN_RESPONSE_LIMIT_BYTES = 1024 \* 1024/);
  assert.match(source, /setTimeout\(\(\) => controller\.abort\(\), SHODAN_TIMEOUT_MS\)/);
  assert.match(source, /readLimitedResponseText\(providerResponse, SHODAN_RESPONSE_LIMIT_BYTES\)/);
  assert.match(source, /total > limit/);
  assert.match(source, /clearTimeout\(timeout\)/);
});

test("Shodan provider data is validated and bounded before storage and response", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");
  assert.match(source, /JSON\.parse\(providerResponseText \?\? ''\)/);
  assert.match(source, /MAX_OBSERVED_PORTS = 1000/);
  assert.match(source, /\.slice\(0, MAX_OBSERVED_PORTS\)/);
  assert.match(source, /boundedString\(service\?\.banner, 200\)/);
  assert.match(source, /\.slice\(0, 100\)\.map\(item => item\.slice\(0, 100\)\)/);
  assert.match(source, /Shodan returned an invalid response/);
});


test("Shodan lookup bounds request bodies before JSON parsing", async () => {
  const source = await read("supabase/functions/port-scanner/index.ts");

  assert.match(source, /const REQUEST_BODY_LIMIT_BYTES = 4 \* 1024/);
  assert.match(source, /readLimitedRequestText\(req, REQUEST_BODY_LIMIT_BYTES\)/);
  assert.match(source, /declaredLength > REQUEST_BODY_LIMIT_BYTES/);
  assert.match(source, /total > limit/);
  assert.match(source, /await reader\.cancel\(\)/);
  assert.match(source, /JSON\.parse\(rawBody\)/);
  assert.match(source, /Request body must be a JSON object/);
  assert.doesNotMatch(source, /await req\.json\(\)/);
});
