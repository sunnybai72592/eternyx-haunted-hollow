# Docker Lab Crash Recovery and Receipt Reconciliation

This is operator-controlled, lab-only hardening for signed Docker dispatch after PR #405. No public customer execution is enabled. Server and agent opt-in flags remain disabled by default.

## The ten protections

1. Exclusive per-agent lock: concurrent operator runs cannot claim or act on overlapping jobs.
2. A crash leaves the lock in place. Never automatically clear a stale lock before investigating local journal entries and other running processes.
3. One permanent claim-ID journal is created exclusively before any Docker command; a claim can never be automatically executed twice.
4. Owner-only 0600 journal files in a 0700 directory; no secrets, environment values or credentials are recorded.
5. Journal entries are append-only and fsynced to disk: reserved, attempted, outcome, receipt acknowledged.
6. After Docker returns, the agent re-inspects the exact container. Only matching state and container ID qualify for an agent-reported completion.
7. If Docker fails, the postcondition is unclear, or the agent crashes, results remain failed, unresolved, or unknown. Nothing is retried automatically.
8. A read-only recovery CLI shows local claim state without touching Docker or making network requests.
9. An explicit receipt-only recovery mode resends the recorded terminal outcome after a network failure; the local Docker command is never repeated.
10. Staging SQL grants an idempotent same-outcome acknowledgement after a lost HTTP response. Conflicting results and unauthorized caller actions are rejected.

## Read-only investigation

On the trusted operator host, run:
    node scripts/docker-lab-recovery.mjs
Or inspect one claim:
    node scripts/docker-lab-recovery.mjs CLAIM_UUID

Review all entries with attentionRequired=true. If the state includes attempted but no terminal outcome, the command may have executed. Inspect the actual Docker state independently and escalate rather than rerunning.

## Receipt-only reconciliation

Use this ONLY when an operator journal has a terminal completed, failed or guard_denied result and receiptAcknowledged=false:

    ETERNYX_REMOTE_LAB_ENABLED=true ETERNYX_SUPABASE_URL=https://YOUR_PROJECT.supabase.co node scripts/docker-lab-agent.mjs AGENT_UUID /ABSOLUTE/AGENT-PRIVATE.pem /ABSOLUTE/PINNED-SERVER-PUBLIC.key --resend-receipt CLAIM_UUID

The recovery path reads a private journal, signs a new receipt, calls the existing signed Edge endpoint and acknowledges receipt. It does not inspect or operate Docker. If server has already accepted the same outcome, the SQL function replies idempotently. If the original receipt never arrived, the existing five-minute claim reporting window remains in effect. Later unmatched receipts are deliberately rejected for manual review.

## Crash and lock handling

Investigate the host's running processes and the local journals first. The lock path is under ~/.eternyx/docker-lab-journal/agent-AGENT_UUID.lock. Remove a stale lock by an operator ONLY after ensuring no agent process is running and determining whether an operation already occurred. NEVER delete a claim journal to force a re-run.

Local files are an operator audit aid; not tamper-proof proof of remote machine ownership or of successful Docker execution. A successful report remains signed self-reporting.

## Deployment and acceptance

Migration 20261123080000_docker_dispatch_receipt_recovery.sql is incremental and requires all previous Docker migrations. Stage it and verify owner A/B, revoked identities, mismatched outcomes, duplicate signatures/nonces, and transaction concurrency. Deploy the Edge Function only after staging integration tests. The existing double opt-in lab flags must remain off in production.

Run: node --test tests/docker-lab-recovery.test.mjs
Review Github CI build and test checks before merging. Never expose Docker socket ports, Docker credentials, private Ed25519 keys, or audit journals to browsers.
