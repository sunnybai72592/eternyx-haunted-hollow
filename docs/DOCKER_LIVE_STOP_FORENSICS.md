# Docker Phase 25 — original real-stop crash evidence reconciliation

PR #596 introduced a single real Docker stop of a pre-approved disposable container, followed by SIGKILL of the **disposable local worker**. This phase adds an **operator-invoked real-host read-only forensic review** of the original claim, permit, stale lock, private observation bytes and the **current real rootless Docker Engine**.

Neither PR proves that the physical host run has actually happened. The operator must conduct and witness both procedures on their own independently isolated Linux host. This review does not run the real signed remote agent, mutate containers, write to journals, contact Supabase, replay receipts or clean locks.

## Why a second review is needed

After one-time Docker stop, a process can die having written only `reserved → attempted`. The current Docker state may be `exited`, but that does **not** establish causality, whether a subsequent actor changed the container, or a successful signed remote agent mutation. An unverifiable result must be **UNKNOWN** and blocked from replay, not silently marked successful.

This phase checks a different set of facts from earlier Phase 22: *actual retained Phase 24 one-use permit + exact original private claim/lock + current real Docker container status*.

## Seven independent safety checks

1. Verify the **original event's separately approved 40-character source SHA** and the **current review tool's separately approved 40-character checkout SHA** as distinct inputs. They need not match; a later review should not masquerade as an earlier source build.
2. Require exact independently reviewed rootless host daemon SHA-256, Unix socket hash, full container ID, image digest, managed-container policy hash and IPv4/IPv6 routing hash. Require the fresh Phase 20 read-only acceptance with no unresolved *real agent* journals.
3. Open the original `live-stop-crash-evidence.json`, `claim-UUID.jsonl`, `agent-UUID.lock` and parent `approved-stop-permit-UUID.used` through owner-private, bounded, no-symlink file descriptors. Refuse unknown run files, extra JSON fields, contradictory flags or a directory outside the approved private parent.
4. Independently hash original raw file bytes; compare SHA-256 against the recorded permit, journal and lock hashes. Validate exact permit-to-claim/agent/container/original-source/run-directory binding and timestamp order, within a seven-day retrospective window.
5. Reopen the **real journal parser**, not simply a report's assertions: only `reserved → attempted`, no terminal outcome, no receipt, and a retained stale lock are eligible for this specific review. Never infer a terminal result.
6. Inspect the actual pinned Docker container as `exited` **twice** using read-only `container inspect`; compare lifecycle timestamps, image/policy constraints and hardening. Perform fresh before-and-after rootless host/network admission, checking daemon/socket/route/policy and normal live agent journal inventory remain stable.
7. Re-read all original files after live inspection to detect mutation of the evidence while the review runs. Emit a sanitized JSON with verified hash/identity correlations and explicit unproven-causality/non-authorization fields.

## Real-host invocation

Only after an independently witnessed, separately approved **real Phase 24 field run**, use an unprivileged Linux operator on the same truly isolated rootless Docker host. Set the Phase 20 read-only environment, with remote Docker lab and cloud dispatch disabled. Never use customer data or production credentials.

**Two different source pins:** `ETERNYX_DOCKER_LIVE_STOP_ORIGINAL_COMMIT_SHA` is the actual approved source revision recorded when the one-use stop was performed; `ETERNYX_DOCKER_APPROVED_COMMIT_SHA` is the exact **current** clean review checkout revision, verified by Phase 20. Do not overwrite the original pin with the newer review commit.

All pins must come from independent host-owner and human witness records, **not** values copied from the files being reviewed:

- ETERNYX_DOCKER_LIVE_STOP_ORIGINAL_COMMIT_SHA
- ETERNYX_DOCKER_APPROVED_COMMIT_SHA
- ETERNYX_DOCKER_HOST_CONTEXT
- ETERNYX_DOCKER_HOST_ENDPOINT
- ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256
- ETERNYX_DOCKER_HOST_SOCKET_SHA256
- ETERNYX_DOCKER_HOST_CONTAINER_ID
- ETERNYX_DOCKER_HOST_IMAGE_SHA256
- ETERNYX_DOCKER_LIVE_STOP_POLICY_SHA256
- ETERNYX_DOCKER_HOST_ROUTE_SHA256
- ETERNYX_DOCKER_LIVE_STOP_PERMIT_ID
- ETERNYX_DOCKER_LIVE_STOP_PRIVATE_DIR

Explicit manual approvals for this read-only review:

    export ETERNYX_DOCKER_LIVE_STOP_FORENSIC_APPROVAL=I_APPROVE_READ_ONLY_LIVE_STOP_REVIEW
    export ETERNYX_DOCKER_HOST_READONLY_APPROVAL=I_APPROVE_LOCAL_DOCKER_INSPECTION
    export ETERNYX_DOCKER_HOST_NETWORK_APPROVAL=I_APPROVE_LOCAL_NETWORK_INSPECTION

Then, from the independently pinned clean Phase 25 repository checkout:

    node scripts/docker-host-live-stop-forensics.mjs --review /ABS/PRIVATE/eternyx-real-docker-stop-XXXXXX > /ABS/PRIVATE/forensic-result.json

Replace the run path with the **genuine, exact existing private Phase 24 run folder**. The command reads the `.used` permit in that run's parent, rechecks exact original bytes twice, and inspects the current actual rootless Docker Engine and container read-only. Save the review output securely outside Git and have a distinct operator compare its results to original source, site/network and process witness evidence. Never post private file paths, Docker inspect JSON, customer workloads or agent credentials in issues.

## Interpret the review correctly

- Correlated original records and an exited Docker container support *evidence consistency and current-state observation*, not the attribution of the stop to a specific process or signed command.
- An attempted-only claim remains unresolved, even if an earlier CLI reported that stop returned. No `completed`, `failed` or `receipt_accepted` event may be appended by this read-only review.
- All results retain `appendTerminalOutcomeAuthorized=false`, `receiptReplayAuthorized=false`, `clearStaleLockAuthorized=false`, `automaticMutationRetryAuthorized=false`, `stagingDockerExecutionAuthorized=false`, and `productionDeploymentAuthorized=false`.
- Human verification of actual physical network isolation, incident evidence and any approved manual recovery remains mandatory. A negative, inconsistent or unavailable live observation means **BLOCKED**, not a success.

## CI proof and limitations

Run `node --test tests/docker-live-stop-forensics.test.mjs`. Dedicated CI exercises the real local durable journal writer and strict forensic validation with temporary files, plus CLI denied-operation paths. **CI never contacts a Docker Engine or approves execution**. The signed remote-agent interruption and hosted staging receipt-only recovery are separate operational milestones and still unverified.
