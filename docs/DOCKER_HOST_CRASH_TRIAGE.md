# Docker Phase 21 — real crash-journal triage on a pinned isolated host

This milestone follows merged #563 (read-only real-host network acceptance). It addresses a genuine operational gap: the normal acceptance command *must* refuse incomplete crash journals, yet operators still need to inspect one exact unresolved claim and the current **real Docker Engine state** without repeating the failed/uncertain command.

**The script does not create a crash, restart a process, start/stop a container, claim an internet service, or deliver a receipt.** It is a diagnostic step for a crash/recovery test separately initiated by an approved operator. Offline CI is never a replacement for evidence from an actual isolated Linux host.

## Human approvals before on-host use

- Physical owner and an independent site reviewer first complete and retain the original real-host acceptance under [Phase 20](DOCKER_REAL_HOST_NETWORK_GATE.md). This is not an electronic substitute for independent inspection.
- Use a Linux unprivileged local account on its own rootless Docker daemon, an approved disposable container and a clean, independently pinned 40-character repository commit. Never run from CI, a production machine or against a customer container.
- Investigate the process list independently. You must establish that the relevant agent has **actually stopped** before authorizing triage; the script only records the operator's clearance and does not prove process absence. **Do not delete a stale lock** to pass this check.
- The local claim is read from the existing owner-private durable recovery journal. It must be **exactly one** unresolved pinned claim. Any other unresolved claim, unknown journal, lock for a different agent, bad ownership, or invalid record must block this procedure.
- Keep ETERNYX_REMOTE_LAB_ENABLED and DOCKER_REMOTE_LAB_ENABLED disabled, and unset Docker TLS, host, context, API, cert and config overrides. Do not provide Supabase or production secrets. Linux IPv4 and IPv6 kernel forwarding must be disabled and no default routes may be present.

## Use — operator-only, read-only

From the approved repository checkout on the authorized isolated host:

    umask 077
    export ETERNYX_DOCKER_HOST_CRASH_TRIAGE_APPROVAL=I_APPROVE_READ_ONLY_CRASH_TRIAGE
    export ETERNYX_DOCKER_RECOVERY_PROCESS_CLEARANCE=I_VERIFIED_NO_AGENT_PROCESS_RUNNING
    export ETERNYX_DOCKER_HOST_READONLY_APPROVAL=I_APPROVE_LOCAL_DOCKER_INSPECTION
    export ETERNYX_DOCKER_HOST_NETWORK_APPROVAL=I_APPROVE_LOCAL_NETWORK_INSPECTION

Also set ETERNYX_DOCKER_APPROVED_COMMIT_SHA, ETERNYX_DOCKER_HOST_CONTEXT, ETERNYX_DOCKER_HOST_ENDPOINT, ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256, ETERNYX_DOCKER_HOST_CONTAINER_ID, ETERNYX_DOCKER_HOST_IMAGE_SHA256 to independently reviewed exact pins as in Phase 20. Do not reuse unverified pins from the output being audited.

Inspect the existing journal without contacting Docker:

    node scripts/docker-lab-recovery.mjs CLAIM_UUID

If independently authorized, collect the real host evidence into an owner-private file **outside Git**:

    node scripts/docker-host-crash-triage.mjs --triage CLAIM_UUID > /ABS/PRIVATE/crash-triage.json

The command inspects a single permitted unacknowledged claim, verifies the live local socket/context/rootless daemon, exact container identity, hardening policy, no Docker networking, two stable container inspections, an approved source commit, no default Linux routes and disabled forwarding. It does not execute any Docker mutation. It never removes a claim or lock.

## Interpret the actual observed evidence

A claim with only "reserved" has not recorded an attempted command. A claim with "attempted" but no outcome is **uncertain**: the Docker command might or might not have run. The observed current container state (e.g., exited) does not prove which action caused it. A terminal completed/failed/guard_denied journal missing a receipt remains **unacknowledged**; this triage does not send or authorize the receipt. In every state, automatic retry is denied.

The sanitized JSON includes the claim journal stage, current container running/status observations, pinned daemon/container/image/policy hashes, routing hash and explicit limitations. The output always declares mutationOutcomeIndependentlyVerified=false, automaticRetryAuthorized=false, receiptOnlyReplayAuthorized=false, independentHostAttestation=false, externalNetworkIsolationProved=false, controlledCrashRecoveryTestPerformed=false and productionDeploymentAuthorized=false.

**Failure or missing evidence = BLOCKED.** Store and independently review the private output and its SHA-256 with the true on-host witness. Never claim that offline unit tests, a GitHub merge or a self-reported status proves host isolation or real crash-recovery success.

## Next, a distinct controlled interruption window

Only after on-host acceptance and a specific authorized disposable execution plan: separately test (1) process interruption after a durable reservation but before Docker, (2) after fsynced attempted before a terminal outcome, (3) after a recorded terminal outcome before server receipt, and (4) duplicate/lost server receipts under controlled staging connectivity. Capture actual process exit, the fsynced journal, live Docker state and server records. Each injected interruption has to be witnessed; no automatic container retry or stale-lock clearing.

See [Docker Lab Recovery](DOCKER_LAB_RECOVERY.md) for manual analysis and narrowly scoped receipt-only recovery. The actual signed-agent and server integration need separate staging authorization and connectivity; this offline, no-default-route host cannot itself prove that cloud-side receipt handling works.

## CI safety

GitHub Actions only runs source-level, fake-CLI tests to ensure fail-closed behavior and no write commands. It does not contact any Docker Engine, run a process crash, replay a receipt, deploy functions, create containers or run a staging host.
