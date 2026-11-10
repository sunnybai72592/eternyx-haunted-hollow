const MAX_INPUT = 300000;
const severities = ["critical", "high", "medium", "low"];
const add = (findings, id, severity, title, detail, recommendation, evidence = "") => findings.push({ id, severity, title, detail, recommendation, evidence });
const parseObject = (text, label) => {
  if (!text || !text.trim()) return null;
  if (text.length > MAX_INPUT) throw new Error(label + " exceeds the 300,000 character limit.");
  let value;
  try { value = JSON.parse(text); } catch { throw new Error(label + " must be valid JSON for this review."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " must be a JSON object.");
  return value;
};
const textValue = value => typeof value === "string" ? value : "";
export function analyzeApiSecurity({ openApiText = "", jwtConfigText = "", corsText = "", headersText = "", rateLimitText = "", authzText = "" } = {}) {
  const inputs = { openApiText, jwtConfigText, corsText, headersText, rateLimitText, authzText };
  if (!Object.values(inputs).some(value => typeof value === "string" && value.trim())) throw new Error("Paste at least one configuration or specification to review.");
  for (const [key, value] of Object.entries(inputs)) if (typeof value === "string" && value.length > MAX_INPUT) throw new Error(key + " exceeds the 300,000 character limit.");
  const findings = [];
  const openApi = parseObject(openApiText, "OpenAPI document");
  const jwt = parseObject(jwtConfigText, "JWT configuration");
  const rate = parseObject(rateLimitText, "Rate-limit configuration");
  const authz = parseObject(authzText, "Authorization design");
  if (openApi) {
    const version = textValue(openApi.openapi);
    if (!version.startsWith("3.")) add(findings, "OPENAPI_VERSION_UNCLEAR", "low", "OpenAPI version is missing or not 3.x", "The supplied JSON does not identify an OpenAPI 3.x document.", "Confirm the document format and validate it with an OpenAPI validator.");
    const schemes = openApi.components?.securitySchemes || {};
    const globalSecurity = Array.isArray(openApi.security) && openApi.security.length > 0;
    let securedOperations = 0, operations = 0;
    for (const [path, item] of Object.entries(openApi.paths || {})) {
      if (!item || typeof item !== "object") continue;
      for (const [method, operation] of Object.entries(item)) {
        if (!["get","post","put","patch","delete","options","head","trace"].includes(method.toLowerCase()) || !operation || typeof operation !== "object") continue;
        operations++;
        const secured = Array.isArray(operation.security) ? operation.security.length > 0 : globalSecurity;
        if (secured) securedOperations++;
        else add(findings, "OPENAPI_OPERATION_NO_SECURITY", "high", "Operation has no declared security requirement", path + " (" + method.toUpperCase() + ") does not inherit a non-empty global security requirement and declares none locally.", "Declare an appropriate security requirement, or document why the operation is intentionally public.", path + " " + method.toUpperCase());
      }
    }
    if (!Object.keys(schemes).length) add(findings, "OPENAPI_SECURITY_SCHEME_MISSING", "high", "No security schemes are defined", "The OpenAPI document contains no components.securitySchemes object entries.", "Define the intended authentication scheme, such as HTTP bearer or OAuth 2.0, and apply it to protected operations.");
    if (!operations) add(findings, "OPENAPI_OPERATIONS_NOT_FOUND", "low", "No API operations were discovered", "No HTTP operations were found under paths.", "Confirm that the supplied OpenAPI document includes its paths and methods.");
    if (operations && !securedOperations && Object.keys(schemes).length) add(findings, "OPENAPI_NO_SECURED_OPERATIONS", "high", "No operations declare authentication", "Security schemes exist, but no discovered operation inherits or declares a non-empty security requirement.", "Apply security requirements to protected operations; keep public endpoints explicit.");
  }
  if (jwt) {
    const alg = textValue(jwt.algorithm || jwt.alg).toUpperCase();
    if (!alg) add(findings, "JWT_ALGORITHM_UNSPECIFIED", "high", "JWT signing algorithm is unspecified", "The configuration does not state an expected signing algorithm.", "Allowlist an explicit algorithm and reject tokens that select an unexpected algorithm.");
    if (alg === "NONE" || alg === "HS256" && jwt.publicKey) add(findings, "JWT_ALGORITHM_KEY_MISMATCH", "critical", "JWT algorithm or key configuration needs urgent review", "The configuration uses an unsecured algorithm or combines HS256 with a public-key field.", "Reject alg=none and use a cryptographically appropriate, explicitly pinned algorithm/key pairing.");
    if (jwt.verifySignature === false || jwt.validateSignature === false) add(findings, "JWT_SIGNATURE_VALIDATION_DISABLED", "critical", "JWT signature validation is disabled", "A supplied setting explicitly disables signature validation.", "Require signature verification using trusted issuer keys.");
    for (const claim of ["issuer","audience","issuerUrl","audienceId"]) if (jwt[claim] === false || jwt[claim] === "") add(findings, "JWT_CLAIM_VALIDATION_GAP", "high", "JWT " + claim + " validation is not configured", "The configuration explicitly disables or empties " + claim + " validation.", "Validate issuer and audience against trusted expected values.");
    if (jwt.expirationRequired === false || jwt.requireExpiration === false) add(findings, "JWT_EXPIRATION_NOT_REQUIRED", "high", "JWT expiration is not required", "The configuration explicitly permits tokens without an expiration requirement.", "Require exp and enforce bounded token lifetimes.");
    if (jwt.clockToleranceSeconds > 300) add(findings, "JWT_CLOCK_TOLERANCE_HIGH", "medium", "JWT clock tolerance is unusually large", "The configured clock tolerance exceeds five minutes.", "Use the smallest clock skew allowance that operations require.");
  }
  if (corsText.trim()) {
    const cors = corsText.trim();
    if (/(access-control-allow-origin\s*:\s*\*|allowOrigin\s*["']?\s*:\s*["']\*["'])/i.test(cors)) add(findings, "CORS_WILDCARD_ORIGIN", "high", "CORS allows every origin", "The supplied CORS configuration appears to allow wildcard origins.", "Use an explicit allowlist of trusted origins, especially for credentialed endpoints.");
    if (/(access-control-allow-credentials\s*:\s*true|allowCredentials\s*["']?\s*:\s*true)/i.test(cors) && /(access-control-allow-origin\s*:\s*\*|allowOrigin\s*["']?\s*:\s*["']\*)/i.test(cors)) add(findings, "CORS_CREDENTIALS_WILDCARD", "critical", "Credentialed CORS appears combined with wildcard origin", "The supplied text contains both credential allowance and wildcard origin patterns.", "Never combine credentialed cross-origin access with a wildcard origin; validate exact origins.");
    if (/(null\s*[,\]]|["']null["'])/i.test(cors)) add(findings, "CORS_NULL_ORIGIN", "medium", "CORS may trust the null origin", "The supplied text contains a null origin entry or value.", "Avoid trusting the null origin unless there is a documented, isolated requirement.");
  }
  if (headersText.trim()) {
    const h = headersText.toLowerCase();
    for (const [header, id, severity, recommendation] of [
      ["strict-transport-security","HEADER_HSTS_MISSING","high","Set HSTS on HTTPS responses after confirming all relevant subdomains support HTTPS."],
      ["content-security-policy","HEADER_CSP_MISSING","medium","Define a restrictive Content-Security-Policy appropriate to the application."],
      ["x-content-type-options","HEADER_NOSNIFF_MISSING","low","Set X-Content-Type-Options: nosniff."],
      ["referrer-policy","HEADER_REFERRER_POLICY_MISSING","low","Set a deliberate Referrer-Policy such as strict-origin-when-cross-origin."],
      ["permissions-policy","HEADER_PERMISSIONS_POLICY_MISSING","low","Restrict browser capabilities that the application does not need."]
    ]) if (!h.includes(header)) add(findings, id, severity, header + " not found", "The supplied header list does not visibly include " + header + ".", recommendation);
    if (/\bserver\s*:/i.test(headersText) || /\bx-powered-by\s*:/i.test(headersText)) add(findings, "HEADER_TECH_DISCLOSURE", "low", "Server technology disclosure header present", "A Server or X-Powered-By header appears in the supplied text.", "Consider removing unnecessary implementation-detail headers.");
  }
  if (rate) {
    if (rate.enabled === false) add(findings, "RATE_LIMITING_DISABLED", "high", "Rate limiting is explicitly disabled", "The configuration sets enabled to false.", "Apply endpoint-aware limits and monitor abuse patterns.");
    if (rate.enabled !== false && !rate.limit && !rate.maxRequests && !rate.requestsPerWindow) add(findings, "RATE_LIMIT_VALUE_MISSING", "medium", "Rate-limit threshold is not visible", "No recognizable request threshold was supplied.", "Define a request limit and window, then tune by endpoint and client class.");
    if (rate.key === "ip" && rate.trustProxy === true) add(findings, "RATE_LIMIT_PROXY_TRUST", "high", "Rate limiting trusts forwarded IP data", "The configuration uses IP keys and trusts proxy headers.", "Only trust forwarded client IP headers from known, controlled reverse proxies.");
    if (rate.windowSeconds > 86400) add(findings, "RATE_LIMIT_WINDOW_LONG", "medium", "Rate-limit window is unusually long", "The configured window exceeds one day.", "Review whether the window supports the intended abuse-control and user-experience goals.");
  }
  if (authz) {
    if (authz.authorizationRequired === false || authz.enforceAuthorization === false) add(findings, "AUTHZ_ENFORCEMENT_DISABLED", "critical", "Authorization enforcement is disabled", "The supplied design explicitly disables authorization enforcement.", "Enforce server-side authorization on every protected request.");
    if (authz.objectLevelChecks === false || authz.tenantIsolation === false) add(findings, "AUTHZ_OBJECT_SCOPE_GAP", "critical", "Object-level or tenant isolation checks are disabled", "The supplied design explicitly disables object-level authorization or tenant isolation.", "Authorize access to each requested object and enforce tenant boundaries server-side.");
    if (authz.defaultAllow === true) add(findings, "AUTHZ_DEFAULT_ALLOW", "critical", "Authorization defaults to allow", "The supplied design explicitly sets defaultAllow to true.", "Use deny-by-default authorization with explicit permission grants.");
    if (authz.rolesFromClient === true) add(findings, "AUTHZ_CLIENT_CONTROLLED_ROLES", "high", "Roles appear client-controlled", "The design indicates that role values are accepted from the client.", "Derive roles and permissions from trusted server-side identity and policy data.");
    if (authz.auditSensitiveActions === false) add(findings, "AUTHZ_AUDIT_GAP", "medium", "Sensitive authorization actions are not audited", "The configuration disables auditing for sensitive actions.", "Record security-relevant access decisions with privacy-aware retention.");
  }
  const rank = Object.fromEntries(severities.map((value, index) => [value, index]));
  findings.sort((a,b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title));
  const summary = Object.fromEntries(severities.map(level => [level, findings.filter(item => item.severity === level).length]));
  return { findings, summary, reviewed: Object.entries(inputs).filter(([,value]) => value.trim()).map(([key]) => key), operationCount: openApi ? Object.values(openApi.paths || {}).reduce((sum,item) => sum + Object.keys(item || {}).filter(method => ["get","post","put","patch","delete","options","head","trace"].includes(method.toLowerCase())).length,0) : null };
}
export function buildApiSecurityReport(result) {
  const lines = ["# ETERNYX API Security & Threat Intelligence Review", "", "## Scope", "Static review of supplied configuration and OpenAPI JSON. Findings are heuristic indicators, not confirmed vulnerabilities or exploit results.", "", "## Summary", ...severities.map(level => "- " + level.toUpperCase() + ": " + result.summary[level]), "", "## Inputs reviewed", ...result.reviewed.map(item => "- " + item), ""];
  if (result.findings.length) for (const item of result.findings) lines.push("## [" + item.severity.toUpperCase() + "] " + item.title, "", item.detail, "", "**Recommendation:** " + item.recommendation, item.evidence ? "**Evidence:** " + item.evidence : "", "");
  else lines.push("No configured heuristic checks were triggered. This does not establish that the API is secure.", "");
  lines.push("## Verification boundary", "This workbench does not send requests to targets, exploit endpoints, verify JWT signatures, resolve runtime configuration, prove authorization correctness, or certify compliance. Validate findings with code review, controlled testing, and authoritative platform documentation.");
  return lines.join("\n");
}
