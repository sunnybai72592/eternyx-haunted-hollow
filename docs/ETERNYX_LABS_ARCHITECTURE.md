# ETERNYX Labs — execution architecture and expansion plan

## Shipping in Phase 1

Route: /labs (public, browser-only). Navigation entry is visible on desktop and mobile. The Cybersecurity Hub and Developer Studio link to the same route, not separate duplicate labs.

Thirty-five **working**, browser-only exercises (thirty existing plus five cryptography/data-safety workstations):
1. Web developer playground — edit HTML, CSS and JavaScript, explicitly run a restricted iframe preview.
2. DOM XSS practice — inspect the difference between an HTML sink and a text sink with controlled, local input.
3. HTTP header clinic — deterministic checks against pasted header text; no outgoing HTTP requests.
4. SQL injection defense — display string concatenation versus PostgreSQL parameter binding (no SQL execution).
5. Access control — deterministic viewer/editor/admin policy decisions (not an authorization enforcement service).
6. UTF-8 conversion — browser-only text encoding and strict Base64/hex decoding with size bounds, not encryption.
7. URL anatomy — parse HTTP(S) components without sending requests; suppress query values and embedded credentials.
8. JWT structure — inspect header and claim names from a synthetic JWT; does NOT validate signatures, authorization or trust.
9. Sensitive-log redaction — training patterns for common token/cookie/key values; not an exhaustive secret scrubber.
10. SHA-256 — real local Web Crypto digest (secure browser context), not encryption or a source authentication claim.
11. IPv4 CIDR/subnet calculator — canonical IPv4 network, mask, broadcast and host ranges including /0, /31 and /32; no connectivity checks.
12. UNIX permissions trainer — octal mode/umask simulation for ordinary read/write/execute bits; no filesystem change.
13. CSP policy lint — static warning checks for repeated and missing directives or unsafe source tokens; not a full CSP parser.
14. CORS response trainer — simplified local origin/credentialed sharing logic using pasted headers; no requests or authorization.
15. Cookie attribute clinic — synthetic Set-Cookie inspection for Secure, HttpOnly, SameSite and name prefix rules; never echoes values.
16. DNS zone clinic — bounded training A, CNAME, MX and TXT records; detects selected CNAME conflicts without DNS lookups.
17. HTTP request framing — review pasted HTTP/1.x headers and UTF-8 body lengths, including Transfer-Encoding/Content-Length ambiguity, without sending requests.
18. security.txt review — checks synthetic disclosure contact, expiry and field structure without contacting a real organization.
19. Security event correlation — summarizes bounded synthetic severity/event timelines and three login failures within ten minutes; no attacker attribution.
20. Random token generator — uses browser Web Crypto to create locally displayed random token bytes in hex or base64url; nothing is stored or transmitted.
21. IPv6 subnet calculator — exact 128-bit CIDR network, range end and address count without DNS or network scans.
22. HTTP Cache-Control clinic — static analysis of caching and privacy directives for synthetic response examples.
23. SPF record linter — simplified local SPF TXT mechanism analysis, DNS lookup budget and permissive-all warnings; no DNS queries.
24. Token bucket simulator — deterministic request allow/deny decisions with bounded capacity, refill rate and event times; no enforcement against a server.
25. Subresource Integrity hash builder — real Web Crypto SHA-256/384/512 base64 digests of exact local training content, never fetching remote scripts.
26. OAuth PKCE S256 workbench — genuine SHA-256 challenge derivation and cryptographically random verifier generation, without an OAuth exchange.
27. HMAC message integrity — real Web Crypto HMAC-SHA256 creation and signature verification using synthetic training keys.
28. IPv4/IPv6 CIDR membership — pure 32-bit/128-bit address containment testing without network probes or firewall enforcement.
29. HSTS transport policy clinic — local Strict-Transport-Security syntax/expiry and preload prerequisite checks, not a live host evaluation.
30. DMARC email defense clinic — synthetic p/sp/pct, DKIM/SPF alignment, and aggregate-report count without revealing recipients or querying DNS.
31. PBKDF2 key derivation — real browser Web Crypto SHA-256 PBKDF2 with a new 16-byte salt and bounded iterations for synthetic passphrases.
32. AES-GCM authenticated encryption — genuine one-shot AES-256-GCM encrypt/decrypt, random 96-bit nonce and tampered-ciphertext rejection with an ephemeral non-exportable key.
33. TOTP code calculator — actual RFC 6238/HMAC-SHA1 test codes for a synthetic key and explicit Unix timestamp.
34. Browser origin comparison — normalized scheme, host and port checks without DNS or URL fetching; excludes query/userinfo values from results.
35. CSV formula neutralizer — RFC 4180-style quoted single-column output with apostrophe prefixing for common formula-like spreadsheet cells.

