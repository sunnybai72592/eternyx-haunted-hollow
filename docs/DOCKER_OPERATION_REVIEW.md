# ETERNYX Docker operation review and owner authorization

This milestone adds real authenticated, durable **review and approval records** for Docker operations. It does **not** execute operations remotely, expose Docker sockets, or claim that registered keys prove physical machine ownership.

## Scope

- A signed-in owner explicitly opts in (policy defaults disabled; max 1-10 requests per rolling 24 hours). Disabling cancels all outstanding unexpired and expired pending/approved requests with audit events.
- Create up to 3 unexpired plans at a time, each expiring after 10 minutes. Only start, stop or restart and complete 64-character lowercase Docker IDs are accepted. No arbitrary commands or host URLs.
- New plans require a key-verified, non-revoked agent belonging to that same user AND a signed Docker engine report received in the previous 3 minutes. This is a signed observation, **not independent host attestation**.
- Requests are idempotent by (owner_id, request_key). Reusing a key with different operation parameters is rejected; an identical retry gets the same plan.
- Owners explicitly approve with a per-request phrase, reject, or cancel. SQL protects state transitions, expiry, owner IDs, recent report freshness and disabled policy even if the API is bypassed. All transitions are audited.
- The owner can retrieve the approval plan and a copyable **local preview command**. That preview runs no command in the browser or server.
- On an operator-controlled trusted workstation, the previously shipped `docker-operator.mjs` remains available for standalone, locally confirmed lifecycle actions on hardened, labeled, network-isolated test containers. The operator should **not** treat unsigned copied commands as proof of server-side approval; the local CLI does not yet cryptographically consume these plans.

## Deployment

Apply migration `20261123050000_docker_operation_review.sql` after identity enrollment and signed report migrations, using a staging environment first. Deploy `docker-control` Edge Function (authenticated-user JWT required) and ensure `docker-enrollment` and `docker-heartbeat` are deployed if not already. The browser route is `/integrations/docker-control` after deployment.

## Limits, security and billing

No server side Docker invocations, cloud provisioning, Docker registry writes, customer token storage, webhook forwarding or paid infrastructure in this PR. New tables have RLS + owner-only SELECT, revoked anon and authenticated writes, and only service-role invoker SQL RPCs may mutate state after Edge checks a verified JWT.

Approval is NOT an execution grant or API credential; do not build a worker that accepts copied unsigned commands as authoritative. A production remote-control service requires signed command envelopes, server-side ownership attestation, per-agent authenticated delivery, atomic claims/leases, runtime sandbox verification, audited signed receipts, quotas, explicit incident revocation, and independent security testing.

## Testing

Run `node --test tests/docker-control.test.mjs`. Contract and migration-security checks are not a replacement for staging integration tests. Test owner A vs owner B reads and mutations, anonymous denial, disabled policy, stale reports, idempotency, high concurrent rates, approver phrase, expiry, policy disable cancellation, and RLS with authentic JWTs. Then run Supabase security advisors.
