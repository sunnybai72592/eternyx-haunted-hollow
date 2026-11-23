/**
 * Offline ETERNYX Labs exercises.
 * No network requests, remote execution, simulated CVEs, or trust in user-entered code.
 * This module contains no database access and does not award authenticated credentials.
 */
export const labCatalog = Object.freeze([
  { id: "web", title: "Web developer playground", area: "Web development", level: "Foundations", description: "Write HTML, CSS, and JavaScript and run it inside a restricted preview." },
  { id: "xss", title: "DOM XSS practice", area: "Vulnerabilities", level: "Foundations", description: "Compare unsafe HTML insertion with safe text rendering in an isolated frame." },
  { id: "headers", title: "HTTP header clinic", area: "Cybersecurity", level: "Intermediate", description: "Audit pasted HTTP response headers and inspect concrete hardening gaps." },
  { id: "sql", title: "SQL injection defense", area: "Pentesting fundamentals", level: "Foundations", description: "Observe unsafe query concatenation and a parameterized alternative without a live database." },
  { id: "access", title: "Access-control decisions", area: "Pentesting fundamentals", level: "Intermediate", description: "Test least-privilege authorization outcomes against a local policy." },
  { id: "codec", title: "UTF-8 encoding lab", area: "Developer essentials", level: "Foundations", description: "Encode and decode UTF-8, Base64 and hex locally with strict validation." },
  { id: "urls", title: "URL anatomy clinic", area: "Web security", level: "Foundations", description: "Break down a URL safely without visiting it or displaying secret values." },
  { id: "jwt", title: "JWT structure inspector", area: "Identity & auth", level: "Intermediate", description: "Inspect JWT header and claim names without trusting or verifying its signature." },
  { id: "redact", title: "Sensitive-log redaction", area: "Defensive operations", level: "Intermediate", description: "Practice pattern-based removal of credentials from training logs." },
  { id: "sha", title: "SHA-256 text fingerprint", area: "Data integrity", level: "Foundations", description: "Calculate a text digest locally using browser Web Crypto, without upload." },
  { id: "subnet", title: "IPv4 subnet calculator", area: "Network fundamentals", level: "Intermediate", description: "Compute IPv4 network, mask, broadcast, and assignable ranges locally." },
  { id: "chmod", title: "UNIX permissions trainer", area: "Linux security", level: "Foundations", description: "Simulate octal permission bits and umask without modifying files." },
  { id: "csp", title: "CSP policy lint", area: "Web hardening", level: "Intermediate", description: "Review pasted Content-Security-Policy directives for common risky configurations." },
  { id: "cors", title: "CORS response trainer", area: "API security", level: "Intermediate", description: "Simulate a bounded browser response-sharing check from pasted CORS headers." },
  { id: "cookie", title: "Cookie attribute clinic", area: "Session security", level: "Intermediate", description: "Inspect synthetic Set-Cookie attributes without showing the cookie value." },
  { id: "dns", title: "DNS zone record clinic", area: "Network fundamentals", level: "Intermediate", description: "Check A, CNAME, MX and TXT training records without querying DNS." },
  { id: "http", title: "HTTP request framing review", area: "Web security", level: "Intermediate", description: "Review offline HTTP/1.x request framing and ambiguous headers." },
  { id: "securitytxt", title: "Security.txt review", area: "Security disclosure", level: "Foundations", description: "Inspect security-contact metadata without visiting or messaging the site." },
  { id: "events", title: "Security event correlation", area: "Defensive operations", level: "Intermediate", description: "Correlate synthetic login events and spot bounded timing patterns." },
  { id: "tokens", title: "Secure random token generator", area: "Crypto basics", level: "Intermediate", description: "Generate fresh local random bytes using browser Web Crypto." },
  { id: "ipv6", title: "IPv6 subnet calculator", area: "Network fundamentals", level: "Intermediate", description: "Calculate IPv6 network boundaries and address space with exact 128-bit arithmetic." },
  { id: "cache", title: "HTTP cache policy clinic", area: "Web defense", level: "Intermediate", description: "Inspect Cache-Control response directives and confidential-data caching risks locally." },
  { id: "spf", title: "SPF record linting", area: "Email security", level: "Intermediate", description: "Review simplified SPF TXT mechanisms and unsafe mail-policy choices without querying DNS." },
  { id: "ratelimit", title: "Rate-limit token bucket", area: "API reliability", level: "Intermediate", description: "Simulate actual local token bucket replenishment and allow/deny outcomes." },
  { id: "sri", title: "Subresource Integrity generator", area: "Web integrity", level: "Intermediate", description: "Compute real SHA-256, SHA-384 or SHA-512 SRI hashes of local text with Web Crypto." },
  { id: "pkce", title: "OAuth PKCE S256 workbench", area: "Identity security", level: "Intermediate", description: "Derive genuine SHA-256 OAuth PKCE challenges and generate fresh secure verifiers locally." },
  { id: "hmac", title: "HMAC message integrity lab", area: "Cryptographic integrity", level: "Intermediate", description: "Sign and verify synthetic messages with real Web Crypto HMAC-SHA256." },
  { id: "cidrcheck", title: "IPv4 and IPv6 CIDR membership", area: "Network fundamentals", level: "Intermediate", description: "Check whether an address belongs to a CIDR block without network probes." },
  { id: "hsts", title: "HSTS transport policy clinic", area: "Web hardening", level: "Intermediate", description: "Review HTTP Strict-Transport-Security directives without contacting a website." },
  { id: "dmarc", title: "DMARC email defense clinic", area: "Email security", level: "Intermediate", description: "Inspect synthetic DMARC policy, alignment and enforcement coverage without DNS." },
  { id: "pbkdf2", title: "PBKDF2 key derivation", area: "Cryptographic fundamentals", level: "Intermediate", description: "Derive real PBKDF2-HMAC-SHA256 bytes using a new random salt." },
  { id: "aesgcm", title: "AES-GCM authenticated encryption", area: "Cryptographic integrity", level: "Intermediate", description: "Encrypt, decrypt and reject modified training ciphertext with ephemeral AES-256-GCM." },
  { id: "totp", title: "TOTP one-time code calculator", area: "Identity security", level: "Intermediate", description: "Compute RFC 6238 training OTPs with real Web Crypto HMAC and a specified timestamp." },
  { id: "origins", title: "Browser origin comparison", area: "Web security", level: "Foundations", description: "Compare HTTP(S) URL origins without fetching DNS or revealing query values." },
  { id: "csvsafe", title: "CSV formula neutralizer", area: "Data safety", level: "Intermediate", description: "Quote synthetic CSV cell values and neutralize common spreadsheet formula triggers." },
]);

