# Docker Lab Crash Recovery and Receipt Reconciliation

This is operator-controlled, lab-only hardening for signed Docker dispatch after PR #405. No public customer execution is enabled. Server and agent opt-in flags remain disabled by default.

## The ten protections

1. Exclusive per-agent lock: concurrent operator runs cannot claim or act on overlapping jobs.
2. A crash leaves the lock in place. Never automatically clear a stale lock before investigating local journal entries and other running processes.
3. One permanent claim-ID journal is created exclusively before any Docker command; a claim can never be automatically executed twice.
4. Owner-only 0600 journal files in a 0700 directory; no secrets, environment values or credentials are recorded.
5. Journal entries are append-only and fsynced to disk: reserved, attempted, outcome, receipt acknowledged.
6. After Docker returns, the agent re-inspects the exact container. Only matching state and container ID qualify for an agent-reported completion.
7. If Docker errors, times out, returns an ambiguous status, or postcondition inspection cannot confirm the exact expected state after an attempted mutation, the outcome stays **UNKNOWN**: no fabricated terminal `failed` event or signed failure receipt. The original lock and attempted-only journal remain for human review. No automatic retry.
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


## Phase 26 — real signed agent UNKNOWN outcome hold (after merged Phase 25)

This change hardens the **actual signed dispatch agent**, not just offline rehearsal tools. Before starting any permitted Docker mutation the agent creates an exclusive permanent claim journal, fsyncs `attempted`, and keeps its exclusive per-agent recovery lock. The uncertainty boundary is set **before** writing the attempted event, so a journal write interruption cannot silently become a `guard_denied` receipt.

### Accurate outcome classification

- **Before the attempted boundary:** an invalid/expired permit, rejected image/policy, missing/unsafe target or other preflight refusal can be durably recorded as `guard_denied`. A signed receipt is sent **only after** rereading that terminal event from the original private journal.
- **After the attempted boundary with verified postcondition:** only an exact, successful Docker postcondition may produce `completed`. The agent fsyncs the terminal event and independently rereads it **before** sending a signed receipt. This remains an agent self-report, not proof of physical isolation or independent execution attribution.
- **After the attempted boundary with any uncertainty:** Docker CLI timeout, nonzero exit, failed second inspect, missing/unexpected state, lost Docker response, audit failure, expiry after claim fsync or local journal failure can all be ambiguous. The agent writes **no** terminal `completed`/`failed`, signs **no** receipt, returns a failing exit status, and **retains** the exclusive agent lock. An operator must inspect both journal and Docker state before taking a separately approved corrective step. Do not remove the journal to run the claim again.

Legacy `failed` claims with an **already fsynced** terminal event can still use explicit receipt-only replay; no new generic `failed` events are generated by ambiguous operations. The resend path rejects receipts without a matching durable terminal journal. After a definite journal terminal event is safely fsynced and read back, the agent lock can be released even if the subsequent receipt HTTP acknowledgement is lost, preserving its explicit `--resend-receipt` workflow without Docker mutation.

### Manual read-only follow-up

1. Leave `~/.eternyx/docker-lab-journal/agent-AGENT_UUID.lock` intact if an attempted-only claim exists. Do not launch another agent session or restart the container.
2. Review `node scripts/docker-lab-recovery.mjs CLAIM_UUID` and original read-only Docker inspect on the separately approved operator-owned host. Determine independently whether the local process is still running and whether a mutation was attempted.
3. Escalate any attempted-only claim for a documented site review. No signed receipt or execution retry is authorized solely because the container now appears started/stopped. Observe rootless isolation separately.
4. Run `--resend-receipt CLAIM_UUID` **only** if a definitive terminal `completed`, legacy `failed` or `guard_denied` was already recorded in the original private journal and there is no retained active/stale lock requiring investigation. This makes **no Docker calls**.

These controls do not execute against a live host in CI, do not enable server-side Docker dispatch, and do not prove hosted staging receipt delivery. The configured server and operator feature flags remain separately disabled by default; production is not authorized.

Regression: `node --test tests/docker-agent-attempt-disposition.test.mjs`. Dedicated CI uses actual owner-private/fsynced local journal files and test-only refusal paths, never a Docker Engine or Supabase credentials.
