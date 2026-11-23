# ETERNYX Services Phase 21 — Database load shedding & safe diagnostics

## Why this is the next priority

Production Supabase management reports ACTIVE_HEALTHY but migration-history
and read-only SQL queries have repeatedly failed with a **connection
timeout**. The separate logs service is reachable and shows many
statement-timeout entries. That is a warning sign, not proof that
the Services interface caused the outage or a diagnosed root cause.

Inspecting the merged Services frontend revealed a concrete, avoidable
request pattern: the administrator request page automatically issued
**nine additional exact-count queries** across layered service views
(four review-bucket counts plus five Action Center counts) while the
main paginated request list was also loading. The customer page
automatically issued **four additional exact counts** on entry.
The resulting concurrency was unnecessary and may aggravate an
already slow database. Its contribution to the incident is **not
proven as the cause**.

This Phase 21 PR adds **no new SQL migration** and makes no database
or billing changes.

## Eight connected improvements

1. **Opt-in totals in both desks.** Opening customer/admin request
   pages no longer triggers background exact-count batches; ordinary
   request lists still load with their real server-side filters.
2. **Bounded serialized counts.** A reusable client helper executes
   at most one expensive exact-count query at a time. Its shared
   deadline is 12 seconds, and it never automatically retries.
3. **Fail closed.** If a count query fails, is aborted, or produces
   an invalid count, remaining probes are skipped. Unknown results
   are shown as a dash, never as zero or invented progress.
4. **Owner/session isolation.** Manual customer counts are canceled
   when the account changes or the user requests another refresh.
   Late results cannot populate another customer's Action Center.
5. **Shared admin query budget.** Administrator review counts and
   Action Center counts cancel one another on overlap instead of
   issuing simultaneous bursts; session changes cancel active work.
6. **Honest manual controls.** A labeled Load / refresh counts
   action is available for both customer and administrator totals,
   including review-bucket counts. The task cards remain fully
   usable even without loaded totals.
7. **Stale count invalidation after writes.** Check-ins, triage
   changes, clarifications, amendments and manual page refresh
   invalidate old totals rather than silently triggering another
   collection of expensive queries.
8. **Dynamic regression tests + read-only operational audit.**
   Tests exercise serialization, deadline expiry, explicit abort,
   account switching, query failure, invalid count inputs and
   no eager automatic count loading. The audit SQL contains only
   aggregate database activity and index metadata.

## Limits and choices

- These changes reduce *optional* count request pressure, not the
  actual business workflow queries. They do not repair database
  connection management or optimize query execution plans directly.
- Counts remain **exact** when present. We did not change to
  approximate, sampled or fabricated totals.
- On-demand totals can take longer because they are serialized.
  The deadline limits the total work; later values display a dash
  if the budget is exhausted. The operator can retry explicitly.
- Clicking an Action Center or review card continues to apply its
  existing real server-side filter even when the count is unknown.
- The dashboard uses no persistent client cache, polling, new
  database functions or global retries. Data access remains
  controlled by Supabase RLS and verified administrator rights.

## Safe incident investigation (operator only)

1. Confirm the production project URL and recent Supabase service
   status. Do not interpret ACTIVE_HEALTHY as a successful SQL test.
2. Try a single harmless SELECT 1 in the SQL Editor. If SQL still
   times out, inspect Database Connections, compute load, timeouts,
   pool limits, long-running/blocked sessions and Supabase logs.
   Consider Supabase Support if basic queries remain unreachable.
3. Once SQL access is restored, run **only the read-only audit** in
   docs/sql/eternyx/services-phase21-db-load-audit.sql.
   It reports aggregate connection states, cumulative DB counters,
   source index definitions and Phase 13/14 object existence.
4. Compare actual production request volume before and after
   the load-shedding frontend release, alongside application and
   database errors. No latency improvement is claimed without
   instrumented staging/production evidence.
5. If a specific query appears slow, obtain an EXPLAIN plan using
   properly authorized test/staging accounts and representative
   data. Do not paste customer query literals into support chats.
6. The previous outstanding migrations must be reconciled in
   managed history before attempting writes: **Phase 13 before
   Phase 14**. Never manually edit migration history or disable
   RLS to make a view query succeed.

Relevant Supabase documentation:
https://supabase.com/docs/guides/database/connection-management

## Staging acceptance: real customer A, customer B, administrator

- Customer A and B open their own request desks. Count queries do
  not run on initial load, and only owner-filtered request data is
  returned. The manual Load button runs no more than one exact-count
  request concurrently.
- Switch from customer A to customer B during a slow count. A's
  pending response cannot populate B's totals.
- As a verified administrator, review and Action Center totals
  are not automatically fetched on entering the page. Manually
  starting either interrupts the other rather than doubling load.
- Simulate a 15-second database outage: the count batch ends within
  its 12-second shared deadline. No invented zero or hanging
  spinner is displayed.
- After a real triage update, customer amendment or clarification,
  previous totals become unknown rather than implying unchanged
  request counts. All task filters continue to operate.
- Confirm the ordinary request list, 20-row pagination,
  check-ins, private deep links, conversation/history, scope,
  clarifications, amendments, action-card filters and exports
  still function with proper RLS.
- Complete Phase 20's **manually triggered** A/B/Admin real-data
  staging acceptance after the staging environment and existing
  fixtures are configured. This step has not been performed by
  GitHub's ordinary CI.
- Check desktop/mobile layout, keyboard access and all repository
  CI checks before merging.

No read receipts, contracts, payment processing, auto-delivery
or promises of production readiness are created by this phase.
