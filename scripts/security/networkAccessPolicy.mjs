/**
 * ETERNYX network-anonymizer policy: pure server/perimeter decision logic.
 * INPUT MUST be verified provider intelligence from a trusted backend, NEVER
 * client-supplied flags, browser JavaScript or arbitrary request headers.
 * This module is intentionally not wired into production until a trusted
 * IP-source contract and intelligence provider are tested in staging.
 */
export const NETWORK_ACCESS_MODES = Object.freeze(["monitor", "challenge", "block"]);

export function evaluateNetworkAccess({ mode = "monitor", verdict, scope = "website" } = {}) {
  if (!NETWORK_ACCESS_MODES.includes(mode)) throw new TypeError("Invalid security mode");
  if (!["website", "api"].includes(scope)) throw new TypeError("Invalid security scope");
  // Unknown/reputation failure is not proof of VPN use.
  if (!verdict || verdict.verified !== true ||
      !["vpn", "proxy", "tor", "clean", "unknown"].includes(verdict.category)) {
    return Object.freeze({ action: "allow", reason: "unverified", scope });
  }
  if (verdict.category === "clean" || verdict.category === "unknown")
    return Object.freeze({ action: "allow", reason: verdict.category, scope });
  if (mode === "monitor")
    return Object.freeze({ action: "allow", reason: "monitor-" + verdict.category, scope });
  if (mode === "challenge")
    return Object.freeze({ action: "challenge", reason: verdict.category, scope });
  return Object.freeze({ action: "block", reason: verdict.category, scope });
}

export const CLOUDFLARE_DEPLOYMENT = Object.freeze({
  // Use only when Cloudflare PROXIES the hostname; DNS-only routing is NOT protected.
  phase: "http_request_firewall_custom",
  hostnamePlaceholder: "REPLACE_WITH_VERIFIED_ETERNYX_HOSTNAME",
  // Custom list must be populated from a legally approved, maintained source.
  customList: "$eternyx_confirmed_anonymizer_ips",
  // This expression cannot protect direct external endpoints on other domains.
  expressionTemplate:
    '(http.host eq "REPLACE_WITH_VERIFIED_ETERNYX_HOSTNAME" and ip.src in $eternyx_confirmed_anonymizer_ips)',
  startingAction: "log",
  permittedActions: Object.freeze(["log", "managed_challenge", "block"]),
});