export const sampleHeaders = [
  "HTTP/1.1 200 OK",
  "Content-Type: text/html; charset=utf-8",
  "X-Content-Type-Options: nosniff",
  "Set-Cookie: session=training-only; Path=/; Secure; HttpOnly; SameSite=Lax",
].join("\n");

const trainingCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/**
 * Only ever mount this document in <iframe sandbox="allow-scripts">.
 * The iframe has an opaque origin, and its own CSP blocks external fetches.
 */
export function buildPlaygroundDocument({ html = "", css = "", js = "" } = {}) {
  const escapedCss = String(css).replace(/<\/style/gi, "<\\/style");
  const escapedJs = String(js).replace(/<\/script/gi, "<\\/script");
  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"" + trainingCsp + "\">",
    "<meta name=\"referrer\" content=\"no-referrer\">",
    "<style>body{font-family:system-ui,sans-serif;margin:20px;color:#172033;}",
    escapedCss,
    "</style></head><body>",
    String(html),
    "<script>", escapedJs, "</script></body></html>",
  ].join("");
}

export function buildDomXssDocument(value, unsafe = false) {
  // Encode < to prevent prematurely closing the inline demonstration script.
  const quotedValue = JSON.stringify(String(value)).replace(/</g, "\\u003c");
  const operation = unsafe ? "output.innerHTML = input;" : "output.textContent = input;";
  return buildPlaygroundDocument({
    html: '<div id="output" aria-live="polite"></div>',
    css: "#output{min-height:70px;border:1px solid #cbd5e1;padding:14px;border-radius:8px;overflow-wrap:anywhere;}",
    js: "const input = " + quotedValue + ";const output = document.getElementById('output');" + operation,
  });
}

