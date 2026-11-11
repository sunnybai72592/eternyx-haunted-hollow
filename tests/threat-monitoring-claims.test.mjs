import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public threat monitoring page describes only implemented platform telemetry", async () => {
  const page = await read("src/pages/ThreatMonitoring.tsx");

  assert.match(page, /selected security events at trusted backend authorization boundaries/);
  assert.match(page, /not a managed 24\\/7 security operations center/);
  assert.match(page, /does not monitor customer infrastructure/);
  assert.match(page, /verified authorization mismatches in AI chat and document processing/);
  assert.match(page, /\\/admin\\/security/);
  assert.doesNotMatch(page, /setInterval|Math\\.random|Simulated event|Global Threat Map|Average Response Time/);
});

test("security service listings do not advertise unsupported 24/7 monitoring", async () => {
  const servicesHub = await read("src/pages/ServicesHub.tsx");
  const services = await read("src/pages/Services.tsx");
  const cybersecurityHub = await read("src/pages/CybersecurityHub.tsx");

  for (const source of [servicesHub, services, cybersecurityHub]) {
    assert.doesNotMatch(source, /24\\/7 Threat Monitoring|Round-the-clock security operations center|instant threat response/i);
  }

  assert.match(servicesHub, /Platform Security Monitoring/);
  assert.match(services, /Verified authorization event capture/);
  assert.match(cybersecurityHub, /No invented scan results, fictional incidents, or unsupported security guarantees/);
});

test("security service page avoids unsupported certification and SOC claims", async () => {
  const services = await read("src/pages/Services.tsx");

  assert.doesNotMatch(services, /ISO 27001 Certified|SOC 2 Compliant|24\\/7 Support|Fortune 500 companies/i);
});
