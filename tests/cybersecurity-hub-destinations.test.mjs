import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy security audit and incident response URLs redirect to real workbenches", async () => {
  const app = await read("src/App.tsx");

  assert.match(app, /path="\/security-auditing" element={<Navigate to="\/cybersecurity\/assessment-remediation" replace \/>}/);
  assert.match(app, /path="\/incident-response" element={<Navigate to="\/cybersecurity\/incident-playbooks" replace \/>}/);
  assert.doesNotMatch(app, /lazy\(\(\) => import\("\.\/pages\/(SecurityAuditing|IncidentResponse)"\)\)/);
});

test("Cybersecurity Hub does not advertise retired simulated pages", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");

  assert.doesNotMatch(hub, /href: "\/security-auditing"|href: "\/incident-response"|name: "Security Auditing"|name: "Incident Response"/);
  assert.match(hub, /Security Assessment & Remediation/);
  assert.match(hub, /Incident Response Playbook Workbench/);
});

test("network security card describes the available assessment workflow without claiming scanning", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");

  assert.match(hub, /Network Security Planning/);
  assert.match(hub, /Direct network scanning is not currently available/);
  assert.match(hub, /Network Security Assessment Register/);
  assert.doesNotMatch(hub, /href: "\/tools\/network-scanner"|name: "Network Scanner"/);
});
