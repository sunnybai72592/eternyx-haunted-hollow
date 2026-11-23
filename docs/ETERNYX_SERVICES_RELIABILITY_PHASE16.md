# ETERNYX Services — Phase 16: Reliability Center

## Scope and purpose

Make degraded Services functionality visible, actionable, and truthful
without assuming that a GitHub merge or Supabase management health check
proves the customer-facing database is ready.

**Phase 16 introduces no new migration.** The checks are run manually,
only after an authenticated user clicks Run availability checks. Initial
page loads and normal navigation never launch these additional probes.

## Nine connected improvements

1. Customer-side availability checks for the existing intake records,
   customer/admin conversation history, scope reviews, clarifications,
   immutable brief amendments, private owner action queue, and unified journal.
2. Administrator-side checks for those features plus the private admin
   request queue and internal triage. The signed-in user must pass the
   verified administrator RPC before any admin-only probes are issued.
3. Read-only HEAD requests with row limits, no content download, writes,
   automatic emails, or user data sent to external diagnostics services.
4. Useful failure states for missing or unexposed database features,
   denied access, network errors, timed-out requests, and other failures.
5. A bounded 15-second shared timeout with request cancellation instead of
   leaving the UI checking forever.
6. Account-scoped results with generation guards; out-of-order responses
   from a previous account or role cannot populate the current account view.
7. Accurate administrator access failures: an unreachable role-verification
   RPC is displayed as Administrator verification unavailable with a
   retry option, not a false claim that the user lacks administrator status.
8. Expandable customer and admin diagnostics, manual retry, device-time
   results and a sanitized clipboard summary with no account identifiers
   or query contents. Failed inbox requests do not masquerade as zero
   results.
9. Regression and security coverage, plus a recovery guide for the
   outstanding Phase 13 and Phase 14 migrations.

## Important limitations

A successful HEAD response confirms only that this session could issue
a read-only query. It does not prove records exist, that RLS isolation is
correct, that migration history matches repository files, or that the
business workflow succeeded. Unavailable is NOT zero.

The client must never receive the Supabase service-role key. Only
authenticated requests run; admin checks additionally require a verified
administrator role. The database's underlying RLS remains authoritative.

## Outstanding database rollout — no new migration

At the time of this PR, the connected project reports ACTIVE_HEALTHY
through the Supabase management API. However, database queries and
migration-list operations repeatedly timed out, including harmless
read-only SQL statements. The actual cause has not been established.

Phase 13 and Phase 14 database migrations remain unverified and were
not deployed by the assistant. Reconnect and verify migration state
before any further dependent database changes.

Phase 13: supabase/migrations/20261123040000_service_brief_amendments.sql

Phase 14: supabase/migrations/20261123050000_service_request_journal.sql

Follow docs/ETERNYX_SERVICES_DATABASE_RECOVERY.md before production
release. The new availability UI is diagnostic only and does not
magically install or repair an unavailable database feature.

## Staging walkthrough — customer A, customer B and administrator

- Sign in as customer A, then B. Verify checks do NOT run automatically.
  Each account runs checks explicitly; inspect private tab switching and
  copied summaries. Neither customer sees the other's check results.
- A successful zero-row HEAD request must be labeled Query available,
  never fully operational, fully audited, or delivered.
- Test missing Phase 13 tables / Phase 14 view independently. The UI
  should display unavailable and a cautious explanation instead of
  showing a fabricated zero. Old Phase 12 query success cannot
  hide missing Phase 13 and Phase 14 features.
- Simulate a failed connection or slow response. The bounded timeout
  must stop the loading state and allow a manual retry.
- Confirm an administrator can issue private admin queue and triage
  checks, while customer A and B cannot. Never rely on the mode prop
  alone for authorization; RLS and is_admin are the enforcement layer.
- Simulate a failed is_admin RPC and a genuine nonadmin. Only the
  former should see Administrator verification unavailable and Retry.
  A successful administrator retry must verify the account anew.
- Confirm ordinary request lists, searches, status updates, scope,
  clarifications, amendment review, unified journal, all Phase 15
  action cards, and mobile/desktop browser behavior remain intact.

There are no read receipts, automatic notifications, payments, signed
agreements, delivery guarantees, or testing authorizations in this phase.
