# Docker Phase 28 — pin the real signed-agent Docker Engine and disposable target

Follows merged PR #622 (Phase 27). Earlier signed dispatch required a valid Ed25519 signed server permit and the target's management labels, yet the *actual signed agent* accepted any configured local Docker context/Unix socket and did not independently pin the Docker daemon identity, image ID or security-policy fingerprint. An approved claim might therefore target a different local daemon/image than the operator reviewed.

This PR adds a **real pre-execution control** in `scripts/docker-lab-agent.mjs`. No production execution is enabled, and no Docker daemon is used in GitHub CI.

## Independent operator pins (required for `--execute-lab` only)

On an *operator-owned Linux host*, obtain separately reviewed values from a **read-only** rootless Docker inspection and keep them in protected operator-controlled configuration. Never derive the independent pins from the signed claim JSON alone.

- `ETERNYX_DOCKER_AGENT_CONTEXT` — exact local Docker context name
- `ETERNYX_DOCKER_AGENT_ENDPOINT` — exact canonical `unix:///run/user/UID/docker.sock` (example only)
- `ETERNYX_DOCKER_AGENT_DAEMON_SHA256` — SHA-256 of `ETERNYX_DOCKER_HOST_DAEMON_ID_V1\n` followed by the exact verified Docker daemon `info.ID`
- `ETERNYX_DOCKER_AGENT_IMAGE_SHA256` — independently reviewed 64-character Docker image ID (without `sha256:`)
- `ETERNYX_DOCKER_AGENT_POLICY_SHA256` — independently reviewed `fingerprintLabContainer` security-policy fingerprint for that specific managed container

Do **not** set `DOCKER_HOST`, `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_TLS_VERIFY`, `DOCKER_CERT_PATH`, `DOCKER_API_VERSION`, `DOCKER_TLS` or `DOCKER_TLS_CERTDIR`. A matching but environment-override socket is still refused. The operator must be non-root, and this execution path refuses CI environments.

The server's signed permit still independently binds the particular `agentId`, `requestId`, `claimId`, operation, full container ID and short expiry. Local pins are **additional constraints**, not substitutions for the server's Ed25519 signature or customer authorization.

## Seven concrete safety improvements

1. The actual agent rejects remote, named-pipe, relative, parent-traversal, URL-escaped, whitespace-bearing, unpinned or symlinked Docker endpoints. Socket must be a real operator-owned Unix socket, not world-writable.
2. Before polling for a claim, `localContext()` confirms the exact operator-pinned active Docker context and its actual endpoint.
3. It reads `docker --context PINNED info`, validates the original daemon ID SHA-256, requires **rootless Docker** and **inactive Swarm**. Any drift refuses the signed session.
4. After signed permit verification and before attempting mutation, the agent checks that the target has the precise independently pinned image ID and managed security-policy SHA-256, including read-only rootfs, non-root user, resource caps, capability drop and no-new-privileges.
5. It refuses unexpected network attachments, published ports, or incorrect initial state. `stop`/`restart` require an already running hardened target; `start` requires an exited or created target.
6. After fsyncing `attempted` but before calling Docker's mutation command, the agent **repeats rootless daemon/context/socket checks**, plus the signed permit expiry. Failure leaves the original journal and lock unresolved and signs no false terminal receipt.
7. The agent repeats image, policy and network checks after mutation before allowing its original `labPostcondition` to record `completed`. An ambiguous postcondition follows Phase 26 UNKNOWN/manual-review behavior.

## Non-mutating receipt-only recovery is unchanged

`node scripts/docker-lab-agent.mjs AGENT_ID /ABS/AGENT.pem /ABS/SERVER.key --resend-receipt CLAIM_UUID` remains an explicitly authorized *receipt-only* mode that does not run `localContext()` or contact Docker. It requires the existing durable terminal claim; UNKNOWN attempted-only journals are never eligible.

## Tests and acceptance

`node --test tests/docker-signed-agent-engine-gate.test.mjs` verifies rootless/non-Swarm admission, local context, daemon pin, image/policy isolation, unsafe-network refusal, lifecycle-state checks, and actual signed-agent call ordering. The dedicated workflow additionally runs existing signed-protocol/recovery tests.

GitHub CI uses **synthetic Docker inspect/info objects** and an agent-refusal subprocess. No real socket is contacted; no live Docker Engine is changed, no Ed25519 secrets or Supabase credentials are used. Independent operator host approval, physically isolated staging acceptance and real signed-agent crash/recovery evidence are still mandatory before any release.

Never run this against customer workloads, shared hosts or production without separate security and operational authorization.
