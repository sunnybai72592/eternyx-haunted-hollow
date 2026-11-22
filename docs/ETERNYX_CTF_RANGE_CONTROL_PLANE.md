# ETERNYX Cyber Range — Session Control Plane v1

## Scope and status

This PR adds the **database and authenticated API foundation** for future per-account hosted lab sessions. It does **not** deploy a cloud provider, start Docker on Supabase, provision a VM, attach a browser terminal, or issue a public lab URL.

The earlier **local** Docker cyber range at `infrastructure/cyber-range/` remains runnable on a developer's own machine. The new `/labs/sessions` route is a separate operator-gated session dashboard, not a remote terminal.

## Implemented guarantees

| Layer | Delivered |
| --- | --- |
| Database | `ctf_range_provider` singleton: `enabled=false`, `ingress_approved=false`, capacity=0 by default |
| Database | `ctf_range_sessions` with owner foreign key to `auth.users` and cleanup-safe status lifecycle |
| Quotas | 1 active session per account, 3 requests per account/24h, max 3 active reservations globally, fixed 15-minute expiry |
| Atomicity | Postgres transaction advisory lock protects the capacity decision; partial unique index protects per-user active sessions |
| Worker contract | Service-only SQL functions to claim queued work and report running/stopped/expired/failed transitions |
| Authorization | Read-only owner-scoped RLS for user records, no client writes, provider config inaccessible to users |
| Edge API | Authenticated `ctf-range-control`: status, list owner sessions, request reservation, request stop |
| UI | `/labs/sessions` with real provider status, real account session history, disabled start when no approved ingress, truthful offline states |
| Tests | Strict request contract and static RLS/quota/route tests in Node CI |

### The operator gate is intentionally fail-closed

Both `enabled` and `ingress_approved` must be explicitly true, with a fresh provider heartbeat (under 60 seconds) and positive capped capacity before reservation SQL can accept a session. New installations default to disabled, unapproved and capacity zero. No unreviewed provider is connected by this PR.

The Edge API returns `hostedAccessAvailable:false` because no authenticated ingress has been implemented. Accordingly, the **Request isolated session** button remains disabled even if the database reports a capable provider. This is not a simulated feature: users see precisely why it cannot yet launch.

### Session lifecycle

- `queued` — reserved slot awaiting external worker claim; only possible after operator activation and successful quota check.
- `provisioning` — an external trusted worker claims a queued request using `ctf_range_claim_queued_session()`.
- `running` — worker must report a bounded, opaque provider instance reference and start time using `ctf_range_report_session()`. No session URL is ever returned by this release.
- `stopping` — user stop request or expiry is recorded; capacity is **not** released until the worker proves cleanup.
- `stopped`, `expired`, `failed` — terminal outcomes; old records remain visible to the owning account but do not consume an active slot.

An expired queued reservation may be expired by the reservation function; an expired provisioning or running session transitions to `stopping`, where it continues consuming capacity until a provider confirms shutdown. A dedicated worker/cron sweep is **still required** before hosted use. We do not pretend cleanup is operating continuously.

### Important security boundaries

- `authenticateUser(req)` validates the Supabase Auth bearer token. No request body `user_id`, score, worker address, Docker image, arbitrary command, memory limit, or session URL is trusted.
- Database functions are SECURITY INVOKER and callable only through the trusted service-role context, never through an authenticated browser RPC.
- Session results use an explicit allowlist; browser responses do not contain worker IDs, provider instance references, URLs, API credentials or session auth tokens.
- Global capacity is a **reservation** quota, not proof that a real VM exists or that host CPU is available.
- `ctf_range_provider` and mutating RPCs must remain inaccessible through anon/authenticated Data API roles. Verify grants/RLS with staging acceptance tests.
- The secure ingress gateway and user-specific short-lived access tokens must be implemented and security tested **before** the operator can approve session access.
- Never mount Docker sockets or put Supabase service credentials inside intentionally vulnerable training containers. Host all vulnerable services and provider credentials on a dedicated, isolated control-plane environment.
- A service-role key is highly privileged. A production range provider must use carefully scoped credentials and mTLS/signed worker requests where possible, not a service-role key embedded in a vulnerable target.

## Deployment checklist — not executed here

1. Review and migrate `supabase/migrations/20261122180000_ctf_range_session_control.sql` in staging, not production.
2. Deploy `ctf-range-control` with `verify_jwt=true`, and verify anonymous requests return 401. Confirm the status action correctly reports offline/unapproved.
3. With two test users, verify SELECT RLS isolation; anon/authenticated INSERT/UPDATE/DELETE and mutating RPC calls must be rejected.
4. In a staging-only transaction, enable provider capability with a fresh heartbeat and capacity 1, simulate concurrent requests from two users, and confirm at most one reservation is granted.
5. Validate owner session idempotency, 3-per-24h user limit, stop ownership, expired queue cleanup, stopping capacity retention, and worker claim/report state transitions.
6. Deploy a separate dedicated, security-reviewed worker and a secure ingress proxy; validate real instance lifecycle, image provenance, egress isolation, identity binding, idle shutdown, cleanup after crashes, and resource metrics.
7. Only after the worker, ingress, and kill switch are independently verified should an operator set `ingress_approved=true` and enable managed sessions with bounded capacity.
8. Verify that a normal account cannot see another account's session or obtain provider internal identifiers, and verify no charges are possible without explicit activation.

## Local tests

    node --test tests/ctf-range-control.test.mjs
    npm test
    npm run build

These repository tests check pure request contracts and source/security invariants. They are **not** a substitute for a staging Postgres concurrency/RLS test or live provider penetration test. Production schema migrations and Edge Function deployment are independent of GitHub merge.

## Next major milestone

Implement a separate provider that periodically reports health, claims queued sessions, boots a unique disposable target for one verified user, authorizes traffic through a dedicated short-lived ingress proxy, terminates workloads on stop/expiry and reports immutable event evidence. Enforce a strict zero-default compute budget, one-session-per-user bound, and real sandbox containment before connecting the provider to a public ETERNYX route.
