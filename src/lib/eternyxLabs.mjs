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
  const values = (name) => headers.get(name) || [];
  const single = (name) => values(name).length === 1 ? values(name)[0].trim() : "";
  const csp = single("content-security-policy");
  const hsts = single("strict-transport-security");
  const frame = single("x-frame-options").toLowerCase();
  const referrer = single("referrer-policy").toLowerCase();
  const cspDirectives = csp.split(";").map((part) => part.trim()).filter(Boolean);
  const frameAncestors = cspDirectives.find((part) => /^frame-ancestors(?:\s|$)/i.test(part));
  // A bare frame-ancestors directive or a wildcard is not a meaningful restriction.
  const restrictedAncestors = frameAncestors && /^frame-ancestors\s+(?!\s*$)/i.test(frameAncestors) &&
    !/^frame-ancestors\s+\*(?:\s|$)/i.test(frameAncestors);
  const hstsAges = [...hsts.matchAll(/(?:^|;)\s*max-age\s*=\s*(\d+)\s*(?=;|$)/gi)];
  const validHsts = values("strict-transport-security").length === 1 &&
    hstsAges.length === 1 && Number(hstsAges[0][1]) >= 31536000;
  const validReferrers = new Set([
    "no-referrer", "no-referrer-when-downgrade", "same-origin", "origin",
    "strict-origin", "origin-when-cross-origin", "strict-origin-when-cross-origin",
  ]);
  const checks = [
    {
      name: "Content Security Policy",
      passed: !!csp && cspDirectives.some((part) => /^default-src\s+\S/i.test(part)),
      detail: csp ? "Check CSP directives, sources and exceptions manually. A present header is not proof of safety; this check expects a default-src directive." : "Supply a Content-Security-Policy with an appropriate default-src directive.",
    },
    {
      name: "Content-type sniffing",
      passed: single("x-content-type-options").toLowerCase() === "nosniff",
      detail: "Provide exactly one X-Content-Type-Options: nosniff header.",
    },
    {
      name: "HTTPS transport policy",
      passed: validHsts,
      detail: "Provide a single Strict-Transport-Security header with one max-age of at least one year. This offline check cannot verify HTTPS delivery.",
    },
    {
      name: "Embedding protection",
      passed: !!restrictedAncestors || /^(deny|sameorigin)$/.test(frame),
      detail: "Restrict framing using a non-wildcard frame-ancestors policy or X-Frame-Options DENY/SAMEORIGIN. Check effective browser behavior manually.",
    },
    {
      name: "Referrer policy",
      passed: validReferrers.has(referrer),
      detail: "Use a recognized privacy-conscious Referrer-Policy; unsafe-url, unrecognized and duplicate headers do not pass this clinic.",
    },
  ];
  const cookies = values("set-cookie");
  if (cookies.length) {
    const weak = cookies.filter((cookie) => {
      const secure = /(?:^|;)\s*secure\s*(?:;|$)/i.test(cookie);
      const httpOnly = /(?:^|;)\s*httponly\s*(?:;|$)/i.test(cookie);
      const sameSites = [...cookie.matchAll(/(?:^|;)\s*samesite\s*=\s*(strict|lax|none)\s*(?=;|$)/gi)];
      const allSameSiteAttributes = [...cookie.matchAll(/(?:^|;)\s*samesite\s*=/gi)];
      return !secure || !httpOnly || sameSites.length !== 1 || allSameSiteAttributes.length !== 1 ||
        (sameSites[0][1].toLowerCase() === "none" && !secure);
    });
    checks.push({
      name: "Cookie attributes",
      passed: weak.length === 0,
      detail: weak.length ? weak.length + " cookie(s) need review for Secure, HttpOnly and one valid SameSite attribute (HttpOnly may be inappropriate for some non-session cookies)." : "Supplied cookies include Secure, HttpOnly, and a single valid SameSite value.",
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
