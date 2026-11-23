# ETERNYX Automation Phase 3N — fail-closed scheduler recovery and validated SQL receipts

**Scope:** checked-in Edge Function source and offline executed-handler regressions.
No hosted Supabase connection, function deployment, migration, live scheduler
tick, database mutation or new staging project was performed by this PR.

## Correctness gap

Phase 3M identified schedule lease recovery RPCs that returned errors or
\`{ok:false,reason:"stale_lease"}\`, and introduced
\`leaseRecoveryUnconfirmed\` tracking. However, the worker could still
return **HTTP 200** and **claim another schedule in the same invocation**
while the preceding lease was not confirmed released.

An unconfirmed lease may be still held, expired, or concurrently reclaimed.
Its disposition is genuinely unknown; claiming additional work after that
ambiguous recovery compounds operational uncertainty. It must not be
reported as a successful worker tick.

## Changes (live worker logic, not a mock flag)

1. Check the actual \`automation_fail_scheduled_run\` SQL result contract:
   \`ok===true\`, a safe integer \`attempts\` in the SQL range 1–3,
   and a Boolean \`retrying\` consistent with the last-attempt limit.
2. Fail closed on missing, malformed, contradictory, thrown, or
   \`{ok:false}\` recovery receipts. A stale lease is never reported
   as successfully released.
3. Return **HTTP 503** with only aggregated, sanitized
   \`processed\`, \`failed\`, \`deferred\`, and
   \`leaseRecoveryUnconfirmed\` counts.
4. Do not claim a second schedule after an unconfirmed release,
   including if the first task already performed some other work.
   Never enter an unbounded immediate retry loop.
5. Preserve prior successful processing counts if a later claim
   encounters ambiguous recovery. The response never fabricates a
   rollback of a previously completed, SQL-acknowledged run.
6. A valid terminal third-attempt receipt
   \`{ok:true,retrying:false,attempts:3}\` is acknowledged accurately.
   The existing capped-at-three retry policy is retained.
7. Require both quota-deferral RPC paths (preflight quota and
   completion-time quota) to return \`ok:true\`, \`deferred:true\`,
   and a parseable next-scheduled timestamp before incrementing
   the numeric deferral count.
8. Malformed deferral success results are treated as failed
   execution/recovery instead of claimed postponements.
9. Verify the \`automation_prune_schedule_outputs\` SQL result is a
   nonnegative safe integer deletion count and carries no RPC error.
   A malformed result sets \`retentionCleanupFailed=true\`.
10. Existing two-claim maximum, 90-second SQL leases, AES-GCM
    encryption, private tenant ownership, service-key requirement,
    constrained workflow operations and no-network execution stay intact.
11. Extended **actual TypeScript worker execution** tests simulate
    nine malformed lease-recovery receipts, two-claim short-circuit,
    partial success followed by stale lease, terminal third attempt,
    malformed quota-deferral results, and retention error/invalid
    row counts, using real local crypto/workflow code and a fake
    in-memory database.
12. The focused \`automation:worker:fail-closed:check\` command and
    ordinary full CI test suite verify the behavior on every PR.

The code still never logs schedule IDs, lease tokens, owner IDs, raw
inputs, decrypted outputs, ciphertext, PostgreSQL query errors or keys.

## Operator meaning

A **503 with \`leaseRecoveryUnconfirmed > 0\`** indicates the worker
cannot establish the previous lease was safely released. It is not
proof the lease still exists. The operator should inspect the
read-only staging scheduler/lease state and relevant service logs
after the SQL lease deadline, respecting existing access controls.
Do **not** immediately retry the same tick with an unbounded loop or
disable/rewrite live schedules to make the error disappear.

A **200 with \`failed > 0\`** is still possible when PostgreSQL
confirmed that its failure RPC updated the schedule's lease and
retry/terminal state. The counters distinguish failed work from
uncertain recovery.

A **200 with \`retentionCleanupFailed=true\`** means the best-effort
ciphertext pruning operation did not acknowledge success; read-side
expiration still applies. Persistent failures require investigation.

## Release caveats

PR merges change only source control. They do not update deployed
Supabase Edge Functions or activate the scheduler. A separately
approved isolated staging project is still required, followed by
real database migration/RLS verification, an explicitly authorized
staging worker deployment and real-account acceptance. Neither
production deployment nor hosted schedules are authorized by this PR.
