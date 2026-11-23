# ETERNYX Automation Phase 3M — Scheduler lease recovery honesty and tenant-bound claim validation

**Scope:** source and offline executed-handler tests only. No Supabase migration,
Edge Function deployment, schedule activation, live worker invocation, staging
project creation or production change was performed by this pull request.

## Why the previous worker was insufficient

PR #640 corrected daily-quota deferral counting. The next issue was that the
worker tried to recover a claimed schedule after a failed execution with
\`automation_fail_scheduled_run\`, but ignored the RPC's \`error\` and the
returned \`{ok:false,reason:"stale_lease"}\` response. PostgREST can
return both as normal resolved promises rather than throwing.

The worker would report an execution failure without distinguishing a
**PostgreSQL-confirmed lease release** from a **recovery attempt whose
outcome is unknown**. When a lease is stale, a concurrent worker may
have reclaimed it; no one should claim from that response that the
original lease was safely reset.

Cleanup was similarly best-effort: failures in
\`automation_prune_schedule_outputs\` returned as RPC \`error\` were
silently ignored, which obscured retention degradation.

## Improvements

1. Inspect both the error and the \`ok\` field of each failed-lease
   recovery RPC response. Only \`ok===true\` is an acknowledgment.
2. Add the status-only \`leaseRecoveryUnconfirmed\` count when the RPC
   returns \`{ok:false}\`, returns an error, throws, or fails transport.
3. Keep \`failed\` counting the **failed workflow execution**, independently
   of whether lease cleanup was acknowledged. A stale lease never
   counts as a completed run.
4. Do not include sensitive schedule IDs, lease tokens, ciphertext,
   owner IDs, raw inputs, PostgreSQL errors or webhook secrets in
   responses or logs.
5. Preserve the existing two-claim maximum, 90-second SQL lease,
   three-attempt retry budget, and separate daily-quota deferral path.
   No new schedule has been enabled.
6. Validate that a claimed encrypted payload is bounded hexadecimal
   AES-GCM ciphertext, and that its 12-byte nonce is valid hexadecimal
   **before** loading a workflow or calling policy RPCs.
7. Fail closed if the returned workflow row's \`id\`, \`user_id\`,
   positive safe-integer \`revision\`, or steps array contradict the
   claimed owner/workflow. This is a defense in depth beyond the
   existing PostgREST \`.eq\` owner filters.
8. Check \`automation_prune_schedule_outputs\` resolved RPC
   errors as well as thrown exceptions. Report a sanitized
   \`retentionCleanupFailed\` boolean when retention cleanup
   has **not been acknowledged**; it is not a guarantee that cleanup
   did or did not happen.
9. Include the bounded lease-recovery count on early claim errors so
   later claim errors do not erase already-observed recovery concerns.
10. Extend the executed-TypeScript-handler offline harness with real
    AES-GCM and workflow transformations, in-memory database RPCs
    that return stale-lease/permission errors, simulate thrown
    network faults and malformed owner records.
11. Verify two failed claims can produce one unconfirmed and one
    acknowledged recovery without exceeding the two-claim bound.
12. Test rejected malformed claim ciphertexts, wrong tenant workflow
    rows, missing/invalid revisions, cleanup RPC error and thrown
    transport failure, while checking no confidential data reaches
    the response.

Run locally:

\`npm run automation:worker:recovery:check\`

The full \`node --test tests/*.test.mjs\` and application build/desktop
browser journey remain under regular GitHub CI.

## Semantics and operational follow-up

\`leaseRecoveryUnconfirmed > 0\` means that the worker did not receive
proof the **fail-schedule RPC** successfully cleared the claim.
It does **not** prove the lease still exists; it might have expired or
been reclaimed. Treat it as a signal to inspect the read-only staging
scheduler state and error logs, without exposing lease tokens.

\`retentionCleanupFailed=true\` means the best-effort cleanup RPC did
not acknowledge success. Existing TTL/read-side expiration remains,
but an operator must diagnose recurrent failures.

A post-merge deployed function version should be validated via
independently approved isolated staging only. The connected Supabase
account still needs a separately authorized staging environment,
database migration reconciliation, and real authenticated two-owner
acceptance. These changes do **not** create a stage project or
release to production.
