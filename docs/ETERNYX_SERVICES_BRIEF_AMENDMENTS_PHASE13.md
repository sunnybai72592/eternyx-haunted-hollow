# ETERNYX Services — Phase 13: Customer Brief Amendments

## Verified Phase 12 starting point

The user reported Phase 12 PR #451 merged. The corresponding
service_clarification_followthrough migration was applied to the linked
Supabase project through the managed migration tool. Read-only queries
verified both new views exist with security_invoker=true, anonymous SELECT
is denied, and the serialized question rate-limit trigger is enabled.
Without a signed-in user, the authenticated database role read zero
records from the admin queue.

These are schema and role tests; they are not signed-in customer A/B
end-to-end testing.

## Eight functional improvements

1. **Immutable project brief history:** customers submit specific changes
   without overwriting their originally confirmed intake request.
2. **Five structured change categories** (scope, requirements, timeframe,
   constraints, other) plus bounded summary and detailed change text.
3. **Owner-only inserts and participant-only reads:** RLS protects changes
   across accounts. Only admins can acknowledge a review. Customers cannot
   edit submitted changes or the admin review state.
4. **Database-stamped administrator review:** only pending -> reviewed is
   permitted, and the real administrator account/time are captured.
   "Reviewed" does not mean approved, agreed or delivered.
5. **Serialized duplicate/burst protection:** at most four per ten minutes
   per customer and request, with a five-minute same-content duplicate
   guard; all writes use server-enforced checks.
6. **Customer amendment workspace:** submit typed changes, review the
   permanent history, page older changes, see pending review count and
   admin review activity since the customer's explicit check-in.
   Private deep links use the same owner access checks.
7. **Admin worklist and acknowledgement:** real pending count, server-side
   pending-only filter, review buttons and saved actor/time. Existing
   review priorities, next-actions and personal check-in filters remain.
8. **Session safety, types and regression tests:** stale account data and
   drafts are cleared, confirmed saves refresh the queue, and release
   verification covers owners, admins, dates, permissions, and real
   database behavior rather than simulated scores.

## Deployment

Migration: supabase/migrations/20261123040000_service_brief_amendments.sql

**The Phase 13 migration is not deployed as part of this PR.**
Review and merge, then apply using the approved Supabase migration
process. Management-generated migration versions may differ from the
repository timestamps, so reconcile via official Supabase migration
repair before any CLI db push. Do not modify the migration history by hand.

## Staging test — real customer A, customer B and administrator

1. Sign in as customer A and submit a brief amendment on A's own request.
   Verify that the original service_requests description is unchanged.
2. Sign in as customer B; B must not be able to SELECT, insert or review
   A's amendments, even using A's request UUID.
3. Sign in as an administrator; the actual pending count and filtered queue
   show the customer amendment. A second admin sees the same task.
4. Review it with administrator A. Verify reviewed_by is the real auth.uid
   and reviewed_at is server-controlled. A second review and any reopen
   attempt must fail.
5. Customer A sees reviewed status, the actual timestamp and a real
   activity-since-check signal until A explicitly clicks Mark checked.
6. Admins' needs-follow-up and personal-check indicators now include
   actual customer amendment submissions; reviewing an amendment clears
   its pending-only task without falsely marking a service delivered.
7. Submit four genuinely distinct changes within ten minutes; the next
   one must be rejected. Try a repeated identical change within five
   minutes; it must be rejected without adding a duplicate. Rate limits
   must not affect a different customer or request.
8. Check mobile/desktop rendering, 20+ history pagination, browser
   sign-out/sign-in and private links, keyboard navigation and CI.

All changes are preliminary inquiry records, **not a contract**,
payment, service order, delivery commitment, security-testing
authorization, or automatic notification. No read receipts are implied.
