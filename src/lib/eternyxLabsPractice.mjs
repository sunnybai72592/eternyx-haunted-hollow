/**
 * ETERNYX Labs practice: 90 real, browser-only challenges (27 crypto-checked asynchronously).
 * Exercises derive answer keys from the same pure calculation utilities as
 * the learner's workstations. Nothing is saved, uploaded or server-graded.
 * Client-side grading is NOT exam security, accreditation or trusted progress.
 */
import {
  calculateIpv4Subnet,simulateUnixUmask,lintCspPolicy,
  evaluateCorsHeaderExample,reviewSetCookieExample,
} from "./eternyxLabsFoundations.mjs";
import {
  inspectDnsZoneLocally,inspectHttpRequestLocally,inspectSecurityTxtLocally,
  correlateSecurityEventsLocally,generateLocalRandomToken,
} from "./eternyxLabsOperations.mjs";
import {
  calculateIpv6SubnetLocally,inspectCachePolicyLocally,inspectSpfRecordLocally,
  simulateTokenBucketLocally,inspectSriFormatLocally,
} from "./eternyxLabsAdvanced.mjs";
import {
  derivePkceChallengeLocally,signHmacLocally,verifyHmacLocally,
  checkCidrMembershipLocally,inspectHstsLocally,inspectDmarcLocally,
} from "./eternyxLabsIdentity.mjs";
import {
  CRYPTO_PRACTICE_TRACKS,CRYPTO_PRACTICE_DEFINITIONS,
  answerForCryptoPractice,answerForDataPractice,
} from "./eternyxLabsCryptoPractice.mjs";
import {
  ADVANCED_DATA_TRACKS,ADVANCED_DATA_DEFINITIONS,
  answerForStructuredPractice,answerForAdvancedCryptoPractice,
} from "./eternyxLabsAdvancedDataPractice.mjs";

