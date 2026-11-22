# ETERNYX Cyber Range — Dedicated Provider Worker (local/staging prototype)

## Current status

This PR provides a **working local Docker per-session provisioner and authenticated worker bridge**, designed for subsequent deployment and security review. It is NOT running anywhere automatically, and it does NOT make `/labs/sessions` a hosted target launcher. `hostedAccessAvailable:false` remains intentional.

The previous PRs delivered browser-only CTF rooms, server-verified forensic casefiles, a runnable developer-local HTTP range, and a disabled-by-default session database. This milestone connects the existing session lifecycle to a dedicated operator-side worker without giving users access to the Docker socket or Supabase service-role key.

## The six core pieces

1. **Managed Compose** (`infrastructure/cyber-range/compose.managed.yaml`): each session is a separate Docker Compose project with an internal-only vulnerable target, a dedicated token-protected gateway, a *dynamically allocated* loopback port, read-only root filesystems, non-root users, CPU/RAM/PID caps, and 15-minute automatic application lifetime.
2. **Fail-closed gateway admission**: managed mode requires a 32-byte random secret encoded as 64 lowercase hex characters. Every request, including the health check, requires `Authorization: Bearer ...`; unauthenticated requests receive 401. The original manually launched local range still runs without this token because it is loopback-only and not in managed mode.
3. **Trusted worker Edge bridge** (`ctf-range-worker`): server secret `CTF_RANGE_WORKER_ENABLED` defaults off; a separate strong `CTF_RANGE_WORKER_TOKEN` authenticates worker requests. The restricted protocol allows only heartbeat, claim, reconciliation, and reporting state. It uses Supabase's server-only secret internally, never returns it to the worker.
4. **Single-operator lifecycle state machine** (`provider/worker.mjs`): an idempotent tick heartbeats, reconciles stopped/expired/crashed instances, checks missing runtime processes, claims one fresh job, and reports a verified state transition. Failure to remove a container keeps the database reservation active.
5. **Host-side Docker adapter** (`provider/docker-runtime.mjs`): session project names are derived strictly from validated UUIDs; Docker is invoked with fixed commands and `shell:false`, remote daemons are rejected, and the child process env is explicitly allowlisted so worker/Supabase secrets cannot propagate to the vulnerable target.
6. **Regression and integration tests**: Node tests cover authorization, prohibited request properties, runtime report fields, token comparison, failure cleanup and secret-safe process environments. A separate Docker smoke workflow boots two isolated managed targets, verifies distinct flags, correct/incorrect tokens and denied target Internet egress.

## Trust boundaries and costs

- **No new hosted compute, paid third-party service, cloud terminal or provider account was created.** Creating and merging this PR has no cloud resource cost beyond existing GitHub CI usage.
- A normal ETERNYX account cannot call the worker bridge: the worker-specific token and feature enable flag are required. `verify_jwt=false` is used only because the endpoint implements an independent long-secret authentication gate; there is no public browser CORS.
- Only the trusted worker Edge Function has the Supabase secret API key. The host-side provider knows only its purpose-scoped worker token and temporary per-instance ingress bearer.
- Vulnerable target containers never see the Docker socket, provider bearer token, Supabase URL, service-role key or customer data. Their Docker bridge is `internal:true`, and only the token-gated gateway has a loopback published port.
- Gateway tokens are generated independently for each session. They are intentionally not persisted in Supabase or returned through `/labs/sessions`. This is developer-local bearer protection, **not** a production browser authentication flow.
- The worker stores no active gateway token across a process restart. A stale orphan may need the next reconciliation/cleanup to reclaim it. The target and gateway stop processing requests after 15 minutes even if the host-side worker dies, but Docker containers/networks still require the cleanup worker.
- Docker containers are not strong multi-tenant VM sandboxes. Production must use microVMs or equivalently reviewed isolation and host-level egress policies, plus separate worker credentials and a secure per-user ingress proxy.
- The worker is a **single-operator** design. It is not safe to have multiple independent workers manipulating the same provider without implementing explicit worker ownership/leases and fencing tokens. Do not enable production ingress using this prototype.

## How to inspect without starting anything