export function parseResponseHeaders(text) {
  const map = new Map();
  for (const row of String(text).split(/\r?\n/)) {
    const colon = row.indexOf(":");
    if (colon <= 0) continue;
    const name = row.slice(0, colon).trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(name)) continue;
    const value = row.slice(colon + 1).trim();
    map.set(name, [...(map.get(name) || []), value]);
  }
  return map;
}

export function auditResponseHeaders(text) {
  const headers = parseResponseHeaders(text);
  if (headers.size === 0) return { error: "Paste valid HTTP response headers, one per line.", checks: [] };
  const get = (name) => (headers.get(name) || []).join("; ");
  const csp = get("content-security-policy");
  const hsts = get("strict-transport-security");
  const frame = get("x-frame-options").toLowerCase();
  const referrer = get("referrer-policy").toLowerCase();
  const checks = [
    {
      name: "Content Security Policy",
      passed: csp.length > 0,
      detail: csp ? "CSP is present. Review its directives and exceptions manually." : "No CSP header was supplied. Define an appropriate policy for the application.",
    },
    {
      name: "Content-type sniffing",
      passed: get("x-content-type-options").toLowerCase() === "nosniff",
      detail: get("x-content-type-options").toLowerCase() === "nosniff" ? "nosniff is present." : "Set X-Content-Type-Options: nosniff.",
    },
    {
      name: "HTTPS transport policy",
      passed: /(?:^|;)\s*max-age\s*=\s*(\d+)/i.test(hsts) && Number(hsts.match(/max-age\s*=\s*(\d+)/i)?.[1] || 0) >= 31536000,
      detail: "Check Strict-Transport-Security on a real HTTPS response; this offline check looks for max-age of at least one year.",
    },
    {
      name: "Embedding protection",
      passed: /(?:^|;)\s*frame-ancestors\b/i.test(csp) || /^(deny|sameorigin)$/.test(frame.trim()),
      detail: "Restrict framing with CSP frame-ancestors, or X-Frame-Options DENY/SAMEORIGIN for older clients.",
    },
    {
      name: "Referrer policy",
      passed: referrer.length > 0 && referrer !== "unsafe-url",
      detail: "Specify a privacy-conscious Referrer-Policy appropriate to your application.",
    },
  ];
  const cookies = headers.get("set-cookie") || [];
  if (cookies.length) {
    const weak = cookies.filter((cookie) =>
      !/(?:^|;)\s*secure(?:;|$)/i.test(cookie) ||
      !/(?:^|;)\s*httponly(?:;|$)/i.test(cookie) ||
      !/(?:^|;)\s*samesite\s*=\s*(strict|lax|none)(?:;|$)/i.test(cookie)
    );
    checks.push({
      name: "Cookie attributes",
      passed: weak.length === 0,
      detail: weak.length ? weak.length + " cookie(s) need Secure, HttpOnly, and explicit SameSite review (not all cookies require HttpOnly)." : "Supplied cookies include Secure, HttpOnly, and SameSite attributes.",
    });
  }
  return { error: null, checks };
}

export function sqlQueryComparison(email) {
  const value = String(email);
  return {
    concatenated: "SELECT id, email FROM users WHERE email = '" + value + "';",
    parameterized: "SELECT id, email FROM users WHERE email = $1;",
    values: [value],
  };
}

const grants = Object.freeze({
  viewer: ["read"],
  editor: ["read", "edit"],
  admin: ["read", "edit", "delete"],
});

export function evaluateAccess(role, action) {
  if (!Object.prototype.hasOwnProperty.call(grants, role)) throw new Error("Unknown role");
  if (!["read", "edit", "delete"].includes(action)) throw new Error("Unknown action");
  return { allowed: grants[role].includes(action), role, action };
}
