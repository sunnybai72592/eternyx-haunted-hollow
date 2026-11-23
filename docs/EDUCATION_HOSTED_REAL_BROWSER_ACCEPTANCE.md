# Education real staging browser acceptance — protected read-only release gate

**Purpose:** verify actual learner and instructor React screens using three prepared, separate Supabase Auth identities on a genuinely isolated staging project. This is a manually approved **read-only verification**, not production acceptance, and does not create or submit an exam.

Run **Education real browser staging acceptance (read only)** in GitHub Actions from the protected `main` branch after a trusted reviewer approves the `rls-staging` environment. The manual `approve_read_only_browser` checkbox must be selected. No other branches, forks, pushes, or pull requests can run this real-account workflow.

## Browser acceptance (22 fixed checks)

Run in both **1440 × 900 desktop** and **390 × 844 mobile** browsers. Each identity gets a fresh isolated browser context.

- **Student A:** can sign in and open private assessment history; the **exact official finalized grade** matches the approved synthetic A score and maximum; pending-review, running, and historical legacy attempts never display any grade or percentage; cannot open Student B's finalized results.
- **Student B:** can sign in and open private history; the **exact official finalized grade** matches the approved synthetic B score and maximum; cannot open Student A's finalized results.
- **Approved instructor:** can sign in and see the protected, verified instructor private workspace, without issuing a draft write, review write, or grade finalization.
- **Two global checks:** no unintended remote database writes, **and** no network requests to any host except the exact secured staging Supabase origin or the local loopback preview.

That is **10 role/grade checks per viewport plus two global network checks**. A visible finalized label alone is no longer sufficient for acceptance: the displayed numbers must match the staging-reviewed, independently verified receipt fixture.

## Staging network controls

The browser accepts only requests to the local `http://127.0.0.1:4173` preview or the exact `https://<approved-staging-ref>.supabase.co` API host (default TLS port). HTTP to the API, third-party GETs, other loopback ports, foreign Supabase projects, and lookalike domains are aborted and cause an acceptance failure. This prevents leaking private student data even in URL query strings.

Only Supabase password-token exchange and an exact allowlist of **read-only Education RPCs plus the read-only `is_admin` role lookup** may use POST; all other POST, PUT, PATCH and DELETE requests are aborted and cause failure. Optional visitor-presence tracking started on the **public sign-in screen** is silently aborted and **never transmitted**. The same event triggered by a protected exam, result, or instructor page is a violation. If a staging account lacks its expected profile and tries a profile insert, the browser aborts it and the run fails.

All staged database guards and approved scores are rechecked before building the disposable frontend, and the browser itself requires the pinned repository/main context, distinct production/staging project refs, required result fixture IDs, and bounded reviewed marks.

## Protected setup

The existing `rls-staging` GitHub environment must contain a separate, reviewed Supabase project and current reviewed Education migrations/row-level security functions. Use dedicated student A, student B, and approved instructor accounts whose profiles and access grants are already staged. Populate the existing environment secret names for staging URL, publishable key and those three account passwords. Set reviewed final A/B, pending A, running A and legacy A attempt IDs, plus exact A/B score and maximum values as environment variables.

This workflow does not provision staging, write migrations, create profiles or enroll users. Use the `Education hosted staging configuration inventory` workflow first to identify absent configuration names without connecting to Supabase.

A dedicated **offline real-function security test** runs in normal CI and as the first hosted workflow step, without Playwright, secrets, staging, or a browser. It drives the actual network guard with synthetic requests, including third-party GET exfiltration, login-presence suppression, cross-project destinations, and disallowed review/exam/finalizer writes.

## Evidence and release boundary

The uploaded JSON contains only the source SHA, GitHub run and attempt IDs, each fixed check name and passed/blocked state. It contains **no URLs, student IDs, emails, grades, passwords, JWTs, browser storage, screen recordings, screenshots, traces or downloaded answer texts**.

Even a green real browser read-only suite does **not** prove irreversible answer writes, instructor provisional-review updates, official-grade finalization or production release safety. Run the separately approved and evidenced hosted Education exam journey against independently isolated staging after a backup and human review. Until then **production release stays NO-GO**.