**Truthful limits:** The thirty-five browser-only workstations do not provide a Kali Linux VM, an exploitable remote backend, isolated Linux commands, live scanners, real lab credentials, graded certification, or authenticated learner progress. Separate CTF and local Docker range routes have their own capabilities, prerequisites, and safety contracts. Do not imply otherwise in the UI. Labs never request a target domain or IP and never execute remote tests.

## Boundary and threat model

- User-authored HTML/CSS/JS is placed only inside an iframe with the literal sandbox permission **allow-scripts**. Never add allow-same-origin, allow-top-navigation, allow-popups, allow-forms, or allow-downloads.
- The iframe document begins with a restrictive CSP: default-src 'none', connect-src 'none', form-action 'none', object-src 'none', frame-src 'none', worker-src 'none'. Inline code is permitted **inside the opaque-origin frame**, for learning, and cannot read the origin of the host application.
- The CSP blocks many network requests, but an inline document CSP and an iframe sandbox are not a complete network firewall: **same-frame navigation is not consistently blocked in browsers**. Never load secrets into this lab and do not treat it as hostile-code execution infrastructure. A dedicated isolated-origin/container platform is required for untrusted shared exercises.
- CSS and JavaScript closing tags are escaped before interpolation. DOM payloads are serialized and '<' characters are encoded before embedding in an inline script.
- The training iframe does not have ETERNYX Supabase credentials or signed-in auth state. Do not mount the frame with a shared origin.
- HTTP header checks analyze pasted text only. They are a learning checklist, not a vulnerability scanner or evidence that a public origin is protected.
- The SQL module is a query-construction demonstration; actual prepared statements and RLS must be enforced server side.
- Access decisions are a teaching model only; browser checks must never be reused as authorization for production resources.
- Labs should not request or retain secrets. Later file uploads or training artifacts must have explicit size/content-type limits and owner-based RLS.
- ETERNYX authentication and subscription enforcement are intentionally unchanged in this phase.

## Hosted disposable range runner (NOT publicly deployed)

A production-ready cyber range needs a separate infrastructure/control plane, not an insecure public Supabase Edge Function that executes arbitrary shell commands. Preferred architecture:

1. A signed-in learner requests a specific, version-pinned exercise from a server-maintained catalog. The server verifies user identity, rate limits, quota and entitlement.
2. An authenticated control plane schedules a **fresh disposable container or VM** in a dedicated lab-only network. It must not share the ETERNYX frontend/database runtime, container socket, host filesystem, service role key or cloud metadata credentials.
3. No public inbound target exposure by default. Give the learner an authenticated, expiring session proxy and scoped access to the one allocated lab. Other learners' lab instances must be inaccessible.
4. Deny external egress by default, including cloud metadata endpoints, internal ranges and production services. Exceptions are explicit, audited, destination-specific, and disabled unless needed by a specific scenario.
5. Enforce CPU/RAM/storage limits, max lifetime, concurrency, idle timeout, disk cleanup, and an emergency kill switch. Reclaim abandoned sessions reliably.
6. Seed intentionally vulnerable applications **only within those ephemeral isolated targets**, never in the primary ETERNYX app or its Supabase production database.
7. A server-side grader checks verifiable actions/flags and saves progress with account-scoped row-level security. Avoid fake scores, hardcoded completion, or trusting client claims.
8. Store sanitized events and audit records, with sensitive payload redaction, appropriate retention and a delete mechanism.
9. Provide repeatable exercises for network fundamentals, Linux, web security, auth controls, app hardening, and defensive forensics. Add Kali-style tools only when they can execute in their own bounded training instances.
10. Run a red-team security review of the lab platform itself, including cross-tenant isolation, SSRF/egress escapes, quotas, sandbox breakouts, and session token abuse, **before opening it to other users**.

## Cost and gating

Phase 1 adds no GPU, paid LLM API, or paid per-lab VM. It uses the visitor's browser and existing ETERNYX static hosting (hosting and bandwidth are not necessarily free).

Phase 2 introduces unavoidable compute and isolation costs. It should not launch to customers until a budget limit, per-session billing, max concurrency and automatic cleanup are verified. Start with a single internal, owner-only practice VM; progressively test account isolation before opening wider access. Do not activate paid subscriptions merely because a frontend button was added.

## Acceptance and verification

- Run: npm test -- --test-name-pattern=Labs (or node --test tests/eternyx-labs.test.mjs).
- Confirm build: npm run build.
- Manually verify /labs in desktop and mobile layouts, preview run/reset, XSS safe-versus-unsafe rendering, header parse errors, SQL comparison, and authorization outcomes.
- Validate frame sandbox flags and browser CSP errors with DevTools; confirm network requests from the preview are rejected.
- Do not claim production-grade browser/iframe isolation is proven by source tests alone. A real cross-origin browser smoke check and eventual dedicated security review are required.


