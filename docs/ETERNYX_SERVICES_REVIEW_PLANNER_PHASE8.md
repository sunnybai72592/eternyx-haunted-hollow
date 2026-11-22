# ETERNYX Services Phase 8 — Verified internal review planner

## Production status entering this milestone

- The five base Services migrations were installed and checked in Phase 6.
- After the user merged Phase 7 (PR #421), the linked Supabase project's
  service_write_rate_limits migration was applied through the migration API.
- Read-only verification confirmed both activity/feedback flood-prevention
  triggers are enabled and their underlying SECURITY INVOKER functions are
  not directly executable by authenticated database roles.
- The new Phase 8 database migration in this PR is **not yet applied**.
  Do not merge code alone and claim the new review planner is live.
- Existing migration history from the management API uses generated version
  numbers which do not match each SQL filename. Reconcile via the official
  Supabase migration repair procedure before running CLI db push.

## Eight improvements in one PR

1. **Private next-action planning:** admins assign a specific actionable
   review purpose (brief review, clarify requirements, prepare scope,
   coordinate team, await customer or not planned).
2. **Optional internal UTC review date:** stored on the protected
   service_request_triage table, not on customer-readable requests.
3. **True due-state calculation:** server view labels missing dates,
   past review dates, today (UTC), and future review dates from persisted
   values, never invented urgency or customer delivery deadlines.
4. **Server-side due/action filters:** admin-only query filtering with exact
   matching totals and existing status/priority/assignee controls.
5. **Next-review sort:** earliest internally scheduled reviews first, with
   unscheduled items last; original priority, customer-activity, and
   newest-request sorts remain available.
6. **Visible review context:** priority, assignment, exact UTC date,
   due bucket and next action on each admin request card.
7. **Admin deep links and reset:** copy a URL targeting a request UUID and
   resolve it through the existing admin-only server query. A single
   reset clears filters and the URL query. Sharing never grants access.
8. **Safe concurrent edits, tests and failures:** triage writes preserve
   updated_at optimistic concurrency; invalid dates fail validation;
   outdated admin results clear after query errors, and the queue recovers
   if a formerly valid page becomes empty.

## Database deployment and verification

New migration: supabase/migrations/20261123003000_service_review_planner.sql

Run after the existing rate-limits migration. Confirm:
- Both new triage columns exist, strict check constraints are active.
- Existing RLS and admin-only policies still guard the triage table.
- The new view has security_invoker=true and excludes anonymous SELECT.
- A signed-in non-admin cannot query another customer's request or the
  operator queue; an admin can save a valid next-action plan.
- A review date equal to the current UTC date appears under "Review today";
  yesterday under "Past review date"; no date under "Not scheduled".
- Date/assignment/priority filters and 20+ record pagination return true
  database counts. Do not test with private production customer data.
- Clear filters and a copied admin link work across browser refreshes.
- Browser and keyboard UX, desktop/mobile, and all GitHub CI must pass.

## Commercial boundaries

Planning dates are **not** response guarantees, SLAs, delivery deadlines,
quotes, contracts or authority to run security tests. No paid AI or service
fulfillment is activated by this milestone.
