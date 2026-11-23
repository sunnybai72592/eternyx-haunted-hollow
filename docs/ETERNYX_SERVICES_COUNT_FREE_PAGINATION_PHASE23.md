# ETERNYX Services — Phase 23: Count-free main request lists

## Why

Phase 21 removed four automatic exact-count queries from customer page
entry and nine from administrator page entry, but the two main request
lists still requested an exact count of **all matching database rows**
for every page and filter change. Large, layered security-invoker
views may make that count expensive.

Phase 23 removes this automatic count while maintaining real,
authorized data and honest navigation.

**No new SQL migration.**

## Eight connected improvements

1. Customer list requests **21 real rows** without an automatic global
   count: 20 visible rows plus one page lookahead.
2. Verified administrator list uses the same bounded 21-row window,
   preserving role and account checks.
3. Lookahead row is discarded before rendering, exporting CSV or
   generating editable administrator drafts.
4. A Next control is enabled only if lookahead returned a 21st real
   matching row. Total numbers are no longer implied from page size.
5. The current page is labeled clearly. If a higher page becomes empty
   due to concurrent status changes/deletions, the UI backs up a page
   without inventing a total; a real empty first page remains empty.
6. Existing Phase 22 15-second deadline, cancelation, failure messages,
   query filters and manual retry remain unchanged.
7. Exact totals remain available only through the explicit, bounded,
   serialized Phase 21 count refresh controls, not normal list loads.
8. Dynamic tests cover full/partial/empty windows, invalid payloads,
   overlong windows, timeouts, cancellation, account switches,
   admin authorization, and absence of implicit exact counts.

## Security and performance limitations

The 21st row is still scoped to the signed-in owner or administrator
via the existing PostgREST view and RLS. It is NEVER shown or exported.

This is offset pagination using real lookahead, not a snapshot-isolated
keyset cursor. Records can shift between page requests if other users
change them. A later cursor-based design may improve stability at
very large scale.

The reduction in COUNT queries is a reasonable load mitigation,
not proof of a measured performance gain and does not diagnose or
repair any database connection outage.

## Outstanding database blocker

The ETERNYX Supabase management project remains ACTIVE_HEALTHY in
metadata but SQL/migration-history calls still fail with
**Connection terminated due to connection timeout**. Phase 13 and
Phase 14 migrations remain unverified and were not deployed by the
assistant.

Inspect real managed migration history before applying only missing
reviewed SQL **Phase 13 before Phase 14**. Do not edit migration
history by hand or weaken RLS.

## Staging acceptance: customer A, customer B, administrator

1. Customer A opens a request list with exactly 20 matches and one
   with 21 matches. The 21st is not shown/exported on page one;
   Next is enabled only for the second case.
2. Customer B browses independently. B cannot see A's private rows.
3. Test full title/search/status/priority/activity filters, multiple
   pages, sort orders and linked requests. If the highest page becomes
   empty, navigation backs up one page safely.
4. Verified administrator browses the same worklist through existing
   assignment/review/clarification/priority filters, with private
   triage restricted to administrator accounts.
5. Switch accounts and filters mid-query and confirm stale responses
   do not populate the new account.
6. Simulate missing database views, revoked access, network timeouts
   and failing requests; show retry rather than a fake empty queue.
7. On-demand exact-count refresh still works; opening the desk alone
   never launches these count batches.
8. Complete Phase 20 real A/B/admin staging acceptance and read-only
   catalog audit. Ordinary GitHub CI alone is **not proof of
   production readiness**.

No new payments, read receipts, contracts, artificial data, billing
authorization, or service fulfillment is added.