## Additional browser toolkit — privacy and acceptance

The first five supplementary exercises use a separate, tested local utility module and a
dedicated React component. No network operation, Supabase call, backend job,
persistent browser storage, new API key or hosted lab is required.

The workstations are:

- **UTF-8 / Base64 / hex:** encode and strictly decode actual UTF-8 bytes.
  Reject invalid Base64, malformed hexadecimal, invalid UTF-8, excessive
  inputs and noncanonical encodings. These are not secrecy mechanisms.
- **URL anatomy:** accept only complete HTTP(S) URLs; parse protocol, host,
  port and path segment count without navigating or contacting DNS/HTTP.
  Never display URL query values, fragment contents or userinfo credentials.
  Warn about plain HTTP, embedded credentials, token-looking query names
  and punycode hostnames.
- **JWT structure:** inspect three-part compact token structure with strictly
  bounded base64url and UTF-8 JSON parsing. Show algorithm, type, claim *names*
  and basic expiry field shape; never verify signatures, key IDs, issuer trust,
  audiences or authorization. A fixture token is synthetic and unsigned.
  Real bearer tokens and session secrets must not be pasted.
- **Local redaction:** demonstrate bounded, pattern-based masking of
  Authorization and Cookie headers and common credential assignments.
  It is deliberately NOT an exhaustive sanitizer; the output must receive
  human inspection before sharing.
- **SHA-256:** use the real browser Web Crypto digest on UTF-8 input. Require
  a secure browser context; report unsupported environments rather than
  fabricate a digest. Never send text to a hashing API.

Input limits are enforced in the processing layer and the form controls.
No tool promises cryptographic security, live target inspection, real token
verification or cross-device progress. Workstation navigation includes
case-insensitive local search and a no-results message.

### Required verification

Run:

