# Docker Phase 23 — actual Linux SIGKILL and fsynced journal durability

This follows merged PR #578. This is an **actual kernel process termination** on a disposable child process, never a simulated process crash. A separate operator-owned isolated Linux rootless Docker host must be used for real acceptance; GitHub CI is **not** that host.

## What this tests

Three disposable worker processes use the existing production recovery journal implementation to create an exclusive agent lock and a fsynced, append-only claim journal in separate private directories. The parent receives an IPC acknowledgement after fsync and sends SIGKILL only to the worker PID. It then checks the actual exited child, persisted journal and stale lock, the exact expected reserved/attempted/terminal events and duplicate-claim refusal. The real pinned rootless Docker host, managed disposable container, routing and existing live claim journals are inspected **read only before and after**, with a fail-closed drift comparison. No container start/stop/restart/exec and no remote network call is made.

The workers are **not real signed agents**. This proves actual local filesystem and process crash behavior, NOT real signed-agent crash recovery, remote receipt handling, or independent physical host isolation. Terminal failure is deliberately written to the isolated disposable journal, not produced by a real Docker container mutation.

## Prerequisites

- Independent written authorization for a named physical operator-owned, truly isolated Linux rootless Docker host, with reviewed uplink/firewall/LAN controls and no production/customer workloads. Complete the Phase 20 runbook (DOCKER_REAL_HOST_NETWORK_GATE.md), with exact clean approved Git commit and Docker daemon/context/Unix socket/image/container pins. Independent human site review is required; a green PR does not count.
- Unprivileged Linux operator, Node 22+, installed Docker CLI, iproute2 and Git. IPv4/IPv6 default routes absent; both kernel forwarding settings off. Remote lab flags unset or false, no Docker CLI overrides, no production secrets. Never expose the Docker socket.
- All *real* ETERNYX agent journals reconciled before starting; the existing real-host acceptance refuses unknown or incomplete journals and locks.
- An independently created owner-private 0700 drill directory, neither within nor an ancestor of the actual ETERNYX agent journal directory. The test retains unique per-run private evidence and locks; it never modifies actual agent claims.

## Operator invocation

Set the Phase 20 environment pins: ETERNYX_DOCKER_APPROVED_COMMIT_SHA, ETERNYX_DOCKER_HOST_CONTEXT, ETERNYX_DOCKER_HOST_ENDPOINT, ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256, ETERNYX_DOCKER_HOST_CONTAINER_ID, ETERNYX_DOCKER_HOST_IMAGE_SHA256. Then explicitly opt in:

    umask 077
    mkdir -p -m 700 "$HOME/eternyx-private-kernel-drill"
    export ETERNYX_DOCKER_SIGKILL_PRIVATE_DIR="$HOME/eternyx-private-kernel-drill"
    export ETERNYX_DOCKER_SIGKILL_DRILL_APPROVAL=I_APPROVE_DISPOSABLE_LOCAL_SIGKILL_DRILL
    export ETERNYX_DOCKER_HOST_INDEPENDENT_SITE_CLEARANCE=SITE_REVIEW_COMPLETED_OFFLINE
    export ETERNYX_DOCKER_HOST_READONLY_APPROVAL=I_APPROVE_LOCAL_DOCKER_INSPECTION
    export ETERNYX_DOCKER_HOST_NETWORK_APPROVAL=I_APPROVE_LOCAL_NETWORK_INSPECTION
    node scripts/docker-host-kernel-sigkill-drill.mjs --run > "$HOME/eternyx-private-kernel-drill/operator-stdout.json"

The script creates a unique private run directory, leaves its original journal/lock evidence intact, and fsyncs an observation.json. It reports only hashes, claim IDs, and explicit nonauthorization limitations. Store private evidence outside Git; do not upload private host materials publicly.

## Pass and failure

Required observations: rootless live host preflight passed, three **real child SIGKILLs** occurred after fsync, all journals and locks survived, duplicate claims were denied, exact daemon/container/image/route/policy/journal fingerprints were unchanged on a second live read-only host inspection.

A reserved journal records no attempt. An attempted journal with no terminal result stays **unknown** regardless of observed container state. A terminal 'failed' journal in this drill represents only the *disposable child journal*, never a real failed Docker command. If any step is missing, drifting, invalid or interrupted, report BLOCKED; preserve evidence for manual review. Never remove a stale live agent lock or rerun a claimed Docker mutation.

The output always identifies realSignedAgentCrashed=false, realEndToEndCrashRecoveryCompleted=false, automaticRetryAuthorized=false, stagingDockerExecutionAuthorized=false and productionDeploymentAuthorized=false. Separate independent on-host acceptance, real disposable Docker agent crash injection, actual postcondition review and authorized staging signed-receipt reconciliation remain mandatory before production consideration.

## CI boundary

The dedicated CI executes real Linux child SIGKILL and fsynced private-file checks **on the CI runner**, but never a Docker host. It cannot substitute for the explicitly authorized isolated physical host trial.
