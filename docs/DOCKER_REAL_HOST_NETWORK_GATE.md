# Docker Phase 20 — real isolated-host network acceptance (operator only)

This follows merged PR #548. Unlike offline CI fixtures, this procedure must be executed **by an explicitly approved human operator while physically present at a separately isolated, operator-owned Linux rootless Docker lab host**. A merge, green CI run, or pasted example JSON does **not** complete acceptance.

## Entry conditions — independent operator and reviewer

1. Obtain documented written lab-window authorization for a named disposable host, exact source commit, full container ID, reviewed image ID, local socket, daemon fingerprint and network change boundary. A second person must independently verify host ownership, physical uplink/switch/VLAN separation, firewall/egress controls and absence of production/customer workloads. Preserve that original review outside the host.
2. Connect locally, not through a shared production Docker daemon, remote proxy, hosted GitHub runner or privileged CI agent. Use a non-root Linux account on its own rootless daemon. Never expose the Unix socket through TCP, SSH or a tunnel.
3. Independently inspect the intended disposable image and container before running acceptance; these scripts do **not** start or modify either. A separate approved test-container preparation step is required if none already exists. The managed container must have hardened labels and limits required by the existing Docker managed-target guard: network none, no ports, read-only rootfs, no mounts/devices/capabilities, non-root user and no restart policy.
4. Keep server/agent remote lab flags disabled and production credentials off the machine. Check Linux IPv4 and IPv6 forwarding are off and the host has **no default IPv4 or IPv6 routes**. This is deliberately more restrictive than normal host operation. Read-only checks cannot prove physical isolation or deny every directly reachable subnet; independent physical/network review remains mandatory.
5. Ensure iproute2, Docker CLI, Git and Node.js 22+ are installed. Pre-create the private recovery-journal directory after checking it is not a symlink: mkdir -p -m 700 ~/.eternyx/docker-lab-journal. Do not clear unknown locks or journals.

## Operator-only invocation

Use a clean checkout of the **approved, merged** commit, not an arbitrary branch; confirm Git has no tracked modifications. In a private terminal on the isolated host, set the independent pins required by [the PR #548 read-only host runbook](DOCKER_HOST_READONLY_ACCEPTANCE.md):

- ETERNYX_DOCKER_HOST_READONLY_APPROVAL = I_APPROVE_LOCAL_DOCKER_INSPECTION
- ETERNYX_DOCKER_HOST_NETWORK_APPROVAL = I_APPROVE_LOCAL_NETWORK_INSPECTION
- ETERNYX_DOCKER_APPROVED_COMMIT_SHA — exact reviewed 40-character lowercase commit SHA
- ETERNYX_DOCKER_HOST_CONTEXT, ETERNYX_DOCKER_HOST_ENDPOINT
- ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256, ETERNYX_DOCKER_HOST_CONTAINER_ID, ETERNYX_DOCKER_HOST_IMAGE_SHA256

Unset all Docker host/context/config/TLS/API overrides. The source checkout and pinned Docker metadata must be independently reviewed. Do not calculate a pin from the output being verified.

Run from the repository root, using a private evidence directory **outside Git**:

    umask 077
    mkdir -p -m 700 "$HOME/eternyx-private-host-acceptance"
    node scripts/docker-host-readonly-acceptance.mjs --preflight
    node scripts/docker-host-network-evidence.mjs --inspect > "$HOME/eternyx-private-host-acceptance/host-network-evidence.json"
    sha256sum "$HOME/eternyx-private-host-acceptance/host-network-evidence.json"

The network evidence command performs read-only Linux route/forwarding observations **before** Docker inspection, validates the exact clean approved Git revision, calls the #548 pinned read-only Docker CLI, then re-reads host routes to detect changes. It rejects any default route, forwarding enabled on either address family, failed/changed Docker policy, stale observation, wrong source commit, unresolved claim, rootful daemon or remote execution opt-in.

It does not invoke Docker run, start, stop, restart, exec, build, create or any remote server. It prints only sanitized metadata (hashes, counts, explicit limitations). It does not persist approvals or private keys. The operator must store the output as an owner-private file and retain the independently observed network evidence off-host via approved channels; do not upload sensitive details to public CI artifacts.

## Review, pass criteria and blockers

A passing JSON report means *only* that a real local rootless Docker Engine and host routing/forwarding **were reported as observed** under supplied pins. The report always says externalNetworkIsolationProved=false, independentHostAttestation=false, controlledCrashRecoveryTestPerformed=false, stagingDockerExecutionAuthorized=false, and productionDeploymentAuthorized=false.

Before declaring Phase 20 host acceptance, a separate reviewer must confirm: exact source and host pins match independent records; output is genuine, complete and timestamped in the approved window; a locally witnessed repeat run yields the expected policy; legacy journals and locks were reconciled; physical uplink, DNS, cloud metadata, IPv4/IPv6 egress and LAN lateral paths were assessed independently; no product or production execution flag was enabled. A successful no-default-route check alone is **not** egress proof. Record failures or missing evidence as **BLOCKED**, never as green acceptance.

## Only after host acceptance: separate controlled crash-recovery window

Crash-recovery is a **separate, explicitly approved operation** and must not be launched by this read-only gate. Require a reviewed disposable lab-only plan, release/agent/server key pins, independent authorization and documented rollback. Start with observation-only journal review. Then, in a later authorized testing window, exercise a disposable signed operation under an operator's supervision: interruption before Docker attempt, interruption after fsynced attempted record, interruption after postcondition observation but before receipt acknowledgement, and duplicate/lost receipt replay. Capture witnessed Docker state and durable journal transitions after each interruption.

At every interruption, **never automatically re-run a claimed Docker mutation** or remove a stale lock/journal. Follow [Docker Lab Recovery](DOCKER_LAB_RECOVERY.md) for manual triage and receipt-only recovery only when a terminal outcome was actually recorded and server acceptance is authorized. Preserve evidence for independent review. Do not enable public or production Docker execution based on these checks.

## CI boundary

Run node --test tests/docker-host-network-evidence.test.mjs locally to check negative policies without contacting Docker. This is **not** on-host acceptance. GitHub CI must never claim to have run the manual host drill. Nothing in this PR enables remote Docker labs, deploys Supabase, mutates Docker, or performs crash-recovery operations.
