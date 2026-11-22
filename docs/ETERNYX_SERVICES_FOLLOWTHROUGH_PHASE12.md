# ETERNYX Services — Phase 12: Clarification follow-through

## Current verified state

After Phase 11 PR #445 was reported merged, the connected Supabase
production project's service_clarifications migration was applied using the
managed migration operation. A subsequent read-only catalog check confirmed:

- Questions and answers tables exist, each with RLS enabled.
- Anonymous SELECT access to questions is denied.
- Authenticated clients cannot UPDATE or DELETE customer answers.
- Both new request-queue views use security-invoker rights.
- The private clarification closing trigger is enabled.
- An authenticated database role lacking a logged-in user saw zero rows in
  the admin clarification queue.

These are schema/role checks, NOT a substitute for signed-in end-to-end
customer A/customer B/administrator tests.

## Eight connected improvements

1. New owner-only read-only request queue based on the existing secure
   clarification queue: real new questions and closure timestamps now count
   as ETERNYX activity since the owner's manual check-in.
2. Customer UI displays actual clarification changes since check-in for
   both list and directly linked requests. The existing activity filter
   works for questions and closures alongside messages, scope and status.
3. New admin-only queue incorporates each saved customer clarification
   answer into real personal check-in signals. An answer cannot be missed
   just because the last customer message was already reviewed.
4. Administrator queue's "Needs follow-up" also includes answered open
   questions needing manual review, without overwriting the earlier
   message/status-based signal.
5. Admin cards show saved clarification-answer counts since that
   administrator's explicit check-in, and server-side follow-up filters
   use the extended signals.
6. A per-admin/per-request transaction advisory lock, six per minute
   limit and 90-second duplicate check prevent repeated clarification
   questions from rapid clicks, without changing customer answer rights.
7. Clarification component resets pending state on account switch and
   uses accurate, actionable duplicate/rate-limit errors. Check-in error
   messages cannot leak from an old session, and an empty last owner page
   no longer leaves the loading indicator stuck.
8. New schema types, migration/UX regression tests and staged release
   verification are included. No fabricated notifications or unread
   receipts are added.

## Database release gate

Migration: supabase/migrations/20261123031500_service_clarification_followthrough.sql

**The Phase 12 migration is not deployed with the PR.** Review/merge
first, then apply with the managed Supabase migration process. Check
security-invoker=true and role grants on both new views. Reconcile the
Supabase generated migration versions with repository filename versions
using the documented official repair process before CLI db push; never
hand-edit the migration history.

## Staging walkthrough — real customer A, customer B and administrator

1. Log in as customer A, customer B and a verified administrator.
2. Customer A marks an owned request checked; it shows no activity badge
   until an administrator actually publishes a new clarification question
   or performs a real closure. The customer B request must stay invisible.
3. An admin publishes a question. A sees the question, the actual pending
   answer count and the update-since-check indicator. Checking the request
   clears the indicator but NOT the unanswered question.
4. Customer A submits the one immutable answer. The admin queue flags the
   answer even when there are no newer messages or scope responses.
   The admin can use the real personal filter and manually check the
   request. The answer-review task remains until the question is closed.
5. Admin closes the clarification. Customer A sees the closure activity
   since their last check. The answered-open counter drops to zero.
6. Try six legitimate unique questions in one rolling minute from the
   same admin and request; the seventh is server-rejected. Duplicate
   prompt inside 90 seconds is rejected. No other request or user is
   erroneously throttled.
7. Verify anonymous read denial and unrelated customer A/B isolation,
   account-switch draft isolation, 20+ question pagination,
   desktop/mobile browser checks and full GitHub CI.

## Important boundaries

Activity indicators are comparisons against saved explicit personal
check-in timestamps, **not read receipts**, email open events, outbound
notifications, response-time promises, automatic task execution,
agreements, payments or permission to perform security testing.
