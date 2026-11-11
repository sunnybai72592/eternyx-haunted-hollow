import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public threat monitoring page describes only implemented platform telemetry", async () => {
  const page = await read("src/pages/ThreatMonitoring.tsx");

  assert.ok(page.includes("selected security events at trusted backend authorization boundaries"));
  assert.ok(page.includes("not a managed 24/7 security operations center"));
  assert.ok(page.includes("does not monitor customer infrastructure"));
  assert.ok(page.includes("verified authorization mismatches in AI chat and document processing"));
  assert.ok(page.includes("/admin/security"));
  assert.doesNotMatch(page, /setInterval|Math\.random|Simulated event|Global Threat Map|Average Response Time/);
});

test("security service listings do not advertise unsupported 24/7 monitoring", async () => {
  const servicesHub = await read("src/pages/ServicesHub.tsx");
  const services = await read("src/pages/Services.tsx");
  const cybersecurityHub = await read("src/pages/CybersecurityHub.tsx");

  for (const source of [servicesHub, services, cybersecurityHub]) {
    assert.ok(!source.includes("24/7 Threat Monitoring"));
    assert.ok(!source.includes("Round-the-clock security operations center"));
    assert.ok(!source.includes("instant threat response"));
  }

  assert.ok(servicesHub.includes("Platform Security Monitoring"));
  assert.ok(services.includes("Verified authorization event capture"));
  assert.ok(cybersecurityHub.includes("No invented scan results, fictional incidents, or unsupported security guarantees"));
});

test("security service page avoids unsupported certification and SOC claims", async () => {
  const services = await read("src/pages/Services.tsx");

  for (const claim of ["ISO 27001 Certified", "SOC 2 Compliant", "24/7 Support", "Fortune 500 companies"]) {
    assert.ok(!services.includes(claim));
  }
});