export const PRACTICE_TRACKS=Object.freeze([
  Object.freeze({id:"subnet",title:"IPv4 subnetting",description:"Calculate address ranges and hosts."}),
  Object.freeze({id:"chmod",title:"Linux permissions",description:"Apply the UNIX umask."}),
  Object.freeze({id:"csp",title:"CSP hardening",description:"Count static policy findings."}),
  Object.freeze({id:"cors",title:"CORS decisions",description:"Predict simplified browser response sharing."}),
  Object.freeze({id:"cookie",title:"Cookie settings",description:"Inspect session-cookie attribute warnings."}),
  Object.freeze({id:"dns",title:"DNS record analysis",description:"Count records, owners and conflicting CNAME sources."}),
  Object.freeze({id:"http",title:"HTTP request framing",description:"Inspect real request-framing calculations without traffic."}),
  Object.freeze({id:"securitytxt",title:"Security disclosure files",description:"Check Contact and Expires metadata."}),
  Object.freeze({id:"events",title:"Incident event correlation",description:"Count defensive events and spot ten-minute patterns."}),
  Object.freeze({id:"tokens",title:"Token generation math",description:"Understand secure random byte and encoding lengths."}),
  Object.freeze({id:"ipv6",title:"IPv6 subnetting",description:"Work with exact 128-bit CIDR values and ranges."}),
  Object.freeze({id:"cache",title:"Cache policy",description:"Evaluate caching hints and sensitive-response risks."}),
  Object.freeze({id:"spf",title:"SPF mail policy",description:"Count real mechanism and lookup warnings."}),
  Object.freeze({id:"ratelimit",title:"Rate limiting",description:"Compute token-bucket decisions and refill."}),
  Object.freeze({id:"sri",title:"Subresource Integrity",description:"Calculate digest and encoding sizes from real SRI rules."}),
  Object.freeze({id:"pkce",title:"OAuth PKCE",description:"Check actual S256 verifier-to-challenge derivations."}),
  Object.freeze({id:"hmac",title:"HMAC integrity",description:"Sign synthetic messages and verify changed-message integrity."}),
  Object.freeze({id:"cidrcheck",title:"CIDR membership",description:"Check addresses against IPv4 and IPv6 ranges."}),
  Object.freeze({id:"hsts",title:"HTTPS transport policy",description:"Reason about HSTS max-age and subdomain requirements."}),
  Object.freeze({id:"dmarc",title:"DMARC mail defense",description:"Count policy fields and warning signals without contacting DNS."}),
  ...CRYPTO_PRACTICE_TRACKS,
  ...ADVANCED_DATA_TRACKS,
]);
const definitions=[
  ["subnet-network","subnet","Network address · /24",
    "What is the network address for this host?","192.168.42.77/24",
    "ipv4",{cidr:"192.168.42.77/24",field:"network"},
    "A /24 subnet keeps the first three octets as network bits.",
    "A /24 mask is 255.255.255.0; zero the host bits."],
  ["subnet-hosts","subnet","Usable addresses · /27",
    "How many conventional usable IPv4 addresses are in this subnet?","10.7.1.200/27",
    "integer",{cidr:"10.7.1.200/27",field:"usableCount"},
    "Count 2^(32-prefix) total, then subtract network and broadcast for /0–/30.",
    "For /27 there are five host bits. This counts assignable addresses, not online devices."],
  ["subnet-point","subnet","Broadcast value · /31",
    "What is the upper address returned by the CIDR calculator?","198.51.100.10/31",
    "ipv4",{cidr:"198.51.100.10/31",field:"broadcast"},
    "A /31 has two consecutive addresses; both can be used on point-to-point links.",
    "The calculated upper address is conventionally labelled broadcast by this arithmetic model; /31 has special endpoint use."],
  ["chmod-directory","chmod","Directory creation",
    "Which three-digit octal mode remains after the umask?","Requested: 0777\numask: 0027",
    "octal",{requested:"0777",umask:"0027"},
    "The umask removes group write and all permissions for others.",
    "Mode = requested bits AND the complement of the umask (within 0777)."],
  ["chmod-file","chmod","File creation",
    "Which three-digit octal mode remains after the umask?","Requested: 0666\numask: 0022",
    "octal",{requested:"0666",umask:"0022"},
    "Read/write permissions are requested for everyone; remove group/other write.",
    "An umask never adds execute bits that were not requested."],
  ["chmod-restrict","chmod","Private owner access",
    "Which three-digit octal mode remains after the umask?","Requested: 0750\numask: 0077",
    "octal",{requested:"0750",umask:"0077"},
    "Only owner bits survive when group and other permissions are fully masked.",
    "Compare the owner/group/other permission bit groups independently."],
  ["csp-hardened","csp","Hardened baseline",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'",
    "integer",{policy:"default-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'"},
    "Review each required fallback/restriction directive and unsafe script token.",
    "A zero-warning result is NOT proof that the deployed policy is safe."],
  ["csp-unsafe","csp","Unsafe script options",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' *",
    "integer",{policy:"default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval' *"},
    "Count missing protective directives plus each risky script source token.",
    "Warnings are static teaching findings, not confirmed vulnerabilities."],
  ["csp-duplicate","csp","Duplicate directives",
    "How many heuristic warnings does the local CSP linter report?",
    "default-src 'none'; default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'",
    "integer",{policy:"default-src 'none'; default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; script-src 'self'"},
    "Browsers generally use the first repeated directive within one policy.",
    "This example isolates the duplicate-directive warning."],
  ["cors-exact","cors","Credentialed exact-origin",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://api.example.org\nCredentials: yes\nAccess-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://api.example.org",
      credentials:true,headers:"Access-Control-Allow-Origin: https://app.example.org\nAccess-Control-Allow-Credentials: true"},
    "A credentialed cross-origin read needs an exact origin and credentials header.",
    "CORS response sharing is not server authorization or a complete preflight check."],
  ["cors-wildcard","cors","Credentialed wildcard",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://api.example.org\nCredentials: yes\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://api.example.org",
      credentials:true,headers:"Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true"},
    "Credentialed cross-origin responses cannot use a wildcard allow-origin.",
    "The wildcard does not satisfy credentialed cross-origin response sharing."],
  ["cors-same","cors","Same-origin request",
    "Would the simplified response-sharing check allow the read?",
    "Request: https://app.example.org\nResource: https://app.example.org\nCredentials: no\nNo CORS response headers",
    "boolean",{requestOrigin:"https://app.example.org",resourceOrigin:"https://app.example.org",
      credentials:false,headers:""},
    "Same-origin requests do not need CORS permission.",
    "The example models same-origin response sharing only; other browser and server protections still apply."],
  ["cookie-host","cookie","Valid host-prefixed cookie",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: __Host-training=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict",
    "integer",{header:"Set-Cookie: __Host-training=synthetic; Path=/; Secure; HttpOnly; SameSite=Strict"},
    "Check Secure, Path=/, absence of Domain, HttpOnly and SameSite.",
    "The static attribute checklist does not confirm a secure origin or actual browser cookie policy."],
  ["cookie-weak","cookie","Weak host-prefixed cookie",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: __Host-training=synthetic; Domain=example.org; SameSite=None",
    "integer",{header:"Set-Cookie: __Host-training=synthetic; Domain=example.org; SameSite=None"},
    "Missing Secure and HttpOnly, SameSite=None with no Secure, and an invalid __Host- prefix configuration each trigger a warning.",
    "The checker counts local static warnings; browser behavior also depends on the response origin."],
  ["cookie-session","cookie","HttpOnly missing",
    "How many warnings does the local cookie-attribute clinic report?",
    "Set-Cookie: training=synthetic; Secure; SameSite=Lax",
    "integer",{header:"Set-Cookie: training=synthetic; Secure; SameSite=Lax"},
    "HttpOnly may be needed for a sensitive session cookie.",
    "Not every cookie must be HttpOnly; decide based on its actual purpose."],

  ["dns-count","dns","Multiple IPv4 host records",
    "How many A records does the offline DNS clinic count?",
    "example.test. 300 IN A 192.0.2.3\napi.example.test. 300 IN A 192.0.2.4\nexample.test. 300 IN MX 10 mail.example.test.",
    "integer",{zone:"example.test. 300 IN A 192.0.2.3\napi.example.test. 300 IN A 192.0.2.4\nexample.test. 300 IN MX 10 mail.example.test.",field:"A"},
    "Count only records with type A; MX is a separate type.",
    "The offline parser counts supported record types without doing a DNS lookup."],
  ["dns-cname","dns","Conflicting CNAME owner",
    "How many warnings does the training DNS record clinic return?",
    "shop.example.test. 300 IN CNAME target.example.test.\nshop.example.test. 300 IN A 192.0.2.7",
    "integer",{zone:"shop.example.test. 300 IN CNAME target.example.test.\nshop.example.test. 300 IN A 192.0.2.7",field:"warnings"},
    "A CNAME owner must not simultaneously have a different DNS record type.",
    "This local heuristic flags the contradictory CNAME owner; it does not query authoritative DNS."],
  ["dns-owners","dns","Distinct DNS owner names",
    "How many different owner names appear in this training zone?",
    "example.test. 300 IN A 192.0.2.3\nexample.test. 300 IN MX 10 mail.example.test.\napi.example.test. 300 IN A 192.0.2.4\n_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",
    "integer",{zone:"example.test. 300 IN A 192.0.2.3\nexample.test. 300 IN MX 10 mail.example.test.\napi.example.test. 300 IN A 192.0.2.4\n_dmarc.example.test. 300 IN TXT \"v=DMARC1; p=none\"",field:"distinctOwners"},
    "Two records can belong to one owner: count unique left-hand-side names.",
    "The zone parser normalizes owner names and groups records under their owners."],
  ["http-body","http","HTTP body byte length",
    "How many UTF-8 bytes are in the synthetic request body?",
    "POST /training HTTP/1.1\nHost: example.test\nContent-Length: 5\n\nhello",
    "integer",{request:"POST /training HTTP/1.1\nHost: example.test\nContent-Length: 5\n\nhello",field:"bodyBytes"},
    "Bytes in the body are counted after the empty line separating headers and body.",
    "Content-Length describes byte length, not Unicode character count."],
  ["http-conflict","http","Ambiguous request length",
    "How many training warnings does this raw HTTP request produce?",
    "POST /items HTTP/1.1\nHost: example.test\nContent-Length: 5\nTransfer-Encoding: chunked\n\nabcde",
    "integer",{request:"POST /items HTTP/1.1\nHost: example.test\nContent-Length: 5\nTransfer-Encoding: chunked\n\nabcde",field:"warnings"},
    "Check both the conflicting framing headers and the unsupported transfer-encoding analysis.",
    "The tool warns about TE/CL conflict and incomplete chunked-body interpretation; it never sends this request."],
  ["http-headers","http","Count request header lines",
    "How many header lines (not including the request line) are present?",
    "GET /training HTTP/1.1\nHost: example.test\nAccept: text/plain\nX-Training: yes\n\n",
    "integer",{request:"GET /training HTTP/1.1\nHost: example.test\nAccept: text/plain\nX-Training: yes\n\n",field:"headerCount"},
    "Host, Accept, and X-Training are three separate header lines.",
    "The inspector parses HTTP/1.x header lines, not a live connection."],
  ["security-contacts","securitytxt","Multiple disclosure contacts",
    "How many Contact fields does the offline security.txt checker identify?",
    "Contact: mailto:security@example.test\nContact: https://example.test/security\nExpires: 2030-01-01T00:00:00Z",
    "integer",{document:"Contact: mailto:security@example.test\nContact: https://example.test/security\nExpires: 2030-01-01T00:00:00Z",field:"contactCount"},
    "Both mailto and HTTPS Contact entries are counted; their values remain hidden.",
    "A valid contact URI is not proof that the organization owns it."],
  ["security-expired","securitytxt","Expired security disclosure",
    "How many warnings does the offline security.txt checker produce?",
    "Contact: mailto:security@example.test\nExpires: 2020-01-01T00:00:00Z",
    "integer",{document:"Contact: mailto:security@example.test\nExpires: 2020-01-01T00:00:00Z",field:"warningCount"},
    "The expiry is in the past relative to the fixed training clock.",
    "An expired disclosure record needs review; the local parser does not fetch the deployed file."],
  ["security-missing","securitytxt","Missing required fields",
    "How many warnings does the security.txt checker give for this sample?",
    "Policy: https://example.test/security-policy",
    "integer",{document:"Policy: https://example.test/security-policy",field:"warningCount"},
    "The required Contact and Expires fields are both absent.",
    "This is static metadata review, not live security-contact validation."],
  ["events-window","events","Repeated failed logins",
    "How many three-failure-in-ten-minute windows does the offline event tool count?",
    "2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:04:00Z|WARN|login-failed\n2026-11-23T10:09:00Z|ERROR|login-failed",
    "integer",{events:"2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:04:00Z|WARN|login-failed\n2026-11-23T10:09:00Z|ERROR|login-failed",field:"threeFailureWindows"},
    "Three distinct login-failed events occur within a ten-minute window.",
    "A matching heuristic is not proof of an intrusion or attacker identity."],
  ["events-errors","events","Count error severity",
    "How many ERROR-severity events does the offline timeline parser count?",
    "2026-11-23T10:00:00Z|ERROR|policy-denied\n2026-11-23T10:01:00Z|WARN|rate-limit\n2026-11-23T10:02:00Z|ERROR|login-failed",
    "integer",{events:"2026-11-23T10:00:00Z|ERROR|policy-denied\n2026-11-23T10:01:00Z|WARN|rate-limit\n2026-11-23T10:02:00Z|ERROR|login-failed",field:"errors"},
    "Count ERROR labels, not event types such as policy-denied.",
    "The example contains two ERROR events and one WARN event."],
  ["events-total","events","Count synthetic log records",
    "How many events are accepted by the local event-correlation utility?",
    "2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:02:00Z|WARN|rate-limit\n2026-11-23T10:05:00Z|INFO|login-success\n2026-11-23T10:10:00Z|INFO|service-recovered",
    "integer",{events:"2026-11-23T10:00:00Z|WARN|login-failed\n2026-11-23T10:02:00Z|WARN|rate-limit\n2026-11-23T10:05:00Z|INFO|login-success\n2026-11-23T10:10:00Z|INFO|service-recovered",field:"eventCount"},
    "Each supported line contains UTC time, a severity level, and an allowed event name.",
    "Only synthetic event types are accepted; real identity data and logs are not required."],
  ["tokens-entropy","tokens","Random byte entropy budget",
    "How many raw random bits does a 32-byte Web Crypto token contain?",
    "Token generator: 32 bytes, hexadecimal display; secure random source.",
    "integer",{bytes:32,format:"hex",field:"randomBits"},
    "Multiply bytes by eight. Encodings do not add randomness.",
    "This counts source bits, not guaranteed unpredictability after a system or implementation compromise."],
  ["tokens-hex","tokens","Hexadecimal encoded length",
    "How many characters appear in the hex form of 24 random bytes?",
    "Token generator: 24 random bytes, output format hex.",
    "integer",{bytes:24,format:"hex",field:"length"},
    "A byte is represented by two hexadecimal digits.",
    "The training key comes from a synthetic injected random-byte provider. No real secret is retained."],
  ["tokens-b64","tokens","Base64url encoded length",
    "How many characters appear in unpadded base64url for 32 random bytes?",
    "Token generator: 32 random bytes, output format base64url (without padding).",
    "integer",{bytes:32,format:"base64url",field:"length"},
    "Base64 packs six bits into each character; omit trailing '=' padding.",
    "This is output-length math on synthetic bytes, not a real token or a credential audit."],
  ["ipv6-net","ipv6","IPv6 /64 network address",
    "What is the normalized IPv6 network address for this CIDR?",
    "2001:db8:abcd:2::beef/64","ipv6",
    {cidr:"2001:db8:abcd:2::beef/64",field:"network"},
    "A /64 keeps the first 64 bits and clears the final 64.",
    "The range calculator uses exact BigInt 128-bit arithmetic, not an IPv4-style broadcast."],
  ["ipv6-count","ipv6","IPv6 /120 address count",
    "How many addresses are mathematically contained in this IPv6 /120?",
    "2001:db8:42::f00/120","integer",
    {cidr:"2001:db8:42::f00/120",field:"addressCount"},
    "There are 128 − 120 = 8 variable address bits.",
    "The calculated 256 addresses do not imply that every address is usable by a host."],
  ["ipv6-entire","ipv6","The complete IPv6 space",
    "What is the exact decimal number of addresses in this IPv6 /0?",
    "IPv6 address/prefix: ::1/0","bigint",{cidr:"::1/0",field:"addressCount"},
    "An IPv6 /0 contains 2 to the power of 128 possible addresses.",
    "This requires exact big-integer arithmetic; JavaScript Number loses precision here."],
  ["cache-private","cache","Private response with no-store",
    "How many warnings does the offline policy clinic report for this sensitive response?",
    "Cache-Control: private, no-store\nSensitive response: Yes","integer",
    {header:"private, no-store",sensitive:true,field:"warningCount"},
    "A private response with no-store has no selected heuristic warning in this example.",
    "A clean static warning report is not proof that live cache infrastructure behaves securely."],
  ["cache-public","cache","Sensitive response in a shared cache",
    "How many heuristic warnings does the cache-policy clinic report?",
    "Cache-Control: public, max-age=3600\nSensitive response: Yes","integer",
    {header:"public, max-age=3600",sensitive:true,field:"warningCount"},
    "Look for both a missing no-store on sensitive content and explicit public caching.",
    "These are offline cache-policy warnings, not a browser cache execution test."],
  ["cache-validate","cache","Mandatory revalidation",
    "Does this policy request revalidation before using a stored response?",
    "Cache-Control: private, no-cache\nSensitive response: No","boolean",
    {header:"private, no-cache",sensitive:false,field:"requiresRevalidation"},
    "The no-cache directive controls reuse by requiring successful validation.",
    "no-cache does not mean that the response may never be stored; no-store has a different purpose."],
  ["spf-lookups","spf","SPF lookup-producing mechanisms",
    "How many lookup-producing terms does the local SPF linter count?",
    "v=spf1 ip4:192.0.2.0/24 include:_spf.example.test -all","integer",
    {record:"v=spf1 ip4:192.0.2.0/24 include:_spf.example.test -all",field:"lookupProducingTerms"},
    "ip4 itself is not lookup-producing, while include is.",
    "This is a direct term count, not recursive DNS evaluation of an actual SPF record."],
  ["spf-all","spf","Permissive SPF",
    "How many heuristic warnings appear for this overly permissive SPF example?",
    "v=spf1 +all","integer",
    {record:"v=spf1 +all",field:"warningCount"},
    "The + qualifier on all explicitly permits any sender in a simplified policy.",
    "The local checker warns about the insecure setting without authorizing or authenticating mail."],
  ["spf-mechanisms","spf","Count SPF mechanisms",
    "How many supported mechanisms does the SPF linter count here?",
    "v=spf1 a mx include:_spf.example.test ip4:192.0.2.3 -all","integer",
    {record:"v=spf1 a mx include:_spf.example.test ip4:192.0.2.3 -all",field:"mechanismCount"},
    "Count a, mx, include, ip4, and all as mechanisms.",
    "Counting mechanism tokens is not the same as recursively evaluating sender authorization."],
  ["ratelimit-allowed","ratelimit","Allowed requests",
    "How many of the seven simulated requests are allowed by this token bucket?",
    "Capacity=3; refill=1 token/second; request seconds: 0,0,0,0,1,2,3","integer",
    {capacity:3,refillPerSecond:1,timestamps:"0,0,0,0,1,2,3",field:"allowed"},
    "The initial capacity serves three, the fourth is denied, then time refills one token per second.",
    "These are in-memory mathematical requests, not a real server's response outcomes."],
  ["ratelimit-denied","ratelimit","Denied requests",
    "How many requests in this sequence are denied?",
    "Capacity=3; refill=1 token/second; request seconds: 0,0,0,0,1,2,3","integer",
    {capacity:3,refillPerSecond:1,timestamps:"0,0,0,0,1,2,3",field:"denied"},
    "All requests at second zero share the same initial three-token bucket.",
    "This calculation makes no HTTP requests and installs no real rate limiting."],
  ["ratelimit-left","ratelimit","Tokens remaining after refill",
    "How many tokens remain after the final request in this sequence?",
    "Capacity=2; refill=2 tokens/second; request seconds: 0,0,0,100","integer",
    {capacity:2,refillPerSecond:2,timestamps:"0,0,0,100",field:"finalTokens"},
    "The bucket fills back to its capacity during the long pause, then one request consumes a token.",
    "This model omits concurrent workers, distributed counters and fractional-second precision."],
  ["sri-bits","sri","SHA-384 digest bit count",
    "How many bits are in a SHA-384 Subresource Integrity digest?",
    "SRI algorithm: sha384; training content: abc","integer",
    {algorithm:"sha384",text:"abc",field:"digestBits"},
    "The algorithm's name states its digest size in bits.",
    "This is digest-format mathematics, not a substitute for hashing the actual deployed resource."],
  ["sri-base64","sri","SHA-512 Base64 digest length",
    "How many Base64 characters represent a SHA-512 digest, including its padding?",
    "SRI algorithm: sha512; training content: hello 🌍","integer",
    {algorithm:"sha512",text:"hello 🌍",field:"base64Length"},
    "A SHA-512 digest contains 64 bytes; Base64 groups three bytes into four characters.",
    "The calculation gives encoded length. The actual SRI attribute still requires a real digest of exact bytes."],
  ["sri-textbytes","sri","UTF-8 resource byte count",
    "How many UTF-8 bytes are in this exact resource text?",
    "SRI algorithm: sha256; content: hello 🌍","integer",
    {algorithm:"sha256",text:"hello 🌍",field:"inputBytes"},
    "The world emoji uses four UTF-8 bytes; the six ASCII characters use six.",
    "SRI hashes bytes, not visible character counts. The real hashing workstation uses Web Crypto."],
  ["pkce-rfc","pkce","RFC 7636 S256 known vector",
    "What Base64url SHA-256 code challenge does the synthetic verifier produce?",
    "Verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk\nMethod: S256",
    "base64url",{verifier:"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",field:"challenge"},
    "Hash the ASCII verifier with SHA-256, encode Base64url, remove padding.",
    "This is the published RFC 7636 test vector. The actual digest is calculated in browser Web Crypto."],
  ["pkce-synthetic","pkce","Another PKCE S256 challenge",
    "What challenge does the offline S256 tool derive from this synthetic verifier?",
    "Verifier: kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk\nMethod: S256",
    "base64url",{verifier:"k".repeat(43),field:"challenge"},
    "The verifier is exactly 43 ASCII characters; hash its precise bytes.",
    "The expected challenge comes from real SHA-256, not a hard-coded answer."],
  ["pkce-length","pkce","Verifier length check",
    "How many characters does this synthetic RFC-style verifier contain?",
    "Verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk\nMethod: S256",
    "integer",{verifier:"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",field:"verifierLength"},
    "Only unreserved ASCII characters are allowed, and verifiers must be 43–128 characters.",
    "The same PKCE calculator validates the verifier before reporting its actual length."],
  ["hmac-known","hmac","Known HMAC-SHA256 digest",
    "What hexadecimal HMAC-SHA256 signature does this synthetic message produce?",
    "Key: key\nMessage: The quick brown fox jumps over the lazy dog\nAlgorithm: HMAC-SHA256",
    "hex64",{mode:"signature",key:"key",message:"The quick brown fox jumps over the lazy dog"},
    "Compute a MAC with the key and the exact message bytes; output 64 hex digits.",
    "A real symmetric Web Crypto key signs the message. HMAC does not identify an individual sender."],
  ["hmac-tamper","hmac","Modified-message verification",
    "Does a signature for the original message verify against the modified message?",
    "Synthetic key: training-only-key\nSigned: training event\nVerify as: training event changed",
    "boolean",{mode:"verify",key:"training-only-key",message:"training event",candidate:"training event changed"},
    "Changing message bytes invalidates a valid message-authentication code.",
    "The grader signs the original synthetic message, then uses Web Crypto verify against the altered bytes."],
  ["hmac-valid","hmac","Original-message verification",
    "Does a valid signature verify when the original synthetic message is unchanged?",
    "Synthetic key: training-only-key\nSigned: training event\nVerify as: training event",
    "boolean",{mode:"verify",key:"training-only-key",message:"training event",candidate:"training event"},
    "The key, signature and message bytes must match.",
    "Web Crypto performs a genuine HMAC-SHA256 verification. This is not webhook provenance or replay defense."],
  ["cidr-v4-in","cidrcheck","IPv4 upper range address",
    "Is the candidate address mathematically inside this IPv4 CIDR block?",
    "CIDR: 192.168.10.0/24\nCandidate: 192.168.10.255",
    "boolean",{cidr:"192.168.10.0/24",ip:"192.168.10.255"},
    "Subnet containment includes the numeric range endpoints, even if some cannot be assigned to hosts.",
    "This is mathematical membership only; it neither authorizes a firewall rule nor tests reachability."],
  ["cidr-v4-out","cidrcheck","Adjacent IPv4 subnet",
    "Is this address part of the given IPv4 /24?",
    "CIDR: 192.168.10.0/24\nCandidate: 192.168.11.1",
    "boolean",{cidr:"192.168.10.0/24",ip:"192.168.11.1"},
    "A /24 uses the first 24 bits for its network range.",
    "The tested address is outside the specified range despite sharing two leading octets."],
  ["cidr-v6-in","cidrcheck","128-bit IPv6 containment",
    "Is this compressed IPv6 address inside the specified /48?",
    "CIDR: 2001:db8:abcd::/48\nCandidate: 2001:db8:abcd:2::1234",
    "boolean",{cidr:"2001:db8:abcd::/48",ip:"2001:db8:abcd:2::1234"},
    "The /48 fixes the first three 16-bit hextets; remaining bits can vary.",
    "The tool compares exact 128-bit integers without a DNS query or IPv6 network probe."],
  ["hsts-long","hsts","HSTS max-age duration",
    "What max-age in seconds does this synthetic transport policy specify?",
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "integer",{header:"max-age=31536000; includeSubDomains",field:"maxAgeSeconds"},
    "A year of 365 days contains 31,536,000 seconds.",
    "The parser extracts a declared HSTS duration, not a live browser's security state."],
  ["hsts-removal","hsts","Transport policy removal warning",
    "How many static warnings does this HSTS example generate?",
    "Strict-Transport-Security: max-age=0",
    "integer",{header:"max-age=0",field:"warningCount"},
    "A zero duration requests deletion, and includeSubDomains is absent.",
    "The local checker reports policy-removal and missing-subdomain warnings; no HTTPS request is made."],
  ["hsts-subdomains","hsts","Subdomain coverage flag",
    "Does this HSTS header request coverage of subdomains?",
    "Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "boolean",{header:"max-age=31536000; includeSubDomains",field:"includeSubDomains"},
    "Look for the case-insensitive includeSubDomains directive.",
    "Static header syntax is not a substitute for checking real HTTPS delivery and browser enforcement."],
  ["dmarc-monitor","dmarc","Monitoring-only DMARC warnings",
    "How many warnings does the simplified DMARC clinic report for this record?",
    "v=DMARC1; p=none; pct=25",
    "integer",{record:"v=DMARC1; p=none; pct=25",field:"warningCount"},
    "Monitoring-only policy, partial rollout and absent aggregate report endpoint all produce notes.",
    "These are local policy heuristics, not authenticated mail outcomes."],
  ["dmarc-percentage","dmarc","DMARC rollout percentage",
    "Which integer percentage is configured by this DMARC policy?",
    "v=DMARC1; p=reject; pct=75; rua=mailto:reports@example.test",
    "integer",{record:"v=DMARC1; p=reject; pct=75; rua=mailto:reports@example.test",field:"percentage"},
    "The pct tag controls the requested rollout fraction, between zero and one hundred.",
    "The parsed percentage is part of an offline DNS-free example."],
  ["dmarc-report-count","dmarc","Aggregate report destinations",
    "How many aggregate-report URI entries are defined here?",
    "v=DMARC1; p=reject; rua=mailto:first@example.test,mailto:second@example.test",
    "integer",{record:"v=DMARC1; p=reject; rua=mailto:first@example.test,mailto:second@example.test",field:"aggregateReportCount"},
    "Count the comma-separated mailto report endpoints without displaying them in results.",
    "The analysis exposes only the number of report destinations and does not contact any address."],
  ...CRYPTO_PRACTICE_DEFINITIONS,
  ...ADVANCED_DATA_DEFINITIONS,
];
export const PRACTICE_CASES=Object.freeze(definitions.map((
  [id,track,title,prompt,scenario,kind,config,hint,explanation]
)=>Object.freeze({
  id,track,title,prompt,scenario,kind,
  config:Object.freeze(config),hint,explanation,
})));
const byId=new Map(PRACTICE_CASES.map(c=>[c.id,c]));
if(byId.size!==PRACTICE_CASES.length||
   PRACTICE_TRACKS.some(t=>PRACTICE_CASES.filter(c=>c.track===t.id).length!==3))
  throw Error("Practice catalog must contain three unique exercises per track.");