\`\`\`bash
node --test tests/eternyx-labs.test.mjs
node --test tests/eternyx-labs-utilities.test.mjs
npm test
npm run build
\`\`\`

Manually check all ten workstations on desktop and mobile, keyboard labels,
ARIA error messages, no network requests during processing, SHA-256 browser
support, and the unchanged opaque-origin iframe restrictions. The new static
tests cover input bounds, Unicode, malformed encodings, malicious URL
schemes, JWT signature non-verification, credential redaction and real SHA-256.

**Deployment:** This PR only adds browser tools. It does not provision
Firecracker, start Docker, enable public Labs instances, modify billing,
weaken production identity checks or change the independently reviewed
hardware-acceptance boundaries.


## Phase 3 — offline network and browser security foundations

Five additional workstations use a separate deterministic
eternyxLabsFoundations.mjs engine and a dedicated React component.
They perform bounded local calculations only: no HTTP/DNS calls, scanning,
cookies stored, filesystem permission changes, shell, backend credentials,
persistent storage or hosted cyber-range launch.

- **IPv4 subnetting:** unsigned 32-bit bitwise calculation, including the
  valid /0 size of 2^32, RFC 3021 /31 point-to-point behavior, and /32
  host addresses. It does not test reachability.
- **UNIX permissions/umask:** calculate owner/group/other r/w/x output and
  octal mode after umask. Does not model ACLs, special bits or chmod effects
  on existing files.
- **CSP lint:** highlight a bounded set of unsafe-inline, unsafe-eval,
  wildcard, duplicate and omitted directives. Not a browser policy
  interpreter, a live deployment check or a vulnerability certification.
- **CORS:** illustrate exact origins, wildcard and credential flags against
  pasted response headers. Does not check preflights, redirect behavior,
  full Fetch Standard, or whether a server authorizes the request.
- **Cookie attributes:** static analysis of synthetic Set-Cookie attributes;
  masks values in output, warns about special prefixes and missing
  Secure/HttpOnly/SameSite where applicable. Not a browser cookie-setting
  API, and not verification of origin security.

The Labs picker now searches across **15 real workstations** on mobile and
desktop. The original three restricted opaque-origin iframes are unchanged.
All new workstations provide accessible input labels, instructional caveats,
bounded input, deterministic results, and explicit refusal messages.

### Verify before merge

Run these commands locally or in CI:

    node --test tests/eternyx-labs.test.mjs
    node --test tests/eternyx-labs-utilities.test.mjs
    node --test tests/eternyx-labs-foundations.test.mjs
    npm test
    npm run build

The new tests cover CIDR network boundaries, invalid octets/prefixes,
permission masks, unsafe CSP examples, CORS origins and credentials,
cookie value non-disclosure, malformed headers and network-free UI wiring.
CI is not a substitute for manual desktop and mobile interaction testing.

This work does **not** activate hosted Labs, paid GPU/cloud services,
public customer execution, subscriptions or live external target testing.
The earlier Firecracker hardware/approval requirements remain separate.


## Local practice challenges — answer-checked, not trusted certification

An additional **practice and check** section on /labs contains 30 real
deterministic scenarios across five tracks. It is separate from the fifteen
free workstations and does not change the number of workstations:

1. **IPv4 subnetting** — /24 network address, /27 conventional usable
   address count, and /31 point-to-point upper address.
2. **UNIX permissions** — three ordinary requested-mode/umask examples.
3. **CSP** — three static-policy warning-count scenarios: hardened baseline,
   insecure script tokens, and duplicate directives.
4. **CORS** — three simplified response-sharing decisions for an exact
   origin with credentials, a wildcard with credentials, and same-origin.
5. **Cookie attributes** — three warning-count exercises for a valid
   host-prefix cookie, a misconfigured host-prefix cookie, and a session
   cookie with missing HttpOnly.

The answer key is derived **at grading time** from the same tested
calculator/linter functions as the underlying workstations. There is no
random score, placeholder data, manually granted progress, fake certificate
or hidden remote backend. Every question has a sample scenario, a bounded
answer input, a hint, an explanation and a retryable local check. The
answer and the instructional explanation appear after a checked submission.

The interface offers a track switcher, per-track question list, keyboard
accessible labels, screen-reader status and error announcements, next-case
navigation, a verified-in-this-tab count of *unique correctly answered
questions* and a reset button. Multiple correct attempts on one question
cannot inflate the count. Wrong answers do not increase progress.

### Trust, persistence and cost boundaries

This is intentionally **open-book frontend practice**. Answer keys are
derivable from the shipped browser code. Progress is React in-memory state:
it may reset when the page unmounts or refreshes. Nothing is persisted in
localStorage, sessionStorage, a user profile, Supabase, or a training
backend. The feature does not create verified learner progress, an exam,
assessment authorization, certificates, XP, credentials, a ranking or any
server-side audit event.

No network, shell, filesystem mutation, Firecracker launch, Docker
provisioning, paid GPU/cloud, external AI model, target scan or public
hosted Labs activation is introduced. The earlier offline hardware
acceptance and signed evidence chain remain separate.

### No-cost acceptance tests

Run:

    node --test tests/eternyx-labs-practice.test.mjs
    node --test tests/eternyx-labs-foundations.test.mjs
    node --test tests/eternyx-labs.test.mjs
    npm test
    npm run build

The tests confirm exactly five tracks with three unique scenarios each,
all fifteen real computed answers, wrong answers, malformed inputs,
normalization, duplicate-proof progress, explicit absence of trusted
certification and unmodified iframe security rules. Manual browser
verification should also cover track switching, keyboard navigation,
hints, wrong/correct feedback, result reset on edits, and mobile layouts.


## Phase 4 — local defensive-operations tools (five additional workstations)

Twenty workstations are now searchable on the Labs page. Five defensive
operations exercises are delivered by the pure, bounded
eternyxLabsOperations.mjs engine and BrowserDefensiveOperations component.
These add **usable analysis** without a connected target, lab VM, external API,
authentication, account storage or cloud charges.

1. **DNS record clinic:** count canonical training A, CNAME, MX and quoted
   TXT records, enforce TTL/IPv4/MX bounds, and warn about a CNAME owner
   that also has another record type. This does not perform DNS queries,
   validate DNSSEC, support full RFC zone-file syntax, or publish records.
2. **HTTP/1.x request framing:** inspect pasted request lines, headers and
   optional UTF-8 body length, warn about duplicate Content-Length and
   Transfer-Encoding/Content-Length ambiguity, missing Host, and
   inconsistent lengths. It does not model live proxy behavior, parse
   chunked body framing, send traffic or establish exploitability.
   Authorization and cookie values are never echoed by the result.
3. **Security.txt:** inspect Contact and Expires field presence, contact URI
   syntax and expiry using local time. It does not fetch the official
   well-known endpoint, verify domain ownership or authenticate recipients.
   Contact values are omitted from the returned report.
4. **Event correlation:** accept only synthetic
   UTC-timestamp|severity|event training records from an allowlist, count
   severities and identify a sliding ten-minute window with three failed
   logins. This simple exercise is not incident confirmation, identity
   attribution, log ingestion infrastructure or an automated response.
5. **Secure random token generator:** use the browser's
   crypto.getRandomValues to produce 16, 24, 32 or 48 random bytes encoded
   as hexadecimal or base64url. If cryptographic randomness is unavailable,
   the tool refuses to fall back to Math.random. A displayed token is a
   **sensitive value** and must not be shared or treated as a complete
   credential-management or key-rotation system. Nothing is persisted.

### Scope and validation

All text processing has strict UTF-8 size and record-count limits, explicit
error states, accessible labels, responsive cards, and safe result fields.
No tool visits a host, queries DNS, uploads private logs, reads account data,
activates public customer Labs, launches paid VMs/GPUs, uses an external AI
model, modifies sessions or claims an automatically certified vulnerability.

The existing thirty open-book, answer-checked practice questions remain
separate from the **twenty workstation** count. Their progress is still
in-memory only. Existing sandboxed preview frames retain the same permissions.

Run before merge:

    node --test tests/eternyx-labs-operations.test.mjs
    node --test tests/eternyx-labs-practice.test.mjs
    npm test
    npm run build

The adversarial test suite covers invalid DNS names/records, CNAME owner
conflicts, request smuggling warning signals and malformed HTTP framing,
missing/expired security.txt fields, bounded synthetic event windows, token
generation using cryptographic randomness, and no network or storage APIs.
Manual desktop/mobile walkthroughs and independent security review are
still needed for any production-critical use.


## Phase 5 — thirty real, locally checked defensive practice scenarios

The browser-only Labs practice center expands from five to **ten tracks**,
with three answer-checked challenges per track (**30 total**, separate
from the 20 functional workstations). The initial 15 CIDR, UNIX permission,
CSP, CORS and cookie questions are preserved.

The five new tracks and their *actual calculation sources* are:

- **DNS** — A-record counts, CNAME-owner conflict warnings and distinct
  owner-name counts from the bounded offline DNS record parser.
- **HTTP framing** — UTF-8 request body length, Transfer-Encoding plus
  Content-Length warning counts, and request header count.
- **Security.txt** — contact count, expiry warning and missing required
  metadata warning count using a fixed UTC sample time (2026-11-23).
- **Event correlation** — synthetic three-failure/ten-minute windows,
  ERROR-severity count and number of allowed event records.
- **Token generation mathematics** — raw source-bit count and fixed hex
  or unpadded base64url length for selectable byte counts. The training
  answer uses a synthetic injected byte source for deterministic testing;
  it **does not create a reusable real secret or claim that its fixture
  is cryptographically random**. The real random-token workstation
  continues to use Web Crypto.

The UI offers ten keyboard-accessible tracks, three selectable questions
per track, inline hints, actual calculated answers and corrections, next
navigation, a reset button and a unique correct-case counter. Multiple
correct submissions of one question cannot inflate progress. Input
normalization is bounded and rejects malformed formats.

This is an **open-book client-side teaching system**, not a secure exam.
The expected answers are derived from browser-shipped pure functions; no
exam seal, course certificate, verified student history, fake XP,
account leaderboard or persistently trusted achievements are created.
Progress is in-memory React state only. No data is sent to Supabase or
another backend, and no localStorage/sessionStorage is used.

### Verification and limits

Run:

    node --test tests/eternyx-labs-practice.test.mjs
    node --test tests/eternyx-labs-advanced-practice.test.mjs
    npm test
    npm run build

The new tests require all fifteen additional answers to match the actual
DNS, HTTP, security.txt, event and token-length calculation engines,
reject wrong and hostile answer formats, protect the existing first
fifteen questions and verify a total of thirty unique locally checked
challenges. Manual responsive browser review remains necessary.

No cloud, GPU, paid AI API, network scan, account secret, remote target,
public hosted Labs enablement or Firecracker VM launch is introduced.


## Phase 6 — five advanced browser diagnostics (25 total workstations)

Five more functional browser workstations are implemented as bounded pure
functions in src/lib/eternyxLabsAdvanced.mjs and the responsive
BrowserAdvancedDiagnostics component.

- **IPv6 CIDR** uses exact BigInt 128-bit arithmetic to calculate the
  normalized address, network, end of range and decimal size; supports
  compressed and expanded eight-hextet addresses including /0 and /128.
  It does not model embedded IPv4 addresses, perform DNS, scan a subnet
  or assume all addresses are assignable. IPv6 has no IPv4 broadcast.
- **Cache-Control policy clinic** inspects pasted headers for duplicate
  and conflicting directives, public/private, no-store, no-cache,
  max-age and sensitive-response shared-cache risks. It never fetches
  content or certifies real browser/cache behavior.
- **SPF linter** recognizes a limited set of SPF mechanisms, warning about
  permissive +all, missing termination, ptr, more than ten lookup terms,
  and text after all. It does not resolve DNS, expand macros, recursively
  evaluate include/redirect, or authenticate senders; it is not a full
  RFC 7208 implementation.
- **Token bucket simulator** uses exact bounded integer-second arithmetic
  with capacity 1–100, refill 1–20 tokens per second, and up to 60
  monotonic timestamps in the first hour. It reports each allow/deny
  result. It never sends a request or enforces real server quotas.
- **Subresource Integrity generator** computes true Web Crypto
  SHA-256/SHA-384/SHA-512 digests of the exact entered UTF-8 bytes and
  produces the corresponding SRI attribute. It does not fetch a script,
  modify HTML, or verify origin identity or CORS. Avoid pasting secrets.

All five tools use bounded inputs, accessible labels, clear errors and
mobile-responsive results. The original three restricted iframe
previews and 30 answer-checked local learning scenarios remain intact.

### Merge verification

    node --test tests/eternyx-labs-advanced.test.mjs
    node --test tests/eternyx-labs-operations.test.mjs
    node --test tests/eternyx-labs-advanced-practice.test.mjs
    npm test
    npm run build

Regressions cover exact IPv6 CIDR math, invalid compression, caching
risk warnings, simplified SPF syntax/lookup limits, token bucket
refill decisions and real SHA digest vectors. CI plus manual desktop
and mobile verification is required before shipping.

No hosted Labs, Firecracker/VM activation, paid GPU/cloud/API, real rate
limit, live target scan, certification, billing, or new backend is enabled.


## Phase 7 — 45 calculator-checked practice cases across fifteen tracks

The existing 25 browser workstations now pair with **45 local practice
questions**. The original thirty cases remain in their same positions;
five new tracks each add three real, checked exercises:

- **IPv6:** normalized /64 network address, exactly 256 addresses in a
  /120, and the exact 2^128 decimal address count for /0. Expanded IPv6
  spellings are normalized via the same 128-bit parser used by the tool.
  Decimal answers use BigInt, avoiding JavaScript Number precision loss.
- **HTTP caching:** static warning counts for private/no-store and
  sensitive public caching; a Yes/No check for no-cache revalidation.
  This tests the actual local Cache-Control heuristics, not HTTP traffic.
- **SPF:** lookup-producing term count, permissive +all warning count,
  and mechanism count using the real simplified SPF analyzer. No DNS
  queries, sender validation, or mail delivery is attempted.
- **Token-bucket rate limits:** allowed requests, denied requests and
  remaining capacity after refill, all computed from bounded real
  simulator input. It neither contacts nor throttles an API server.
- **Subresource Integrity:** SHA-384 digest bits, SHA-512 Base64 digest
  character count, and exact UTF-8 byte length. A shared, pure
  inspectSriFormatLocally() helper encodes the digest/format mathematics;
  the actual generateSriLocally() still computes the digest via Web Crypto.
  Format questions NEVER claim that a cryptographic digest was
  calculated for the checked answer.

All 45 answer keys are calculated at grading time from the same pure
engines as the relevant workstations. New cases have inline hints, actual
calculated feedback, retries and keyboard-accessible input. The UI
derives its summary from the live case/track arrays to avoid stale counts.

The 45-case, 15-track in-memory progress counter records unique correct
cases in this page session only. Wrong attempts do not count. No
certification, server-verified grade, course completion, localStorage,
Supabase write, billing, fake XP, leaderboard or externally verifiable
exam achievement is introduced. The answer keys are discoverable in
browser code, as intentionally open-book practice.

### Acceptance gate

    node --test tests/eternyx-labs-five-advanced-practice.test.mjs
    node --test tests/eternyx-labs-practice.test.mjs
    node --test tests/eternyx-labs-advanced-practice.test.mjs
    node --test tests/eternyx-labs-advanced.test.mjs
    npm test
    npm run build

Regressions check all fifteen new correct answers and wrong answers,
BigInt precision and IPv6 normalization, data source agreement for the
five previous tools, real Web Crypto digest compatibility, untrusted
answer refusal and accurate unique progress totals. Test suites also
preserve earlier 30 challenges, 25 workstations, iframe isolation and
offline-only frontend behavior. Manual mobile/desktop UI review is
still required.

Public hosted Labs and paid cloud/GPU/AI services remain disabled. No
remote scanning, host penetration testing, or external traffic is added.


## Phase 8 — five identity and network-defense workstations (30 in total)

The new BrowserIdentityDefense UI and pure eternyxLabsIdentity.mjs engine
add five working exercises with bounded inputs and explicit safety limits:

1. **OAuth PKCE S256:** derive a challenge for a valid 43–128 character
   RFC 7636 verifier, or use crypto.getRandomValues to generate 32 fresh
   bytes and a matching S256 challenge. Real Web Crypto SHA-256 is used,
   including a known RFC 7636 acceptance vector. The verifier is sensitive
   in a real flow; this tool only demonstrates one local step. It does not
   handle OAuth callbacks, authorization codes, tokens, or storage.
2. **HMAC-SHA256:** sign and verify an entered *synthetic* message and
   synthetic shared key with Web Crypto importKey/sign/verify. Input
   keys are neither sent nor included in returned reports. Positive,
   changed-message and changed-key tests verify real integrity checks.
   HMAC verification is not human identity verification, replay control,
   a webhook endpoint, or a complete authentication protocol.
3. **IP CIDR containment:** check whether an IPv4 or IPv6 address belongs
   to a CIDR range. Supports exact 128-bit IPv6 comparisons including
   compressed spellings, IPv4 /0 and /32 and IPv6 /0 and /128.
   Calculates mathematical inclusion, not host assignability, network
   reachability, routing, production ACLs or firewall enforcement.
4. **HSTS policy:** parse a synthetic Strict-Transport-Security header
   value to inspect max-age, includeSubDomains and preload-request
   parameters. Warn about policy removal, short durations and basic
   preload-prerequisite gaps. This is not a website fetch, HSTS browser
   test, or authoritative HSTS preload-list status check.
5. **DMARC policy:** parse a bounded synthetic DMARC TXT record to
   inspect domain and subdomain enforcement, rollout percentage, DKIM/
   SPF alignment and count aggregate-report endpoints *without exposing
   their addresses*. This does not check DNS records, real SPF/DKIM
   evaluation, report authorization or actual mail delivery.

The existing 25 workstations and **45 real locally checked practice cases**
remain unchanged; these five new tools raise the total to 30. Workstations
are discoverable from the same searchable mobile/desktop Labs interface,
with accessible labels, bounded inputs, live result announcements, robust
failure states and instructionally honest caveats.

An asynchronous UI guard discards stale Web Crypto results when inputs
or the selected station change. No tool saves secrets or makes HTTP/DNS
requests, and nothing is uploaded to account storage or Supabase.

### Required release verification

    node --test tests/eternyx-labs-identity.test.mjs
    node --test tests/eternyx-labs-five-advanced-practice.test.mjs
    npm test
    npm run build

The tests cover PKCE RFC vector and secure RNG, real HMAC signatures,
malformed and adversarial inputs, exact IPv4/IPv6 membership,
HSTS settings and malformed headers, DMARC partial/no-enforcement
warnings, hidden report values, browser crypto requirements and unchanged
restricted iframe sandbox. CI must pass and manual desktop/mobile
accessibility checks should be performed before release.

Public hosted Labs and paid GPU/cloud/AI infrastructure remain disabled.
This change launches no Firecracker or Docker instance, introduces no
credential manager, authenticates no user or email, and scans no host.


## Phase 9 — sixty open-book Labs practice challenges, including real Web Crypto grading

Fifteen new interactive questions cover the five identity/network workstations,
bringing Labs to **60 unique questions across 20 tracks** while preserving
the 30 functional browser-only workstations and their underlying tools.

1. **OAuth PKCE:** the exact RFC 7636 S256 known vector, a second synthetic
   verifier-to-challenge calculation and the verifier's character count.
   PKCE answers are checked using a *real asynchronous Web Crypto SHA-256*
   digest, never a fabricated string or pre-approved score. Code challenges
   are Base64url and case-sensitive.
2. **HMAC-SHA256:** an independently verified canonical hex digest, a
   tampered-message failure and an unchanged-message verification. Each
   answer uses the actual Web Crypto sign/verify engine on explicit
   synthetic learning keys and text; no real webhook or credential is
   contacted or authenticated.
3. **IPv4/IPv6 CIDR:** three real containment examples, including the
   mathematical upper address of an IPv4 /24 and exact 128-bit /48
   IPv6 inclusion, computed by the production learning calculator.
   This is not permission to access a host or a firewall/ACL test.
4. **HSTS:** parse one-year max-age, count zero-duration/subdomain warnings
   and inspect includeSubDomains, using the existing static HSTS linter.
5. **DMARC:** count monitoring/rollout/reporting warnings, read a rollout
   percentage and count aggregate-report destinations while never
   displaying their mail addresses or querying DNS.

The original synchronous grading API continues serving the earlier
45 calculator-based cases, preserving existing tests and integrations.
A new **gradePracticeAnswerAsync** entry point handles every question
and uses Web Crypto for the six PKCE/HMAC questions. Crypto-unavailable
browsers receive an explicit error rather than an unverified pass.

The React UI awaits each answer and guards it with a request-generation
counter. Editing an answer, changing questions or tracks, resetting the
session or unmounting the page invalidates any pending asynchronous
answer so stale results **cannot** add credit. Accurate per-track and
total progress remain **in page memory only**. No durable LMS data,
certification, account progress, XP, user identity, ranking, API
credential, database write, external request or paid service is created.

### Release gate

    node --test tests/eternyx-labs-identity-practice.test.mjs
    node --test tests/eternyx-labs-identity.test.mjs
    node --test tests/eternyx-labs-practice.test.mjs
    node --test tests/eternyx-labs-advanced-practice.test.mjs
    node --test tests/eternyx-labs-five-advanced-practice.test.mjs
    npm test
    npm run build

The new suite checks 15 independently derived correct values and
plausible wrong values, the RFC PKCE known vector, cross-checked HMAC
signatures, malformed/hostile submissions, no-crypto refusal,
asynchronous stale-result fencing, unchanged first 45 cases, exact
60-case progress and the original restricted iframes. Manual keyboard,
mobile, and screen-reader verification remains necessary before release.

Hosted Labs, Firecracker, local VM dispatch, live security scanning,
and paid GPU/AI/cloud features remain disabled and unchanged.


## Phase 10 — five cryptography and data-defense workstations (35 total)

The next Labs milestone adds five **working**, strictly client-only
workstations to the 30 previous ones; all 60 open-book client-graded
practice challenges remain in place. Engines live in
src/lib/eternyxLabsCryptoDefense.mjs and the responsive
BrowserCryptoDataDefense React component.

1. **PBKDF2 key derivation.** Real Web Crypto PBKDF2-HMAC-SHA256,
   256-bit output, 16-byte randomly generated salt, and 1,000–150,000
   iterations (limited deliberately for a responsive training page).
   Deterministic test vectors compare with Node's PBKDF2 implementation.
   A synthetic training passphrase is accepted, but **never use this
   as a password manager, account verifier or production storage
   design**. No credentials are stored, transmitted or authenticated.
2. **AES-256-GCM.** Real Web Crypto generates an ephemeral,
   *non-exportable* 256-bit AES-GCM key and fresh 96-bit random IV,
   encrypts an entered synthetic UTF-8 message, decrypts it and
   checks that a single-bit ciphertext modification fails authenticated
   decryption. The key is discarded by the one-shot function, so
   output ciphertext cannot be decrypted later. IV and ciphertext
   are visible, but no key is exported or saved.
3. **TOTP.** Real RFC 6238-style time-based one-time codes using Web
   Crypto HMAC-SHA1, a bounded synthetic secret, an explicit Unix
   timestamp, and selectable six/eight output digits. Timestamps
   are used as *training inputs* rather than live login validation;
   known RFC vectors (59, 1111111109, 1111111111, etc.) are tested.
   This is not real authenticator enrollment or 2FA verification.
   Do not paste real 2FA seeds.
4. **Browser origins.** Compares absolute HTTP/HTTPS URLs by exact
   scheme, normalized hostname and effective port, using the browser
   URL parser. Userinfo and query values are never returned; warnings
   identify the presence of embedded credentials, queries, insecure
   HTTP and loopback-looking hostnames. No DNS resolution, CORS
   authorization, registrable-domain analysis, SSRF protection or
   network requests are performed.
5. **CSV formula neutralization.** Processes up to 30 synthetic
   single-line cells, double-quotes each in RFC 4180 style, escapes
   internal quotes and prefixes an apostrophe for common spreadsheet
   formula triggers. It produces bounded, in-memory, single-column
   CSV text only: no file write, import, workbook formula execution
   or cross-application safety certification. Spreadsheet applications
   have different import semantics; real imports require validation.

All five tools expose their actual computed results and explicit
limitations through accessible labelled controls, safe bounded
error states and mobile-compatible output cards. Async Web Crypto
responses are rejected after input changes, route/selection changes
or component unmount.

### Release acceptance checks

    node --test tests/eternyx-labs-crypto-defense.test.mjs
    node --test tests/eternyx-labs-identity-practice.test.mjs
    npm test
    npm run build

Regression tests cover independent PBKDF2 vectors, fresh cryptographic
salts, AES-GCM ciphertext authentication, actual RFC 6238 OTP outputs,
origin/default-port and URL privacy behavior, bounded CSV quoting,
control-character/input attacks and integration with all 35 catalog
entries. The original three sandboxed preview frames remain restricted
to allow-scripts and existing 60 challenges are not rewritten.

No hosted Labs activation, external security assessment, paid GPU/AI
service, live scanning, database writes or authenticated learner
certificate is introduced. Manual browser and accessibility testing
is still required after automated CI.
