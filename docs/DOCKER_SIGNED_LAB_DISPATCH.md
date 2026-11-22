# ETERNYX Signed Lab Docker Dispatch — operator-gated proof-of-concept

**Not a general-purpose remote Docker control plane.** This is a deliberately limited, opt-in, manually polled execution path for operator-owned, network-isolated Docker lab containers. No customers should enable it on shared production hosts. No daemon socket is publicly exposed.

## Ten integrated safety and functionality improvements

1. Account-owned operation approvals from PR #400 remain required, with explicit owner policy enabled.
2. One-time agent-signed claim requests: Ed25519 authenticates the enrolled key; each signed request uses a random nonce and strict timestamp window.
3. Atomic claim using SQL row locks and a unique request_id prevents a request from being assigned twice.
4. Independent agent-specific replay nonces, 12 signed requests/minute guard and short-lived claims (45s).
5. A *second* agent-signed authorization call rechecks approval, active policy, agent revocation and fresh signed heartbeats.
6. Server-issued Ed25519 permit is pinned and verified by the agent; signature binds agent, claim, request, exact 64-digit Docker ID, operation and 15-second expiry.
7. Explicit two-sided opt-in: Edge `DOCKER_REMOTE_LAB_ENABLED=true` and operator `ETERNYX_REMOTE_LAB_ENABLED=true` **plus** `--execute-lab` per invocation.
8. Local Docker context must be Unix/npipe, target must satisfy all hardened `verifyManagedTarget` rules (read-only root, no network, no mounts, drop capabilities, non-root, PID/memory limits). No arbitrary Docker flags or shell.
9. Mandatory private local audit before execution. Agent signs completed/failed/guard_denied receipt; server stores it as an **agent report**, not independent Docker success proof.
10. Read-only owner-visible dispatch state, protected RLS, isolated tests and a runbook. No network streaming, arbitrary execution, paid cloud provisioning or customer credential handling.

## Setup (staging only)

1. Apply previous enrollment, signed-report, and operation-review migrations first, then `supabase/migrations/20261123070000_docker_signed_command_dispatch.sql` on staging; verify owner A/B RLS and migrations using real DB tests.
2. Generate the *server signing key* on a protected operator machine:

```sh
node scripts/docker-lab-keygen.mjs /ABSOLUTE/PRIVATE/server-signing-key.pk8
```

3. Configure the server secret `DOCKER_LAB_SERVER_PRIVATE_KEY_PKCS8_B64` with the *base64 of the DER key file* (never commit the secret). Obtain the printed **publicKey** and save just that base64url string to a **trusted, operator-owned local public key file** for the agent. Protect against substitution.
4. Deploy `docker-command-dispatch` with `verify_jwt=false`; it requires Ed25519 agent signatures on *all* actions, never uses browser JWT or CORS. **Do not turn on the server execution flag yet**.
5. Enroll the agent, send a fresh signed Docker heartbeat, enable the owner's review policy, create and approve a request in `/integrations/docker-control`.
6. On a trusted operator-owned Linux Docker Engine, create **a disposable lab container**, pinned to a reviewed image digest, that passes the existing `verifyManagedTarget` safeguards (labels `io.eternyx.operator.managed=true`, `io.eternyx.operator.scope=local-workbench`, `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 128m --user 10001:10001 --restart no`, no mounts, no host namespaces, no device access). Confirm its full 64-byte container ID.
7. After staging security review only, explicitly set server `DOCKER_REMOTE_LAB_ENABLED=true` and invoke a single manual agent poll:

```sh
export ETERNYX_REMOTE_LAB_ENABLED=true
export ETERNYX_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
node scripts/docker-lab-agent.mjs AGENT_UUID /ABSOLUTE/AGENT-PRIVATE.pem /ABSOLUTE/PINNED-SERVER-PUBLIC.key --execute-lab
```

Agent makes at most one claim per invocation. If no request, it exits without Docker mutation. All commands have fixed argv, no shell and fixed local endpoint. Docker socket access is root-equivalent; do not run this on shared hosts or run untrusted images.

## Operational limits

- **Never ship these enable flags to public production** before independent security review, signed receipt reconciliation, recovery protocol, server-side agent ownership attestation and tenant-safe isolation.
- The `DOCKER_REMOTE_LAB_ENABLED` flag is off unless explicitly configured; the operator CLI also refuses to run without explicit opt-in.
- Claims are *at most once*: expired claims are **not** retried automatically; if a permit is issued but lost, its job stays consumed. Check the local audit and human-reconcile. Cancellation/revocation after the server issues a 15-second permit leaves a small race window; do not treat this model as immediate revocation.
- `reported_completed` is an agent-signed self-report; the server cannot independently prove Docker executed successfully. Missing receipts remain `claimed`, not a fabricated success.
- `docker_command_claims` and nonce tables cannot be inserted/modified by browser-authenticated users; only verified server-side requests can mutate them.
- No container IDs, paths, tokens, logs or Docker credentials should be pasted into public issues.

## Tests and review

`node --test tests/docker-command-dispatch.test.mjs`. Run CI build, all tests, SQL staging integration: A/B cross-account, revoked/disabled/expired owner approvals, multiple concurrent claims, duplicate signed nonce, second authorize, invalid permit, local guard rejection, lost receipt, reconnect and recovery. Check Supabase security advisors and audit logs before enabling lab execution.
