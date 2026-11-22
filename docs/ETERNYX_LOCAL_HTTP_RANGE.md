# ETERNYX Local HTTP Cyber Range — First Container Proof of Concept

## What is implemented

**Three genuinely network-backed HTTP vulnerabilities**, within a deliberately exposed but strictly local training app:

| Room | Route | Intended flaw | Runtime flag |
| --- | --- | --- | --- |
| Ticket Ownership | GET /api/tickets?ticket=101 | IDOR: no owner check on numeric ticket IDs | Another synthetic ticket contains the flag |
| Document Root Escape | GET /api/files?name=welcome.txt | Directory traversal: no /public directory enforcement, but enforced disposable range root | An in-range private fixture contains the flag |
| Operations Role Spoofing | GET /api/ops/report | Client-supplied X-Lab-Role header trusted as authorization | Training operations report contains the flag |

The flags use cryptographic random bytes at **each target start**. The app has a local POST /api/verify checker with an in-memory 10-attempt/minute limit. This is practice-only scoring, not trusted ETERNYX account progress.

### Safety controls in this PR

- It is a developer-local container, NOT a remotely hosted public or multi-tenant range, and it MUST NOT be deployed on the ETERNYX main domain, cloud server, public IP, or shared workstation.
- Docker Compose exposes ONLY `127.0.0.1:8765:8080`. The private target bridge is `internal: true`. Always verify Docker host port binding and effective egress on your actual Docker version before use.
- The image runs as UID/GID 10001; root filesystem is read-only; Linux capabilities are dropped; `no-new-privileges` is enabled; PID and CPU/memory limits are configured; only /tmp has a 16MB tmpfs.
- No host bind mounts, Docker socket, Supabase API keys, production secrets, cloud credentials, production data, or shared ETERNYX login state are included.
- The directory traversal challenge is *bounded to the disposable lab root*, so it cannot trivially read /etc/passwd or production files through the challenge endpoint.
- Request handlers reject non-loopback Host values, omit CORS, restrict responses with security headers, and apply a small local flag submission limit.
- The server shuts down after 1800 seconds (30 minutes). The Compose stack is `restart: no`; start/reset can be used only through a **local Docker daemon**. Reset recreates the entire container and rotates all flags.
- Node-only automated HTTP tests verify intended vulnerability behavior, the bounded filesystem guard, random flag rotation, wrong flags, cross-origin submission rejection, rate limit, and source-level container rules.

IMPORTANT: Docker isolation is not a secure multi-tenant execution boundary. Container escape risk, user access to other host processes, and local network policy vary by host. This proof of concept is NOT approved for use against real customer data or untrusted concurrent visitors.

## Local developer use

Requirements: local Docker with Docker Compose v2 (for example Docker Desktop), Node.js 22+, npm, and a checkout of the ETERNYX GitHub repository.

From the repository root:

    npm run range -- start

After the CLI reports a healthy target, open `http://127.0.0.1:8765` on the same computer.

Lifecycle:

    npm run range -- status
    npm run range -- logs
    npm run range -- reset
    npm run range -- stop

`reset` destroys and recreates the container, rotates flags and resets its in-memory state. A newly started target also expires automatically after 30 minutes. Restart does not restore the previous flags.

### Example local HTTP interaction

On a machine where you explicitly started the local range:

    curl 'http://127.0.0.1:8765/api/tickets?ticket=101'
    curl 'http://127.0.0.1:8765/api/rooms'

The first returns an owned synthetic ticket; the second returns only challenge metadata. Learn to inspect the request, identify missing authorization checks, and find the flags by experimenting with the local challenge routes.

The local flag checker accepts a JSON body with `roomId` and `flag`, and returns `accepted` and `accountVerified:false`. Do not confuse it with the distinct account-linked `/labs/verified` Supabase backend.

## Verification scope

The GitHub CI test suite runs real Node HTTP integration tests (no Docker required) and checks the Compose security attributes; `npm run build` checks site routing. **This is not a Docker runtime integration test**. No hosted service has been provisioned.

After PR merge, a maintainer with Docker must run:

1. `docker compose -f infrastructure/cyber-range/compose.yaml config` (validate syntax and effective security limits).
2. `npm run range -- start`, then inspect Docker-reported port `127.0.0.1:8765` and container network isolation.
3. Visit `http://127.0.0.1:8765` and reproduce all three local HTTP challenge behaviors.
4. Confirm local flag verification works and rejects wrong flags; reset and prove previous flag is invalidated.
5. Confirm target cannot reach the external network or ETERNYX private infrastructure; confirm CPU/RAM/PID limits and read-only filesystem.
6. Confirm after 30 minutes the service has stopped and cannot restart automatically.
7. Run a container security review (Docker network isolation, kernel/capabilities, symlinks, path traversal boundary, localhost DNS rebinding, request limits) before any non-local testing.

## Strictly NOT implemented yet

No remote lab start buttons, browser-based terminal, per-account session orchestrator, Kubernetes deployment, web proxy, lab tickets, cloud workload, persistent user flags or scores, or public URLs. No paid compute has been purchased or activated.

## Next implementation gate: multi-tenant cyber range

To support end users remotely, use a **separate, purpose-built provider/cluster** with ephemeral microVMs/containers, per-learner network namespaces, an authenticated session proxy, host-level egress policy, 3–30 minute TTLs, concurrency and budget limits, audited lab lifecycle, automatic cleanup, immutable images and per-player server-side flag validation. Never reuse this single-user local Compose file directly as a public multi-user cyber range.

## Helpful references

- https://docs.docker.com/engine/network/port-publishing/
- https://docs.docker.com/reference/compose-file/networks/
- https://docs.docker.com/reference/compose-file/services/
