# ETERNYX Labs — execution architecture and expansion plan

## Shipping in Phase 1

Route: /labs (public, browser-only). Navigation entry is visible on desktop and mobile. The Cybersecurity Hub and Developer Studio link to the same route, not separate duplicate labs.

Five **working**, local exercises:
1. Web developer playground — edit HTML, CSS and JavaScript, explicitly run a restricted iframe preview.
2. DOM XSS practice — inspect the difference between an HTML sink and a text sink with controlled, local input.
3. HTTP header clinic — deterministic checks against pasted header text; no outgoing HTTP requests.
4. SQL injection defense — display string concatenation versus PostgreSQL parameter binding (no SQL execution).
5. Access control — deterministic viewer/editor/admin policy decisions (not an authorization enforcement service).

**Truthful limits:** Phase 1 does not provide a Kali Linux VM, an exploitable backend application, isolated Linux commands, live scanners, CTF flags, real lab credentials, graded certification, or persistent learner progress. Do not imply otherwise in the UI. Labs never request a target domain or IP and never execute remote tests.

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

## Phase 2 — disposable range runner (NOT implemented)

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