export function getPracticeCase(id){
  if(typeof id!=="string"||!byId.has(id))throw Error("Unknown practice scenario.");
  return byId.get(id);
}
function answerFor(challenge){
  const c=challenge.config;
  switch(challenge.track){
    case "subnet":return String(calculateIpv4Subnet(c.cidr)[c.field]);
    case "chmod":return simulateUnixUmask(c.requested,c.umask).resultingMode;
    case "csp":return String(lintCspPolicy(c.policy).warningCount);
    case "cors":return evaluateCorsHeaderExample(c).readAllowed?"yes":"no";
    case "cookie":return String(reviewSetCookieExample(c.header).warningCount);
    case "dns":{
      const result=inspectDnsZoneLocally(c.zone);
      return String(c.field==="warnings"?result.warnings.length:
        c.field==="A"?result.counts.A:result.distinctOwners);
    }
    case "http":{
      const result=inspectHttpRequestLocally(c.request);
      return String(c.field==="warnings"?result.warnings.length:result[c.field]);
    }
    case "securitytxt":{
      const result=inspectSecurityTxtLocally(c.document,new Date("2026-11-23T00:00:00Z"));
      return String(result[c.field]);
    }
    case "events":{
      const result=correlateSecurityEventsLocally(c.events);
      return String(c.field==="errors"?result.levels.ERROR:result[c.field]);
    }
    case "tokens":{
      // Only the output LENGTH and number of source bits are used for
      // practice. The deterministic injected bytes are an explicit fixture,
      // NEVER a generated production credential or secure randomness claim.
      const result=generateLocalRandomToken({
        bytes:c.bytes,format:c.format,
        cryptoApi:{getRandomValues(bytes){bytes.fill(0xa5);return bytes;}},
      });
      return String(c.field==="length"?result.token.length:result.randomBits);
    }
    case "ipv6":{
      const result=calculateIpv6SubnetLocally(c.cidr);
      return String(result[c.field]);
    }
    case "cache":{
      const result=inspectCachePolicyLocally(c.header,{sensitive:c.sensitive});
      return c.field==="requiresRevalidation"?(result.requiresRevalidation?"yes":"no"):
        String(result[c.field]);
    }
    case "spf":{
      const result=inspectSpfRecordLocally(c.record);
      return String(result[c.field]);
    }
    case "ratelimit":{
      const result=simulateTokenBucketLocally(c);
      return String(result[c.field]);
    }
    case "sri":{
      // Inspect format only: this synchronous educational grading never
      // pretends to compute a cryptographic hash or contact a resource.
      const result=inspectSriFormatLocally(c.text,{algorithm:c.algorithm});
      return String(result[c.field]);
    }
    case "cidrcheck":
      return checkCidrMembershipLocally(c.cidr,c.ip).contained?"yes":"no";
    case "hsts":{
      const result=inspectHstsLocally(c.header);
      return c.field==="includeSubDomains"?(result.includeSubDomains?"yes":"no"):String(result[c.field]);
    }
    case "dmarc":{
      const result=inspectDmarcLocally(c.record);
      return String(result[c.field]);
    }
    case "origins":
    case "csvsafe":return answerForDataPractice(challenge);
    case "jsonmask":return answerForStructuredPractice(challenge);
    case "pkce":
    case "hmac":
    case "pbkdf2":
    case "aesgcm":
    case "totp":
    case "hkdf":
    case "ecdsa":
    case "aesaad":
    case "jsonhash":throw Error("Cryptographic challenges require asynchronous Web Crypto grading.");
    default:throw Error("Unsupported practice grading track.");
  }
}
function normalize(answer,kind){
  if(typeof answer!=="string"||answer.length>64)
    throw Error("Enter a short answer before grading.");
  const trimmed=answer.trim();
  const raw=trimmed.toLowerCase();
  if(kind==="base64url"){
    if(!/^[A-Za-z0-9_-]{43}$/.test(trimmed))
      throw Error("Enter exactly 43 unpadded Base64url characters.");
    return trimmed;
  }
  if(kind==="otp8"||kind==="otp6"){
    const digits=kind==="otp8"?8:6;
    if(!new RegExp("^[0-9]{"+digits+"}$").test(trimmed))
      throw Error("Enter exactly "+digits+" decimal OTP digits, including any leading zeroes.");
    return trimmed;
  }
  if(kind==="hex64"){
    if(!/^[0-9a-f]{64}$/.test(raw))
      throw Error("Enter exactly 64 hexadecimal HMAC-SHA256 characters.");
    return raw;
  }
  if(kind==="boolean"){
    if(!["yes","no"].includes(raw))
      throw Error("Choose Yes or No for this scenario.");
    return raw;
  }
  if(kind==="integer"){
    if(!/^(0|[1-9][0-9]{0,9})$/.test(raw))
      throw Error("Enter a nonnegative whole number.");
    return String(Number(raw));
  }
  if(kind==="bigint"){
    if(!/^(0|[1-9][0-9]{0,38})$/.test(raw)||
       BigInt(raw)>(1n<<128n))
      throw Error("Enter a bounded canonical nonnegative decimal integer.");
    return BigInt(raw).toString();
  }
  if(kind==="ipv6"){
    try{return calculateIpv6SubnetLocally(raw+"/128").address;}
    catch{throw Error("Enter a valid IPv6 address without a prefix.");}
  }
  if(kind==="octal"){
    if(!/^(?:0?[0-7]{3})$/.test(raw))
      throw Error("Enter a three-digit octal permission mode.");
    return raw.replace(/^0(?=[0-7]{3}$)/,"");
  }
  if(kind==="ipv4"){
    const parts=raw.split(".");
    if(parts.length!==4||parts.some(p=>!/^(0|[1-9][0-9]{0,2})$/.test(p)||Number(p)>255))
      throw Error("Enter a canonical dotted-decimal IPv4 address.");
    return parts.join(".");
  }
  throw Error("Unsupported answer format.");
}
export function gradePracticeAnswer(id,answer){
  const challenge=getPracticeCase(id);
  const normalized=normalize(answer,challenge.kind);
  const expected=answerFor(challenge);
  return Object.freeze({
    caseId:id,track:challenge.track,
    correct:normalized===expected,
    expected,explanation:challenge.explanation,
    hint:challenge.hint,
    locallyChecked:true,
    serverVerified:false,certificateAwarded:false,
    externalSystemsAccessed:false,
  });
}
/** Async wrapper preserves all prior synchronous answer contracts. */
export async function gradePracticeAnswerAsync(id,answer,cryptoApi=globalThis.crypto){
  const challenge=getPracticeCase(id);
  if(!["pkce","hmac","pbkdf2","aesgcm","totp","hkdf","ecdsa","aesaad","jsonhash"].includes(challenge.track))
    return gradePracticeAnswer(id,answer);
  const normalized=normalize(answer,challenge.kind);
  const c=challenge.config;
  let expected;
  if(["hkdf","ecdsa","aesaad","jsonhash"].includes(challenge.track)){
    expected=await answerForAdvancedCryptoPractice(challenge,cryptoApi);
  }else if(["pbkdf2","aesgcm","totp"].includes(challenge.track)){
    expected=await answerForCryptoPractice(challenge,cryptoApi);
  }else if(challenge.track==="pkce"){
    const result=await derivePkceChallengeLocally(c.verifier,cryptoApi);
    expected=String(result[c.field]);
  }else if(c.mode==="signature"){
    expected=(await signHmacLocally(c.message,c.key,cryptoApi)).signatureHex;
  }else if(c.mode==="verify"){
    const result=await signHmacLocally(c.message,c.key,cryptoApi);
    const verified=await verifyHmacLocally(c.candidate,c.key,result.signatureHex,cryptoApi);
    expected=verified.verified?"yes":"no";
  }else throw Error("Unsupported HMAC training scenario.");
  return Object.freeze({
    caseId:id,track:challenge.track,correct:normalized===expected,
    expected,explanation:challenge.explanation,hint:challenge.hint,
    locallyChecked:true,serverVerified:false,certificateAwarded:false,
    externalSystemsAccessed:false,
  });
}
export function summarizePracticeProgress(passedIds=[]){
  if(!Array.isArray(passedIds)&&!(passedIds instanceof Set))
    throw Error("Local practice progress must be a list or set.");
  const unique=new Set(passedIds);
  if(unique.size>PRACTICE_CASES.length||[...unique].some(id=>!byId.has(id)))
    throw Error("Unexpected local practice progress entry.");
  return Object.freeze({
    passed:unique.size,total:PRACTICE_CASES.length,
    byTrack:PRACTICE_TRACKS.map(track=>Object.freeze({
      id:track.id,
      passed:PRACTICE_CASES.filter(c=>c.track===track.id&&unique.has(c.id)).length,
      total:3,
    })),
    saved:false,authenticated:false,certificateAwarded:false,
  });
}
