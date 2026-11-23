# ETERNYX Services — Phase 15: Action Center

## Summary

A consolidated, actionable overview of work for customers and admins,
built **only from real request counts** returned by the current secured
PostgREST views. This release adds **no new SQL migration**; it uses the
existing Phase 13 customer/admin amendment queues, preserving RLS and
all prior service-delivery boundaries.

## Nine connected improvements

1. **Reusable responsive action-center component** with clickable,
   keyboard-focusable request-count cards, accessible pressed states,
   a refresh button, and truthful unavailable-state descriptions.
2. **Owner action overview:** counts across *all owned requests*, those with
   real activity since explicit check-in, those with an unanswered
   clarification, and those with pending brief amendment reviews.
3. **Owner exclusive focus shortcuts:** one-click clearing of incompatible
   status/search/task filters followed by the relevant real server filter.
4. **Owner pending-review filter and ordering:** new filter for pending
   customer brief changes, plus newest, oldest and genuinely updated
   request-record ordering (not fabricated latest activity).
5. **Critical customer deep-link fix:** the private request UUID path had
   been querying service_customer_followup_queue for Phase 13 amendment
   columns which that older view does not expose. Both the normal list
   and direct-link now use service_customer_amendment_queue.
6. **Administrator action overview:** accurate all, follow-up, pending
   amendment, answered clarification and unassigned request counts.
7. **Admin focused work queues and sorting:** one-click exclusive task
   filters, sorting by the real number of pending amendments or saved
   clarification answers awaiting review.
8. **Failure-safe account-scoped counters:** all counts use
   count='exact', head=true and source RLS; errors produce a dash rather
   than zero. Generation guards discard old-account results, and rendered
   data remains tied to the current account.
9. **Refresh after actual saves, plus regression coverage:** counts
   refresh after customer check-ins, clarification/amendment changes,
   administrator triage and verified status updates. No timer-driven
   billing or simulated data.

## Dependencies / deployment

No new SQL migration is introduced by Phase 15.

**At development time Phase 13 and Phase 14 database migrations remain
unverified and not deployed by the assistant**. The linked Supabase
project reported ACTIVE_HEALTHY via the management API, but the database
migration and SQL endpoints returned a connection timeout, including on
basic read-only queries. Do not infer migration success from GitHub
merges or the management project's status.

Before releasing this UI to production, restore Supabase DB connectivity
and apply / verify in order:
1. supabase/migrations/20261123040000_service_brief_amendments.sql
2. supabase/migrations/20261123050000_service_request_journal.sql

Migrations previously applied through the managed project migration tool
may have generated version IDs that differ from the SQL filenames.
Reconcile with the supported Supabase migration repair workflow, not
manual modification of migration history.

## Required staged verification — real customer A, customer B, administrator

- Customer A and customer B see only their own exact request counts, and
  the customer A direct-link cannot load customer B's request UUID.
- Customer submits a brief change and a clarification answer. The
  submitted changes appear in the appropriate owner/admin count buckets.
- Administrator acknowledges the brief change, closes clarification,
  and updates the request. The corresponding admin counts change after
  refresh or saved mutations; no task is falsely marked fulfilled.
- Selecting a summary card resets incompatible search/status filters;
  manual combined filters still behave as selected.
- Test owner newest/oldest/updated sorting and admin queues sorted
  by pending brief changes and answered clarifications with >20 requests.
- Simulate a failed read or unavailable view: counts display a dash rather
  than zero; the filter buttons still work and no invented stats appear.
- Switch accounts while all counting queries are in flight; the previous
  account's results must never display on the new session.
- Check private direct links, keyboard selection, mobile/desktop layouts,
  and all GitHub CI tests.

No plans are activated, no automatic fulfillment, no messaging
guarantees, no binding agreements, **not read receipts**, no payments,
and no permission to conduct security tests.
