import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNetworkAccess, CLOUDFLARE_DEPLOYMENT } from "../scripts/security/networkAccessPolicy.mjs";

test("defaults to monitor and does not block confirmed VPNs", () => {
  assert.deepEqual(evaluateNetworkAccess({ verdict: { verified: true, category: "vpn" } }),
    { action: "allow", reason: "monitor-vpn", scope: "website" });
});
test("explicit challenge/block affect verified VPN, Tor and proxy only", () => {
  for (const category of ["vpn", "tor", "proxy"]) {
    assert.equal(evaluateNetworkAccess({ mode: "challenge", verdict: { verified: true, category } }).action, "challenge");
    assert.equal(evaluateNetworkAccess({ mode: "block", verdict: { verified: true, category }, scope: "api" }).action, "block");
  }
});
test("unverified, missing and unknown intel never becomes a VPN accusation", () => {
  for (const verdict of [undefined, { category: "vpn" }, { verified: false, category: "tor" },
    { verified: true, category: "unknown" }, { verified: true, category: "clean" },
    { verified: true, category: "unrecognized" }]) {
    assert.equal(evaluateNetworkAccess({ mode: "block", verdict }).action, "allow");
  }
});
test("invalid mode or scope is rejected", () => {
  assert.throws(() => evaluateNetworkAccess({ mode: "disabled" }), TypeError);
  assert.throws(() => evaluateNetworkAccess({ scope: "billing" }), TypeError);
});
test("Cloudflare rollout is hostname-scoped, monitoring first, never claims automatic intelligence", () => {
  assert.equal(CLOUDFLARE_DEPLOYMENT.startingAction, "log");
  assert.match(CLOUDFLARE_DEPLOYMENT.expressionTemplate, /http.host eq/);
  assert.match(CLOUDFLARE_DEPLOYMENT.expressionTemplate, /ip.src in \$eternyx_confirmed_anonymizer_ips/);
  assert.ok(!CLOUDFLARE_DEPLOYMENT.expressionTemplate.includes("cf.vpn"));
});
