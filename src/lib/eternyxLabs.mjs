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
