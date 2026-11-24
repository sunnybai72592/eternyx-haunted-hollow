# Docker Phase 38 — genuine operator-host read-only preflight (NOT live execution)

**Prerequisite:** merged Phase 37 / PR #702. Earlier phases bind Ed25519 claims, permanent journals, exact per-container recovery locks, pinned rootless Docker Engine and hardening policy, a hash-pinned Docker ELF through fd 3, and a root-owned two-file Docker client config. The remaining critical release blocker is **independently observed behavior on a real, isolated, operator-owned Linux host**. Offline GitHub tests cannot substitute for that.

Phase 38 implements a **new real host-only preflight command**, without changing the existing execution agent or enabling Docker mutation. The tool is designed to be run later by an independently authorized operator, not as an unattended staging check. The report intentionally **cannot grant production or staged mutation approval**.

## Seven related improvements

1. **Explicit safe invocation:** `node scripts/docker-lab-host-preflight.mjs --read-only FULL_64_HEX_CONTAINER_ID start|stop|restart`. Exactly one operation and one full pinned disposable target are required. Root, GitHub Actions, CI and any enabled lab execution flag are refused.
2. **Independent physical host prerequisites:** Require non-root Linux operator ownership, root-owned pinned ELF and root-owned minimal Docker client config (the full Phase 35–37 gates), no inherited Docker CLI environment overrides, operator-owned non-public Unix Docker socket, and the existing independently approved daemon/image/policy pins.
3. **Two complete read-only observation rounds:** From the approved CLI fd3 and verified `--config`, the tool runs only Docker `context show`, exact pinned `context inspect`, pinned rootless `info` and one full-ID `container inspect`. It runs them **twice** using a stricter preflight-specific command allowlist. No `start`, `stop`, `restart`, `exec`, `run`, `pull`, `build`, login or network/cloud requests.
4. **Original daemon and sandbox policy verification:** The rootless Engine ID, context, UNIX endpoint, rootless security options, disabled swarm and disposable container image/security/network-none policy must match the independent pins on both rounds; changes in the managed target's lifecycle, PID, timestamp, restart epoch or network-none state refuse acceptance. A configured intent of `stop`, `restart` or `start` must match the observed real pre-state.
5. **Fail-closed local recovery inventory:** Run the real two-pass, bounded, private claim/agent/container lock inventory before and after the CLI reads. Any UNKNOWN, attempted-only, reserved-only, legacy failed, unacknowledged or retained lock **refuses** preflight. Even an acknowledged legacy `failed` claim cannot be promoted to approval. Never auto-clean, append, acknowledge or replay anything.
6. **Sanitized cryptographic evidence:** Return one bounded JSON result with domain-separated SHA-256 commitments for exact target/context/daemon/policy/image/CLI/config/history, observation status and source fields. Never print Docker inspect JSON, the daemon ID, raw command arguments, client configuration, secret environment values, host socket path, Docker credentials or private signing keys.
7. **Explicit no-release assertions and offline coverage:** Every successful result says `independentHostIdentityVerified:false`, `independentPhysicalIsolationVerified:false`, `serverRevocationVerified:false`, `signedPermitVerified:false`, `productionDeploymentAuthorized:false`, `stagingDockerMutationAuthorized:false`, `dockerMutationExecuted:false`, `receiptIssued:false`, `autoRetryAuthorized:false`. Node tests exercise real private journal files, synthetic pinned rootless daemon/targets, unsafe states, daemon swaps, policy drift, changed histories, parser failures and the real CLI's refusal under CI. Dedicated GitHub workflow never invokes Docker or Supabase, and reruns the prior Phase 26–37 suites.

## Operator prerequisites (external manual task, not completed by merging)

- Separately approve a physically isolated, single-tenant rootless Linux machine, its kernel/storage/OS, network egress, operator account and Unix Docker socket. Do not operate on a shared or production Docker daemon.
- Install the independently reviewed root-owned ELF binary and read-only Docker config described in Phases 35–37. Preserve `ETERNYX_DOCKER_AGENT_CLI_PATH`, `ETERNYX_DOCKER_AGENT_CLI_SHA256`, `ETERNYX_DOCKER_AGENT_CONFIG_DIR`, `ETERNYX_DOCKER_AGENT_CONFIG_SHA256`, and the existing `ETERNYX_DOCKER_AGENT_CONTEXT`, `ETERNYX_DOCKER_AGENT_ENDPOINT`, `ETERNYX_DOCKER_AGENT_DAEMON_SHA256`, `ETERNYX_DOCKER_AGENT_IMAGE_SHA256`, `ETERNYX_DOCKER_AGENT_POLICY_SHA256` independently in your change-control record.
- Have an existing operator-owned, real, private recovery journal directory (`~/.eternyx/docker-lab-journal`, mode 0700). It must contain **no unresolved claims/locks**. If it does, stop for incident review; do not delete files to force a pass. The preflight itself does not create the directory.
- Have a real disposable, managed, no-network, no-mount container that independently passes all existing policy checks. Supply its **full** 64-character lowercase ID and the operation whose pre-state you want checked.
- Keep `ETERNYX_REMOTE_LAB_ENABLED` and `DOCKER_REMOTE_LAB_ENABLED` unset or disabled. Do not set these switches to run preflight.

Example (the operator supplies *all* pins from approved configuration, not from this document):

```sh
env -u ETERNYX_REMOTE_LAB_ENABLED -u DOCKER_REMOTE_LAB_ENABLED \
  node scripts/docker-lab-host-preflight.mjs --read-only \
  FULL_64_CHARACTER_LOWERCASE_ID stop > /PRIVATE/phase38-host-preflight.json
```

Do not share raw journal, hostname, daemon output or other host secrets in an issue, chat, or general workspace. Treat the output as sensitive operational metadata even though its fields are sanitized. Retain the report and its SHA-256 in the separate human-controlled release review.

## What passing actually means

The tool has locally observed a pinned CLI/config, operator-accessible Unix-socket rootless Engine and disposable target **at that moment**. It has not independently proven that the machine was physically isolated, that Docker is correctly confined against host escape, that the signer/permits or deployed server are operational, or that network/host behavior persists after the inspection. It does not simulate actual start/stop/restart effects. A root/kernel compromise or forged local Docker daemon can still manufacture plausible observations.

**Release blockers remain:** human-host physical isolation and OS/security review, separately approved real staged synthetic mutation/interrupt/revocation/receipt drills, independent server deployment and owner A/B RLS, loss-of-receipt holds, and deliberate two-sided opt-in. No automatic execution eligibility or production deployment is derived from this preflight, and CI passes without contacting a live Docker host.
