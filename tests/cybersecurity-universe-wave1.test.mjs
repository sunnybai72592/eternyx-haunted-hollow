import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const requiredWorkbenches = [
  "/developer-studio/api-security",
  "/developer-studio/cicd-security",
  "/developer-studio/rls-security",
  "/zero-day-protection",
  "/quantum-encryption",
  "/ai-powered-security",
  "/labs/verified",
  "/labs/range",
  "/labs/sessions",
  "/cybersecurity/dns",
];

test("Cybersecurity Hub distinguishes execution modes and limits for every destination", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");
  const section = hub.split("const destinations: Destination[] = [")[1]?.split("\n];")[0];
  assert.ok(section, "Missing canonical destination catalog");
  const entries = section.split(/\n  \{\n    name: /).slice(1);
  assert.ok(entries.length >= 20, "Existing and newly connected destinations must be retained");
  for (const entry of entries) {
    assert.match(entry, /href: "\/[^"]+"/, "Destination must have a route");
    assert.match(entry, /mode: "(Local review|Provider-backed|Account workspace|Limited telemetry|Local lab|Deployment-gated|Learning resources)"/, "Execution mode is required");
    assert.match(entry, /limitation: "[^"]+"/, "Every entry needs a truthful limitation");
  }
  assert.match(hub, /aria-label="Filter security workbenches by execution type"/);
  assert.match(hub, /destination\.mode === modeFilter/);
  assert.match(hub, /\{destination\.limitation\}/);
});

test("Cross-pillar security capabilities exist as actual app destinations", async () => {
  const [hub, app] = await Promise.all([read("src/pages/CybersecurityHub.tsx"), read("src/App.tsx")]);
  for (const href of requiredWorkbenches) {
    assert.ok(hub.includes(`href: "${href}"`), `Missing Hub capability: ${href}`);
    assert.ok(app.includes(`path="${href}"`), `Unrouted workbench: ${href}`);
  }
  assert.match(hub, /Public hosted session start\/access remains disabled/);
  assert.match(hub, /not quantum or post-quantum cryptography/);
  assert.match(hub, /not a malware scanner, live threat detector, or SOC/);
});

test("Guided security journey is evidence-led, not fake orchestration", async () => {
  const hub = await read("src/pages/CybersecurityHub.tsx");
  assert.match(hub, /From evidence to remediation/);
  assert.match(hub, /do not automatically share a completed case/);
  for (const href of ["/vulnerability-scanner", "/cybersecurity/threat-modeling", "/black-hat-pentesting", "/cybersecurity/assessment-remediation"]) {
    assert.ok(hub.includes(`href: "${href}"`));
  }
});

test("Legacy fabricated cyber arsenal is retired without disabling honest tools", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /path="\/arsenal" element=\{<Navigate to="\/cybersecurity" replace \/>\}/);
  assert.doesNotMatch(app, /import\("\.\/pages\/enhanced\/CyberArsenal"\)/);
  assert.match(app, /path="\/quantum-encryption" element=\{<QuantumEncryption \/>\}/);
  assert.match(app, /path="\/ai-powered-security" element=\{<AIPoweredSecurity \/>\}/);
});
