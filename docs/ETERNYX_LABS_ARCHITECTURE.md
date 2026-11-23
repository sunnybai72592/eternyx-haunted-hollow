# ETERNYX Labs — execution architecture and expansion plan

## Shipping in Phase 1

Route: /labs (public, browser-only). Navigation entry is visible on desktop and mobile. The Cybersecurity Hub and Developer Studio link to the same route, not separate duplicate labs.

Fifteen **working**, browser-only exercises (ten existing and five additional network/security fundamentals):
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

**Truthful limits:** The fifteen browser-only workstations do not provide a Kali Linux VM, an exploitable remote backend, isolated Linux commands, live scanners, real lab credentials, graded certification, or authenticated learner progress. Separate CTF and local Docker range routes have their own capabilities, prerequisites, and safety contracts. Do not imply otherwise in the UI. Labs never request a target domain or IP and never execute remote tests.

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

An additional **practice and check** section on /labs contains 15 real
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
