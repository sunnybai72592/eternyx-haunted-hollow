import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
const cryptoSource = await read("src/lib/security/localTextEncryption.ts");
const cryptoPage = await read("src/pages/QuantumEncryption.tsx");
const zeroDay = await read("src/pages/ZeroDayProtection.tsx");
const aiSecurity = await read("src/pages/AIPoweredSecurity.tsx");
const services = await read("src/pages/ServicesHub.tsx");
const app = await read("src/App.tsx");
const ecosystem = await read("src/data/ecosystem.ts");
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const compiled = ts.transpileModule(cryptoSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const local = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));

test("legacy quantum route now operates a real browser AES-256-GCM workbench, not a Base64 cipher", () => {
  assert.match(cryptoPage, /AES-256-GCM text workbench/);
  assert.match(cryptoPage, /Classical encryption · not post-quantum/);
  assert.match(cryptoPage, /encryptLocalText\(plaintext, password\)/);
  assert.match(cryptoPage, /decryptLocalText\(envelope, password\)/);
  assert.doesNotMatch(cryptoPage, /ENCRYPTED_WITH_|simulatedEncryptedText|quantumAttackSimulation|btoa\(/);
  assert.doesNotMatch(cryptoSource, /supabase|fetch\(|localStorage|sessionStorage/);
});

test("real authenticated encryption round trips Unicode without retaining the plaintext in the envelope", async () => {
  const plaintext = "سَلام — سلام — سلام 🔐";
  const password = "A longer test password #2026";
  const first = await local.encryptLocalText(plaintext, password);
  const second = await local.encryptLocalText(plaintext, password);
  const packed = JSON.parse(first);
  assert.equal(packed.format, "eternyx-aes-gcm-v1");
  assert.equal(packed.iterations, 210000);
  assert.equal(typeof packed.salt, "string");
  assert.equal(typeof packed.iv, "string");
  assert.notEqual(first, second, "fresh salt and nonce required");
  assert.equal(first.includes(plaintext), false);
  assert.equal(await local.decryptLocalText(first, password), plaintext);
});

test("AES-GCM rejects wrong passwords and modified ciphertext without claiming decryption", async () => {
  const envelope = JSON.parse(await local.encryptLocalText("Important local test", "strong-password-123"));
  await assert.rejects(local.decryptLocalText(JSON.stringify(envelope), "wrong-password-123"), { code: "authentication_failed" });
  const original = envelope.ciphertext;
  envelope.ciphertext = (original[0] === "A" ? "B" : "A") + original.slice(1);
  await assert.rejects(local.decryptLocalText(JSON.stringify(envelope), "strong-password-123"), { code: "authentication_failed" });
});

test("encryption validation rejects weak or blank passwords, empty text and oversized envelopes", async () => {
  await assert.rejects(local.encryptLocalText("hello", "short"), { code: "invalid_password" });
  await assert.rejects(local.encryptLocalText("", "strong-password-123"), { code: "invalid_text" });
  await assert.rejects(local.encryptLocalText("x".repeat(20001), "strong-password-123"), { code: "invalid_text" });
  await assert.rejects(local.decryptLocalText("not-json", "strong-password-123"), { code: "invalid_envelope" });
  await assert.rejects(local.decryptLocalText(JSON.stringify({ format: "not-supported" }), "strong-password-123"), { code: "invalid_envelope" });
});

test("zero-day legacy page no longer invents live detections, threat feeds, or protection scores", () => {
  assert.match(zeroDay, /Zero-day response readiness/);
  assert.match(zeroDay, /No live threat detection enabled/);
  assert.match(zeroDay, /readinessChecks\.map/);
  assert.match(zeroDay, /aria-live="polite"/);
  assert.doesNotMatch(zeroDay, /setInterval\(|Math\.random\(|initialThreats|Simulated Threat|predictive-model-output|Live Threat Feed/);
});

test("AI security page does not claim fabricated model accuracy, malware verdicts, or predictive alerts", () => {
  assert.match(aiSecurity, /Legacy AI malware scores, model accuracy statistics and predictive detection dashboards were simulated and have been removed/);
  assert.doesNotMatch(aiSecurity, /class AISecurityEngine|runMalwareModel|generateSampleTraffic|predictThreats|malwareScore|accuracy:\s*0\./);
  assert.match(aiSecurity, /supabase\.functions\.invoke\("security-assistant"/);
  assert.match(aiSecurity, /requestId:\s*crypto\.randomUUID\(\)/);
  assert.match(aiSecurity, /typeof data\?\.reply !== "string"/);
  assert.match(aiSecurity, /No AI answer was returned/);
});

test("Services Hub destination links are keyboard-accessible and registered in the actual route table", () => {
  const links = [...services.matchAll(/href: "(\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length >= 12, "Expected comprehensive route-grounded directory");
  assert.equal(links.length, new Set(links).size, "Avoid duplicated destinations");
  for (const href of links) {
    assert.ok(app.includes('path="' + href + '"'), "Missing registered route: " + href);
  }
  assert.match(services, /<Link to=\{item\.href\}>/);
  assert.doesNotMatch(services, /onClick=\{\(\) => navigate\(link\)\}|hover:border-\$\{|https:\/\/openai\.com|mailto:consulting@eternyx/);
});

test("Service Hub no longer markets unsupported security protection, vendor integrations, or staff capacity", () => {
  assert.match(services, /Assessment & Remediation/);
  assert.match(services, /No active zero-day detector or live threat feed/);
  assert.match(services, /Backend-dependent/);
  assert.doesNotMatch(services, /impenetrable cybersecurity|proprietary detection systems|top-tier developers|real-time threat intelligence feeds|ensure your data remains secure for decades/);
});

test("Developer Studio is accurately labeled as an existing foundation while future pillars remain planned", () => {
  assert.match(ecosystem, /id: "developer-studio"[\s\S]*?status: "Existing foundation"/);
  for (const id of ["workspace", "integrations", "automation"]) {
    assert.match(ecosystem, new RegExp('id: "' + id + '"[\\s\\S]*?status: "Planned"'));
  }
});

test("launch blocker audit remains explicit about deployment, approval and outstanding security checks", async () => {
  const audit = await read("RELEASE_AUDIT_2026-11-19.md");
  assert.match(audit, /Critical blockers still requiring verification/);
  assert.match(audit, /November 23/);
  assert.match(audit, /November 25/);
  assert.match(audit, /Do not activate billing/);
});
