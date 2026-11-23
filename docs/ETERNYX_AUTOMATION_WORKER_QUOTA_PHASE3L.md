# ETERNYX Automation Phase 3L — Correct and execute-test real scheduler worker quota deferrals

**Scope:** fix a production-source scheduler worker bug in GitHub, with
offline execution tests. **No hosted function deployed, database
migration applied, scheduler tick triggered or Supabase project changed.**

## Identified and fixed defect

The deployed-source handler
\`supabase/functions/automation-scheduler-worker/index.ts\` handled
an account owner hitting the daily workflow quota through a safe
database RPC \`automation_defer_scheduled_run\`. However, its response
was destructured using the same name as the outer numeric counter:

\`\`\`ts
let deferred=0;
// Later:
const {data:deferred,error:deferError}=await db.rpc(...);
deferred++;
\`\`\`

Incrementing the shadowed \`const\` is invalid at runtime. A perfectly
valid quota deferral would jump into the general failure handler,
increment \`failed\`, and call \`automation_fail_scheduled_run\`,
incorrectly treating a postponed schedule as a failed job.

The fix renames the RPC receipt to \`deferReceipt\`. The counter
now increments only when the database explicitly acknowledges the
lease deferral. If the RPC rejects, the ordinary failure path remains
in charge. **Neither quota limit nor schedule authorization is
loosened.**

## Additional runtime hardening

- Worker \`Content-Length\` hints must be bounded unsigned decimal
  values (up to 80 bytes). Negative, scientific notation, malformed,
  unusually padded or excessive lengths fail closed before decoding.
- The original hard limit **still applies to actually streamed bytes**
  when Content-Length is absent. The handler checks every chunk.
- Request readers are always released, even on an oversized payload,
  invalid chunk, abort or unexpected read failure.
- No new network API, remote provider, untrusted URL, \`eval\`,
  user-selectable commands, schedules, migrations or secrets were added.

## Real handler execution (not merely searching source text)

New \`tests/automation-scheduler-worker-runtime.test.mjs\` strips only
TypeScript annotations and injects test dependencies into an isolated
Node VM. It then runs the **actual checked-in Edge Function handler**,
with real local workflow and AES-GCM functions and fake in-memory
database RPCs.

The offline tests check:

1. Missing scheduler secret and HTTP GET are rejected before any RPC.
2. Invalid command and malformed JSON are rejected without a claim.
3. Preflight daily quota correctly defers the lease and returns
   \`processed:0, failed:0, deferred:1\`.
4. Completion-time daily quota also postpones correctly.
5. Successful local workflow executes and stores only
   AES-GCM-encrypted output with scoped schedule and lease token.
6. Policy-disabled schedules fail their lease, rather than being
   incorrectly deferred.
7. Failed quota deferral must not be reported as successful.
8. Invalid claims and absent encryption keys cannot process work.
9. Malformed Content-Length hints are rejected before any claim.
10. One deferred and one completed claim in the same tick retain
    accurate numeric counters and two-claim limits.
11. An oversized streamed request body cannot reach the database.
12. The worker JSON response does not expose raw input, plaintext
    output, ciphertext, user ID or workflow ID.

This is significantly stronger than a mocked controller-only test:
the original handler's actual quota branch runs, so a future
reintroduction of the shadowed-\`const\` defect fails CI.

## What is still unverified

The connected Supabase account currently lacks an approved isolated
staging project, and the worker has not been deployed or called there.
These offline tests do **not** prove production worker code has
changed, that scheduled ticks are enabled, or that hosted Supabase
quota/lease RPCs execute correctly. Use the protected Phase 3H
staging release (with separately authorized cost and staging project)
before any hosted deployment, followed by controlled two-account
acceptance, scheduling review and a separate operator-approved tick
test. Never activate schedules based solely on offline evidence.
