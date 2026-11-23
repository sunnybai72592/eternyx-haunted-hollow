# ETERNYX Services Phase 22 — Reliable main request-list reads

## What changed

The Phase 21 release removed unnecessary automatic exact-count batches
from the customer and administrator action cards, but the main request
lists themselves still awaited database responses indefinitely.
Unexpected transport rejection could leave an indefinite loading state;
filter changes could leave previous-filter cards visible until the
new query finished.

Phase 22 introduces **no new SQL migration**, external service,
permissions, write workflow or automatic background polling.

## Eight integrated reliability improvements

1. **Shared 15-second query deadline.** Both existing main request
   lists use a bounded helper. It races the PostgREST request with an
   AbortController deadline so the UI settles even if the HTTP
   implementation does not promptly honor cancellation.
2. **Actively cancel obsolete reads.** Owner list filters, search,
   pagination and account changes abort the old request instead of
   merely ignoring its eventual result. Administrator list does
   the same for filters, role verification and session changes.
3. **Account and generation fencing.** Customer results require a
   matching signed-in user ID and current request generation;
   administrator results also require a verified admin account.
4. **Fail closed on missing counts.** A successful data payload
   without a valid exact total is unavailable, not zero. Null
   rows, negative/noninteger counts and inconsistent row totals
   are rejected. A genuine empty result requires a real zero count.
5. **Truthful failure descriptions.** Timeout, missing Data API
   view, denied access, network failure and incomplete count
   responses have distinct, carefully worded user messages.
6. **Reliable retry and cleanup.** Unexpected rejection or timeout
   stops the spinner, clears old data and offers a deliberate Retry
   action. No automatic retries or query storm are introduced.
7. **No stale filtered cards or drafts.** When a new list query
   begins, old owner rows and administrator worklist/draft fields
   are hidden until a fresh verified query completes. Export
   actions cannot use old-filter data during a new load.
8. **Runtime tests and release gates.** Dynamic tests cover a
   genuine zero vs unavailable, never-resolving transport, abort,
   account switch, missing view, access denial and sanitized
   error strings. Source tests confirm real RLS-backed list
   queries, page boundaries and manual retry controls.

## Boundaries and remaining blockers

This reduces client-side hanging requests and stale state. It does
not fix remote PostgreSQL connection exhaustion, query execution
plans, expired credentials or missing migrations. Main list
queries still request exact paginated totals; these may remain
expensive on layered security-invoker views.

The connected production project still reports ACTIVE_HEALTHY in
management metadata while SELECT 1 and migration listing fail with
**connection timeout**. The actual root cause has not been
established. Phase 13 and 14 database resources remain unverified
and have not been deployed by this assistant.

Do not replay migrations until actual schema and history are
reconciled. Deploy only genuinely missing reviewed changes
**Phase 13 before Phase 14** using official migration operations,
without weakening RLS or exposing data.

## Staging: customer A, customer B, administrator

1. Sign in as customer A. Load requests, then change filters
   and pagination during a delayed query. Old-filter cards must
   disappear, and only the latest response may show records.
2. Open A's request link under customer B. RLS must prevent
   reading A's request; no old A rows can appear in B's list.
3. Simulate a 15-second network/database stall, rejected fetch,
   missing view and missing count. The list must settle, show
   a truthful failure and offer manual retry, not claim zero.
4. Confirm a genuinely empty account or legitimate empty
   search shows the normal empty view only after an exact
   database count of zero.
5. Repeat as a verified administrator. Role checks must succeed
   before list access; previous admin drafts cannot survive
   account/role change or a new filtered load.
6. Verify existing service status updates and optimistic
   concurrency, private links, messages, scope, clarifications,
   brief amendments, triage, unified journal, on-demand
   Phase 21 counts and loaded-only exports remain available.
7. Run Phase 20's real customer A/customer B/administrator
   staging acceptance and independent read-only SQL audit.
   Passing ordinary GitHub CI is **not proof of production readiness**.

No read receipts, contracts, payments, entitlement grants, customer
delivery promises or automatic service execution are introduced.
