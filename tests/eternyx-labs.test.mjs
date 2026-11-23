import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  auditResponseHeaders, buildDomXssDocument, buildPlaygroundDocument,
  evaluateAccess, labCatalog, parseResponseHeaders, sampleHeaders, sqlQueryComparison,
} from "../src/lib/eternyxLabs.mjs";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("fifteen distinct lab workstations have real local implementations", () => {
  assert.deepEqual(labCatalog.map((lab) => lab.id),
    ["web", "xss", "headers", "sql", "access", "codec", "urls", "jwt", "redact", "sha", "subnet", "chmod", "csp", "cors", "cookie"]);
  assert.equal(new Set(labCatalog.map((lab) => lab.title)).size, 15);
});

test("preview CSP blocks outgoing requests, framing, forms and active resources", () => {
  const document = buildPlaygroundDocument({ html: "<h1>ok</h1>", css: "h1{color:red}", js: "document.title='hello'" });
  assert.match(document, /Content-Security-Policy/);
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "frame-src 'none'", "object-src 'none'"]) {
    assert.ok(document.includes(directive), "Missing " + directive);
  }
  assert.match(document, /<h1>ok<\/h1>/);
  assert.match(document, /h1\{color:red\}/);
});

test("embedded closing script and style tags cannot escape preview code elements", () => {
  const result = buildPlaygroundDocument({ css: "</style><meta name=x>", js: "</script><meta name=y>" });
  assert.ok(result.includes("<\\/style><meta name=x>"));
  assert.ok(result.includes("<\\/script><meta name=y>"));
  assert.equal(result.match(/<\/script>/gi)?.length, 1);
  assert.equal(result.match(/<\/style>/gi)?.length, 1);
});

test("DOM comparison encodes script-breaking user text and exposes separate rendering sinks", () => {
  const dangerous = '</script><img onerror="alert(1)">';
  const unsafe = buildDomXssDocument(dangerous, true);
  const safe = buildDomXssDocument(dangerous, false);
  assert.ok(unsafe.includes("output.innerHTML = input"));
  assert.ok(safe.includes("output.textContent = input"));
  assert.ok(!unsafe.includes('const input = "</script>'));
  assert.match(unsafe, /\\u003c\/script/);
});

test("HTTP header parser handles status lines, case, extra colons and repeated cookies", () => {
  const result = parseResponseHeaders("HTTP/1.1 200 OK\nX-Test: a:b\nx-test: c\nSet-Cookie: a=1\nSet-Cookie: b=2");
  assert.deepEqual(result.get("x-test"), ["a:b", "c"]);
  assert.deepEqual(result.get("set-cookie"), ["a=1", "b=2"]);
});

test("audits pasted headers without claiming live verification", () => {
  assert.match(auditResponseHeaders("").error, /Paste valid/);
  const checks = auditResponseHeaders(sampleHeaders).checks;
  assert.equal(checks.length, 6);
  assert.equal(checks.find((check) => check.name === "Content-type sniffing").passed, true);
  assert.equal(checks.find((check) => check.name === "Content Security Policy").passed, false);
  assert.equal(checks.find((check) => check.name === "Cookie attributes").passed, true);
});

test("valid hardening headers satisfy the defined local rules", () => {
  const full = [
    "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "X-Content-Type-Options: nosniff",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Set-Cookie: session=abc; HttpOnly; Secure; SameSite=Strict",
  ].join("\n");
  const results = auditResponseHeaders(full);
  assert.equal(results.error, null);
  assert.equal(results.checks.every((check) => check.passed), true);
});

test("unsafe SQL text remains demonstrably separate from parameter binding", () => {
  const input = "x' OR 1=1 --";
  const comparison = sqlQueryComparison(input);
  assert.ok(comparison.concatenated.includes(input));
  assert.equal(comparison.parameterized, "SELECT id, email FROM users WHERE email = $1;");
  assert.deepEqual(comparison.values, [input]);
  assert.ok(!comparison.parameterized.includes(input));
});

test("access decisions deny by default for all role/action pairs not granted", () => {
  assert.deepEqual(evaluateAccess("viewer", "delete"), { allowed: false, role: "viewer", action: "delete" });
  assert.equal(evaluateAccess("editor", "edit").allowed, true);
  assert.equal(evaluateAccess("editor", "delete").allowed, false);
  assert.equal(evaluateAccess("admin", "delete").allowed, true);
  assert.throws(() => evaluateAccess("root", "delete"), /Unknown role/);
  assert.throws(() => evaluateAccess("viewer", "grant"), /Unknown action/);
});

test("the Labs UI is reachable and iframe permissions do not grant same-origin access", async () => {
  const app = await read("src/App.tsx");
  const ui = await read("src/pages/EternyxLabs.tsx");
  const nav = await read("src/components/MobileResponsiveNavigation.tsx");
  const hub = await read("src/pages/CybersecurityHub.tsx");
  const dev = await read("src/pages/DeveloperStudio.tsx");
  assert.ok(app.includes('path="/labs" element={<EternyxLabs />}'));
  assert.match(app, /EternyxLabs = lazy/);
  assert.match(nav, /to="\/labs"/);
  assert.match(hub, /href: "\/labs"/);
  assert.match(dev, /to="\/labs"/);
  assert.equal((ui.match(/sandbox="allow-scripts"/g) || []).length, 3);
  assert.doesNotMatch(ui, /allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
  assert.doesNotMatch(ui, /Math\.random|mockResults|fake.*vuln/i);
});