Requirements: Node.js 22, local Docker + Compose v2. Review the repository and the full threat model before executing any intentionally vulnerable target.

    npm run range:provider -- --help
    node --test tests/ctf-range-provider.test.mjs
    docker compose -p eternyx-review -f infrastructure/cyber-range/compose.managed.yaml config --quiet

The last command needs a temporary `ETERNYX_GATEWAY_TOKEN` environment variable of 64 hex digits. It checks syntax only and does not start containers.

## Optional staging-only provider operator flow (NOT performed)

1. Create a dedicated, isolated local test machine (or carefully secured private operator host). Never run the provider on ETERNYX production, Supabase Edge, a shared customer server or a public IP.
2. Deploy the existing **reviewed** `ctf_range_provider` and `ctf_range_sessions` migration, `ctf-range-control`, and the new `ctf-range-worker` Edge Function to a **staging-only** Supabase project.
3. Generate a strong cryptographically secure random worker token (at least 48 characters) and configure `CTF_RANGE_WORKER_TOKEN` and `CTF_RANGE_WORKER_ENABLED=true` in the staging Edge Function environment. Do not print or commit the token. Never send the Supabase service-role key to the host-side worker.
4. On the private operator host, configure `RANGE_PROVIDER_API_URL=https://<staging-project>/functions/v1/ctf-range-worker` and the same `CTF_RANGE_WORKER_TOKEN` in a secret manager, not in repository code, browser code, `.env` committed files or logs.
5. To explicitly opt into *local* workload execution, set `ETERNYX_PROVIDER_EXECUTION=enabled` and `ETERNYX_RANGE_OPERATOR_ACK=LOCAL_ONLY_NO_PUBLIC_INGRESS`. Then run `npm run range:provider -- --once` (one tick) or, **only after operator review**, `npm run range:provider -- --loop` (operator-managed polling process).
6. Operator must manually configure provider `enabled`, `ingress_approved`, `max_active_sessions <= 3` **only inside disposable staging**. The default off/unapproved/zero-capacity state must be retained in production until a public ingress and audited sandbox exist.
7. Use a staging-only test user to make a reservation. Confirm the worker claims it and deploys an isolated Docker stack, that only token-authenticated localhost requests can reach the gateway, that expired/stopping sessions are torn down, and that a failed Docker cleanup never releases capacity.
8. Turn both control-plane provider switches OFF when finished and destroy the staging container projects. Revoke the worker secret; never open the localhost gateway through public tunnels.

## Runtime behavior details

Every worker tick performs: **heartbeat → reconcile → clean/recover → claim one → provision → report running/failure**. It never accepts user-provided Docker image names, commands, hostnames or external URLs. Each Compose project is named `cr-` followed by the validated lowercase UUID with hyphens removed.

The worker does not provide a public target URL or access token through the web app. The local gateway's bearer must remain private to the operator. A real public ingress proxy must authorize each request against the signed-in user's **current** session, bind the session to the correct target, respect expiry/stop immediately, and avoid leaking flags or credentials between accounts.

## Next security milestones before production

- Dedicated provider identity/leases and fencing to protect concurrent workers and prevent stale workers from touching another host's instances.
- Real host-level isolation: per-session microVM or separately hardened container runtime, strictly enforced egress denial, metadata IP blocking and resource cgroups.
- Authenticate ETERNYX users at the browser proxy using short-lived, session-bound signed tokens, with strict CORS, CSRF, cookie/Authorization handling, replay and revocation tests.
- Full crash-recovery integration: idle-timeout/TTL reconciliation even if DB/provider is down, orphan discovery, external auditing and immutable evidence.
- Cost policy: zero active capacity by default, enforced spend cap, per-user caps, admission control and instant operator kill switch.
- Security audit and human-assisted staging acceptance. Only then consider a production external target URL.

## Verification runbook

Run `npm test`, `npm run build`, and the GitHub workflows `Managed Cyber Range Isolation Smoke` and the existing `Cyber Range Local Docker Smoke`. These are meaningful tests of the local runtime, **not** proof the public platform is ready. Verify worker secret handling separately in a staging Edge Function. No production migrations are introduced in this PR.
