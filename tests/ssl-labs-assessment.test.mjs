import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSslLabsFindings,
  deriveSslLabsChecks,
  flattenProtocolSuites,
} from "../supabase/functions/_shared/ssl-labs-assessment.mjs";

test("flattens SSL Labs cipher suites grouped by protocol", () => {
  const suites = flattenProtocolSuites([
    { protocol: "TLS 1.2", list: [{ name: "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256" }] },
    { protocol: "TLS 1.3", list: [{ name: "TLS_AES_128_GCM_SHA256" }] },
  ]);
  assert.equal(suites.length, 2);
});

test("detects weak ciphers from nested protocol suite lists", () => {
  const findings = collectSslLabsFindings([{
    statusMessage: "Ready",
    details: {
      protocols: [],
      suites: [{ protocol: "TLS 1.2", list: [
        { name: "TLS_RSA_WITH_RC4_128_SHA", cipherStrength: 128 },
        { name: "TLS_AES_128_GCM_SHA256", cipherStrength: 128 },
      ] }],
    },
  }], []);
  assert.equal(findings.some((finding) => finding.id === "WEAK_CIPHER"), true);
});

test("does not inspect endpoints whose assessment did not complete", () => {
  const findings = collectSslLabsFindings([{
    statusMessage: "In progress",
    details: { protocols: [{ name: "SSL", version: "3.0" }] },
  }], []);
  assert.deepEqual(findings, []);
});

test("uses SSL Labs protocol insecurity flags and vulnerability results", () => {
  const findings = collectSslLabsFindings([{
    statusMessage: "Ready",
    details: {
      protocols: [{ name: "TLS", version: "1.2", q: 0 }],
      suites: [],
      heartbleed: true,
      openSslCcs: 3,
    },
  }], []);
  assert.deepEqual(findings.map((finding) => finding.id).sort(), [
    "HEARTBLEED", "OPENSSL_CCS", "WEAK_PROTOCOL",
  ]);
});

test("reads certificate expiry from the host certificate list in Unix seconds", () => {
  const now = Date.UTC(2026, 0, 1);
  const findings = collectSslLabsFindings([], [{
    notAfter: Math.floor((now + 5 * 86400000) / 1000),
  }], now);
  assert.equal(findings[0]?.id, "CERT_EXPIRING");
});

test("reports unknown checks as null rather than false", () => {
  const checks = deriveSslLabsChecks({ details: {} }, [], 0);
  assert.equal(checks.hsts_enabled, null);
  assert.equal(checks.ocsp_stapling, null);
  assert.equal(checks.certificate_transparency, null);
  assert.equal(checks.perfect_forward_secrecy, null);
});

test("derives HSTS, OCSP, certificate transparency and forward secrecy from SSL Labs fields", () => {
  const checks = deriveSslLabsChecks({
    details: {
      hstsPolicy: { status: "present" },
      ocspStapling: true,
      hasSct: 2,
      forwardSecrecy: 1,
      protocols: [{ name: "TLS", version: "1.3" }],
    },
  }, [{
    notBefore: 1,
    notAfter: 9999999999,
  }], 1000);
  assert.equal(checks.hsts_enabled, true);
  assert.equal(checks.ocsp_stapling, true);
  assert.equal(checks.certificate_transparency, true);
  assert.equal(checks.perfect_forward_secrecy, true);
  assert.equal(checks.supports_tls13, true);
  assert.equal(checks.certificate_valid, true);
});
