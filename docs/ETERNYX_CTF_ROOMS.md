# ETERNYX CTF — starter rooms and secure expansion

## Implemented

Route: /labs/ctf, linked from /labs.

The flow is original ETERNYX training content, following the CTF pattern: choose a target, discover a flag, request graduated hints, submit an answer, and track local practice progress.

| Room | Weakness | Interactive proof | Points |
| --- | --- | --- | ---: |
| The Forgotten Comment | Source information disclosure | Read an HTML source comment | 100 |
| The Other Ticket | IDOR / broken object-level authorization | Change ticket ID to read another account's in-memory record | 150 |
| Guestbook Injection | DOM XSS | Execute an event handler against an intentionally unsafe HTML sink | 200 |
| The Wrong Directory | Directory traversal | Navigate outside a virtual public directory | 250 |

Each challenge uses a sandboxed opaque-origin iframe with allow-scripts only, plus a restrictive document CSP from src/lib/eternyxLabs.mjs. Three graduated hints per room, an exact local flag checker, a target reset, and a local solved counter are included.

## Security and accuracy boundaries

- No real vulnerable server, virtual machine, container, Kali environment, real database or external scanner exists in this release.
- Both correct flags and the grading logic are public client assets. Users can inspect or change them. These are practice points only, not trustworthy grades, achievements or prizes.
- Room solves are stored under the browser's localStorage key eternyx_ctf_practice_progress_v1 and are not synchronized with user accounts. Invalid room IDs are ignored on load.
- The iframe does not receive same-origin, top-navigation, form submission, pop-up or download permissions. The iframe CSP disables fetches, workers, external subresources and forms. Inline script is used deliberately for local learning.
- An iframe and CSP are not a complete security boundary for arbitrary attacker-authored code; same-frame navigation may be possible. Do not paste secrets or trust it as a remotely hostile multi-user execution service.
- This feature changes neither production Supabase RLS nor sign-in, subscriptions, billing, or customer privileges.

## Requirements for hosted Hacker101-class CTF

1. Separate dedicated lab infrastructure for short-lived, isolated per-learner challenge containers or micro-VMs; never host intentionally exploitable services in the main ETERNYX or Supabase production runtime.
2. Private, server-generated flags with authenticated server-side grading; append-only solved events under account-scoped RLS and tamper-resistant score and certificate rules.
3. Expiring lab URLs or authenticated reverse proxies, strict network egress, cloud metadata blocks, no access to internal endpoints, tenancy isolation, quotas, TTL, idle shutdown, and automated cleanup.
4. Additional web, API, authentication, SQLi with a disposable database, file uploads, SSRF with isolated mock services, Linux, network, cryptography, forensics, and secure development tracks.
5. Internal isolation penetration testing, reproducible vulnerable fixtures, admin audit logs, cost limits, concurrency caps, and verification before customer access or charging.
6. Original training challenges, not copied Hacker101 content, with consistent difficulty, hints and solution write-ups.

## Verification

Run node --test tests/eternyx-ctf.test.mjs and npm run build.
Manually verify all four mini-apps, flag submissions, hints, reset, refresh, offline/local storage, and mobile/desktop layouts in a real browser.
