# ETERNYX Services — Phase 6: Production foundation and correctness

## Live Supabase verification (22 November 2026)

The linked ETERNYX Supabase project was inspected with read-only SQL. Initially
all five Services tables/view were absent. The five SQL migrations from merged
PRs #385, #391, #398, #403 and #409 were then applied successfully using
the Supabase migration operation in dependency order:

- service_requests
- service_request_activity
- service_scope_triage
- services_delivery_gate
- service_admin_attention_queue

Read-only follow-up checks confirmed all five tables, RLS policies, and the
security-invoker attention view exist; anonymous SELECT access is absent for
these tables and the view. Six expected Services triggers are enabled.
The authenticated database role without a signed-in user returned zero
service requests, activities, triage records and admin queue entries. This is
a limited smoke test and is NOT proof of real two-account isolation.

**Migration version caveat:** The tool recorded generated migration versions
20261122203201, 20261122203204, 20261122203209,
20261122203212, and 20261122203216, rather than the SQL filenames'
versions 20261122201000 etc. BEFORE any subsequent supabase db push,
reconcile history using an officially supported migration-repair procedure;
do not blindly re-run duplicate CREATE POLICY / ADD CONSTRAINT migrations.
Do not modify schema_migrations by hand.

The new read-only preflight query is
scripts/sql/services-live-preflight.sql. It checks catalog security state
without reading customer briefs or updating records.

## Application improvements

1. **Customer session isolation:** hide previous account data immediately
   when the signed-in user changes, even before React's cleanup effect runs.
2. **Stale-fetch safety:** old list queries cannot overwrite records loaded
   under a new session or filter; list errors clear stale content rather than
   masquerading as the last verified dataset.
3. **Deep-link ownership:** an account-scoped fetch resolves a private request
   even outside the current page; owner identity is checked at rendering too.
4. **Accurate filter empty states:** distinguish empty search results from no
   submitted requests, and recover when a formerly valid page becomes empty.
5. **Stable conversation history:** use the oldest saved (created_at, id) event
   as a cursor for older pages so new messages cannot shift offset indexes
   and silently skip older history.
6. **Race-resistant timeline refreshes:** ignore stale query responses,
   invalidate old history lookups and reset pending states on a fresh load.
7. **Contract tests, deployment documentation and the read-only SQL preflight**
   keep these release expectations discoverable and reviewable.

## Mandatory remaining release checks

- With customer A and customer B signed in separately, submit unique briefs
  and message replies; prove they cannot read/modify each other's requests.
- An authenticated non-admin must not see private triage or admin queue data;
  confirmed admins must be able to open the queue and publish a scope memo.
- Verify the customer scope feedback and create/update audit events are
  server-authored and immutable, and status in_progress/completed is denied
  until a separately authorized fulfillment process exists.
- Test the browser UI on desktop and mobile, back/forward, copy links, owner
  account switches and 50+ message histories with concurrent inserts.
- Review Supabase Security Advisors. Existing warnings outside Services may
  need independent follow-up; this milestone does not change unrelated roles,
  billing tables or security functions.

**Commercial boundaries:** No payment, binding contract, SLA, acceptance of
a security test, or automatic service delivery is enabled.
