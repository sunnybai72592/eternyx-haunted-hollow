import test from "node:test";
import assert from "node:assert/strict";
import { auditResponseHeaders } from "../src/lib/eternyxLabs.mjs";

const check = (text, name) => auditResponseHeaders(text).checks.find((item) => item.name === name)?.passed;
const baseline = [
  "Content-Security-Policy: default-src 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security: max-age=31536000; includeSubDomains",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "Set-Cookie: session=abc; HttpOnly; Secure; SameSite=Strict",
];
const replace = (index, value) => baseline.map((line, i) => i === index ? value : line).join("\n");

test("clinic accepts a complete reasonable offline baseline", () => {
  assert.equal(auditResponseHeaders(baseline.join("\n")).checks.every((item) => item.passed), true);
});
test("CSP requires a default source directive rather than mere header presence", () => {
  assert.equal(check(replace(0, "Content-Security-Policy: script-src 'unsafe-inline'"), "Content Security Policy"), false);
});
test("wildcard and empty frame ancestor directives are not accepted", () => {
  for (const directive of ["frame-ancestors *", "frame-ancestors"]) {
    assert.equal(check(replace(0, "Content-Security-Policy: default-src 'self'; " + directive), "Embedding protection"), false);
  }
});
test("HSTS rejects zero, duplicates and duplicate max-age directives", () => {
  for (const hsts of [
    "Strict-Transport-Security: max-age=0",
    "Strict-Transport-Security: max-age=31536000; max-age=0",
    "Strict-Transport-Security: max-age=31536000\nStrict-Transport-Security: max-age=31536000",
  ]) {
    assert.equal(check(replace(1, hsts), "HTTPS transport policy"), false);
  }
});
test("sniffing and referrer checks reject duplicate or unknown headers", () => {
  assert.equal(check(replace(2, "X-Content-Type-Options: nosniff\nX-Content-Type-Options: nonsense"), "Content-type sniffing"), false);
  assert.equal(check(replace(3, "Referrer-Policy: made-up-policy"), "Referrer policy"), false);
  assert.equal(check(replace(3, "Referrer-Policy: no-referrer\nReferrer-Policy: unsafe-url"), "Referrer policy"), false);
});
test("cookies require exactly one valid SameSite attribute plus Secure and HttpOnly", () => {
  for (const cookie of [
    "Set-Cookie: session=x; Secure; HttpOnly; SameSite=Unexpected",
    "Set-Cookie: session=x; Secure; HttpOnly; SameSite=Lax; SameSite=None",
    "Set-Cookie: session=x; HttpOnly; SameSite=None",
    "Set-Cookie: session=x; Secure; SameSite=Strict",
  ]) {
    assert.equal(check(replace(4, cookie), "Cookie attributes"), false);
  }
  assert.equal(check(replace(4, "Set-Cookie: session=x; Secure; HttpOnly; SameSite=None"), "Cookie attributes"), true);
});
