# Docker Phase 22 — genuine isolated-host evidence custody and independent offline review

This phase follows merged PR #572. The real network/host baseline from the Phase 20 operator script, and the Phase 21 read-only claim triage after a **separately authorized interruption**, must be captured on the *same* actual isolated rootless Docker host. This offline handoff does not contact Docker or Supabase, does not itself inject a crash, and cannot prove that a report was genuinely collected from a real host.

## Required real-world field inputs

The host owner must first perform the [Phase 20 acceptance procedure](DOCKER_REAL_HOST_NETWORK_GATE.md), with independent physical network-isolation verification, written approval, no production credentials, remote execution disabled and exact container, image and daemon pins. On that host save the genuine private output from:

    node scripts/docker-host-network-evidence.mjs --inspect > /ABS/PRIVATE/host-baseline.json

After **independent operator approval of a separate disposable interruption drill** (no automated retry, no automatic lock removal), the operator inspects a single unresolved claim with [Phase 21 triage](DOCKER_HOST_CRASH_TRIAGE.md):

    node scripts/docker-host-crash-triage.mjs --triage CLAIM_UUID > /ABS/PRIVATE/crash-triage.json

These reports must be generated under the same **clean approved 40-character Git commit**, exact daemon, socket, disposable container, reviewed image, managed-target policy and host route hash. The triage report must follow the baseline within 24 hours; both must be less than one day old, and the triage must contain exactly one additional claim journal. A report of the current container state is **not** proof the interrupted action caused that state.

Store the raw reports separately from Git, mode 0600, and independently archive each complete file's SHA-256 and host witness record. Neither offline signing nor a second key is proof of site isolation or physical host identity: the site reviewer must independently inspect the host, its networking and process/journal state.

## Independent identity pins — never inferred from the reports alone

Each participant sets these environment variables from a separately approved private source, not from the report itself:

- ETERNYX_DOCKER_APPROVED_COMMIT_SHA — exact 40-char source SHA
- ETERNYX_DOCKER_HOST_DAEMON_ID_SHA256
- ETERNYX_DOCKER_HOST_SOCKET_SHA256
- ETERNYX_DOCKER_HOST_CONTAINER_ID
- ETERNYX_DOCKER_HOST_IMAGE_SHA256
- ETERNYX_DOCKER_HOST_POLICY_SHA256
- ETERNYX_DOCKER_HOST_ROUTE_SHA256
- ETERNYX_DOCKER_HOST_EVIDENCE_HANDOFF_APPROVAL=I_APPROVE_OFFLINE_HOST_EVIDENCE_REVIEW

This CLI is offline and operator-only. It refuses CI/root, symlinks and any non-owner-private/oversized input. Use Node.js 22+ on an approved non-root Linux account with two separately generated Ed25519 PEM key pairs, different author and reviewer, with independent out-of-band public-key fingerprints. Set umask 077 and write resulting files mode 0600; do **not** commit PEM keys or real evidence.

## Three-step evidence custody handoff

**Operator**, after collecting and reviewing genuine on-host reports:

    node scripts/docker-host-crash-evidence-handoff.mjs author /ABS/PRIVATE/host-baseline.json /ABS/PRIVATE/crash-triage.json /ABS/PRIVATE/author-private.pem > /ABS/PRIVATE/authored.json

**Different human reviewer**, after their own physical/site/network and source/pin evidence review, sets:

    export ETERNYX_DOCKER_HOST_INDEPENDENT_REVIEW_APPROVAL=I_REVIEWED_EXTERNAL_HOST_RECORDS
    node scripts/docker-host-crash-evidence-handoff.mjs countersign /ABS/PRIVATE/authored.json /ABS/PRIVATE/host-baseline.json /ABS/PRIVATE/crash-triage.json /ABS/PRIVATE/author-public.pem /ABS/PRIVATE/reviewer-private.pem > /ABS/PRIVATE/dual-review.json

**Verifier**, using independently pinned author and reviewer public keys and **original raw report files**:

    node scripts/docker-host-crash-evidence-handoff.mjs verify /ABS/PRIVATE/dual-review.json /ABS/PRIVATE/host-baseline.json /ABS/PRIVATE/crash-triage.json /ABS/PRIVATE/author-public.pem /ABS/PRIVATE/reviewer-public.pem

A changed byte in either report, a wrong claim/source/container/image/daemon/socket/route, contradictory flags, stale/reordered timestamps, missing claim increment, invalid signing key or identical author/reviewer keys fails closed. Every signature is domain-separated and the reviewer signs the candidate digest **and** author signature. The verifier reconstructs the candidate from original files.

## What passes and what does not

The final result proves only that two distinct, independently pinned public keys validate signatures over an internally consistent evidence package; it **does not** independently prove that the report observations are truthful, the host is physically isolated, a crash was induced, the claim was actually executed, or that Supabase received a signed receipt.

The result always says physicalIsolationIndependentlyEstablished=false, realCrashInjectionIndependentlyWitnessed=false, remoteReceiptVerified=false, automaticRetryAuthorized=false, stagingDockerExecutionAuthorized=false and productionDeploymentAuthorized=false. The actual authorized field drill and separate hosted staging receipt integration remain mandatory release blockers. Do not enable any public Docker execution feature based on this report.

Tests: node --test tests/docker-host-crash-evidence-handoff.test.mjs. CI is **offline only** and does not create or authenticate an on-host report.
