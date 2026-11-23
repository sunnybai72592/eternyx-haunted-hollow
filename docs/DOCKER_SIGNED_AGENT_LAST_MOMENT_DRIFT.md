# Docker Phase 29 — recheck the exact signed target immediately before mutation

Follows merged PR #629 (Phase 28). That PR pinned the **actual** signed agent to an independently reviewed rootless Docker daemon, local Unix socket, image and managed-container policy, but a mutation still relied on the **earlier** container inspection after the daemon was rechecked. During that interval another local actor could restart the same-ID container, change its policy or change its network isolation. An unchanged Docker ID and security fingerprint are not enough to establish that the **same runtime instance** is still being operated.

This phase closes that gap in the real signed agent, `scripts/docker-lab-agent.mjs`, while retaining the original Ed25519 permit checks, permanent claim reservation and Phase 26 unknown-outcome lock hold. It **does not** enable production execution or run Docker in GitHub CI.

## Six bounded improvements in one update

1. **Second pinned Docker target inspection:** after the agent's second rootless daemon/context/socket verification and after `reserved → attempted` is durably recorded, the agent re-inspects the exact 64-character container ID with its already pinned local Docker context. This happens **immediately before** the one signed mutation.
2. **Same runtime instance:** compare the first and last-moment `State.Running`, `Status`, `StartedAt`, `FinishedAt`, `Pid`, `ExitCode`, `Paused`, `Restarting`, `Dead` and `RestartCount`. Any change is **UNKNOWN** and blocks the Docker mutation, even if both snapshots say `running` and the image/policy fingerprint is unchanged.
3. **Independent image/policy/network enforcement:** run the signed-agent policy gate on *both* captures with the independently reviewed image and policy pins. Refuse missing `NetworkSettings.Networks` or `Ports` metadata, networked containers and any published ports. A missing field is not proof of isolation.
4. **Refuse unsafe process states:** `Paused`, `Restarting` and `Dead` are explicitly rejected on both sides of a signed mutation even if another status field misleadingly reports a running instance.
5. **Tight expiry and lifecycle checks:** recheck the server-signed permit expiry **after** the last-moment inspect and before the mutation. For `start` or `restart`, a reported successful postcondition also requires a changed `State.StartedAt`; for `stop`, `State.FinishedAt` must change. All completion reports still require the existing postcondition check and policy/image pin.
6. **Offline regression coverage and runbook:** test identical snapshots, changed PID/restart epochs, missing fields, unsafe network metadata, false completion, and source ordering against the real agent. Dedicated CI includes the prior signed-protocol and recovery tests. There is **no Docker Engine contact** in CI.

## Failure behavior

A mismatch or unreadable second inspect occurs **after** the original `attempted` boundary; the agent records **no terminal outcome or signed receipt**. Its exclusive lock and original attempted-only claim remain intact for investigation. This is a deliberate fail-closed outcome, not permission to retry. The actual mutation is not called by this agent when reinspection fails; that alone does not independently establish that no other process changed the Docker container.

An observed new Docker start/stop epoch is **not independent proof that the agent itself caused the change**: another actor could race after the final read. Physical isolation, a uniquely controlled rootless Docker host, signed site approvals and a real staged interruption exercise remain prerequisites. This change narrows the race window; it cannot mathematically eliminate all time-of-check/time-of-use races.

## Operator boundary

The Phase 28 variables remain required for `--execute-lab`: exact `ETERNYX_DOCKER_AGENT_CONTEXT`, `ETERNYX_DOCKER_AGENT_ENDPOINT`, `ETERNYX_DOCKER_AGENT_DAEMON_SHA256`, `ETERNYX_DOCKER_AGENT_IMAGE_SHA256`, and `ETERNYX_DOCKER_AGENT_POLICY_SHA256`. They must be provided by a separate independent operator record, not copied from a signed job. No changes to the server contract, database privileges, hosted Edge Function, or default-disabled remote lab feature gates.

`--resend-receipt` remains receipt-only; it does **not** call the new Docker gate and must never be used on an attempted-only UNKNOWN claim.

Tests:

    node --test tests/docker-signed-agent-last-moment-gate.test.mjs
    node --test tests/docker-signed-agent-engine-gate.test.mjs
    node --test tests/docker-agent-attempt-disposition.test.mjs

**CI passing is not live-rootless-host acceptance.** No customer or production workload should be used for field verification.
