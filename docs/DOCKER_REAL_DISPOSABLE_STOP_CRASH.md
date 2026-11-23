# Docker Phase 24 — one approved real disposable container stop plus worker SIGKILL

This phase follows merged PR #587 and advances from real Linux journal durability to an **operator-invoked real rootless Docker state change** followed by a **real SIGKILL of the disposable worker**. It is a *single, explicitly approved stop* of a pre-running, pinned, hardened disposable container—not a production deployment, a remote signed-agent acceptance, or automatic crash recovery.

**Do not run this on a connected, shared, privileged, production or customer Docker host.** Before touching Docker, the operator and a different person must physically inspect and approve the isolated host, firewall/uplink/network, exact source and image, approved stop window, and rollback procedures. The software's environment approval text is not independent physical attestation.

## Six operational controls

1. **Independent site sign-off and identity pins.** Approved non-root Linux host with rootless local Unix-socket Docker; an independently pinned clean Git commit, context, socket, daemon SHA-256, full 64-character container ID, image digest and managed-container policy fingerprint. No IPv4/IPv6 default routes; kernel forwarding disabled. The normal Phase 20 real-host read-only acceptance must already pass with no unresolved live agent journals.
2. **Only one previously running disposable container.** The host acceptance inspector must recognize hardened local-lab labels; nonroot numeric user, read-only rootfs, network none, no mounts, ports, extra privileges, devices or auto-restart, resource caps. The separate live-stop validator rejects an unsafe target, different security policy, non-pinned image or a container that is already stopped. No container create, build, start, restart or exec.
3. **Permanent one-use permit.** A separately granted UUID is written to an owner-private, fsynced, exclusive .used record *before* the child can mutate Docker. The record permanently binds the approved commit, container, separate run directory, specific agent/claim IDs. The same permit UUID cannot run again. A failed run consumes its permit; never delete it to retry.
4. **Two host gates and an exact single mutation.** The parent validates the live network/host admission and actual running Docker inspect. The child independently reruns the full read-only host gate and hardening guard, fsyncs a private reserved/attempted journal and lock, and executes **only one** `docker --context PINNED container stop --time 5 FULL_CONTAINER_ID`. It never edits live ETERNYX agent journals.
5. **Real worker crash and unknown journal.** After the stop CLI returns, the supervisor sends real OS SIGKILL to **that exact child PID**. There is intentionally no completed or failed journal outcome. The supervisor reopens the durable journal, retains the stale lock, confirms a duplicate claim is refused, and independently checks the actual pinned Docker container state is exited.
6. **Second host inspection and private evidence.** The operator wrapper repeats the actual pinned read-only rootless Docker/network inspection, rejects identity/image/policy/route or real-journal drift, writes fsynced private evidence and prints only bounded metadata. No remote receipt, signed dispatch, production opt-in, automatic restart or retry.

## Strict host setup

Use the approved merged commit on a physically isolated, operator-owned Linux machine with Node.js 22+, Git, iproute2, rootless Docker and the already prepared **running** disposable test container. No default routes, forwarding, network access for test container, customer workloads or production secrets. Retain separate written approval for **one real Docker stop** by a second reviewer; collect a human witness record and the exact independent pins.

Complete Phase 20 instructions at DOCKER_REAL_HOST_NETWORK_GATE.md before starting. The following variables must already be set from **independent records**, not the inspection output:

- ETERNYX_DOCKER_APPROVED_COMMIT_SHA
- ETERNYX_DOCKER_HOST_CONTEXT
- ETERNYX_DOCKER_HOST_ENDPOINT
- ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256
- ETERNYX_DOCKER_HOST_CONTAINER_ID
- ETERNYX_DOCKER_HOST_IMAGE_SHA256
- ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256 (approved managed-container policy digest)
- ETERNYX_DOCKER_HOST_SOCKET_SHA256 (independently approved hash of actual local socket endpoint)
- ETERNYX_DOCKER_HOST_ROUTE_SHA256 (independently approved IPv4/IPv6 route snapshot digest)
- ETERNYX_DOCKER_HOST_READONLY_APPROVAL=I_APPROVE_LOCAL_DOCKER_INSPECTION
- ETERNYX_DOCKER_HOST_NETWORK_APPROVAL=I_APPROVE_LOCAL_NETWORK_INSPECTION

Never set DOCKER_HOST, DOCKER_CONTEXT, DOCKER_CONFIG, Docker TLS/API overrides, ETERNYX_REMOTE_LAB_ENABLED=true or DOCKER_REMOTE_LAB_ENABLED=true.

## Manual operator execution — requires an approved change window

Only after actual independent site approval, **and only on the disposable rootless host**, create a directory outside the source checkout and the real ETERNYX agent journal tree:

    umask 077
    mkdir -p -m 700 "$HOME/eternyx-private-disposable-stop"
    export ETERNYX_DOCKER_LIVE_STOP_PRIVATE_DIR="$HOME/eternyx-private-disposable-stop"
    export ETERNYX_DOCKER_LIVE_STOP_APPROVAL=I_APPROVE_ONE_DISPOSABLE_PINNED_STOP
    export ETERNYX_DOCKER_LIVE_STOP_SITE_WITNESS=INDEPENDENT_PHYSICAL_ISOLATION_REVIEW_COMPLETED

Set ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID to the **independently approved new lowercase UUID** for this one change. From the clean pinned repository root:

    node scripts/docker-host-network-evidence.mjs --inspect
    node scripts/docker-host-live-stop-crash-drill.mjs --one-disposable-stop > "$HOME/eternyx-private-disposable-stop/operator-output.json"

The worker does a second full rootless host inspection immediately before the actual Docker stop. The unique private run directory contains the fsynced claim journal, stale lock and live-stop-crash-evidence.json. The permit .used record remains in the parent directory. Store the original files, hashes and independently witnessed process/host data securely outside Git. Do not upload host paths, secrets, private journals or Docker inspect payloads publicly.

**No automatic cleanup** of the stopped container, stale lock, claim or permit. A separate approved recovery/rollback must assess the actual container state before any future change. An attempted journal with no outcome is **uncertain** by design, even if the separate live Docker inspection observes an exited state. The result is a real observed state change, not proof of original signed agent behavior.

## What completion does and does not establish

A successful *field run* establishes that a pinned disposable Docker container was observed running before, observed exited afterward, a single Docker stop was reported to have returned, an actual worker SIGKILL occurred, and the original fsynced attempted journal and stale lock survived. That does **not** independently attribute the stop to the command, attest physical isolation, prove remote signed permit handling, or validate actual server receipt reconciliation.

The report always preserves `actualSignedAgentInterrupted=false`, `originalSignedDispatchTested=false`, `serverReceiptVerified=false`, `automaticRetryAuthorized=false`, `stagingDockerExecutionAuthorized=false` and `productionDeploymentAuthorized=false`.

The next separately authorized milestone is an actual signed-agent interruption with pinned staging dispatch and a carefully reviewed network path to staging, followed by idempotent receipt-only recovery. The offline host in this phase cannot contact hosted Supabase.

## GitHub CI boundary

Run `node --test tests/docker-live-stop-crash-gate.test.mjs`. These unit tests use fake in-memory Docker inspect objects and exercise refusal paths only; **no Docker Engine is contacted and no real container is changed by CI**. CI success is not field acceptance.
