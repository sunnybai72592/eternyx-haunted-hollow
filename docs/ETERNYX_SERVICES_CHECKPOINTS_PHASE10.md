# ETERNYX Services — Phase 10: explicit, per-user request check-ins

## Verified prerequisite

After PR #432 was reported merged, the Phase 9 service_triage_history
migration was applied to the linked Supabase project via its managed migration
operation. Read-only catalog checks verified that the history table exists,
RLS is enabled, anonymous SELECT is denied, authenticated INSERT/UPDATE are
denied, and the private audit trigger is enabled.

## Eight improvements

1. **Personal check-in records:** each signed-in participant can explicitly
   record when they last checked a specific request. These are not verified read receipts, not automatic tracking, and not SLAs.
2. **Server-owned timestamps:** a trigger writes the current PostgreSQL clock
   on insert/update. Clients cannot select an arbitrary past/future date.
3. **RLS-protected write boundary:** a SECURITY INVOKER RPC verifies an actual
   authenticated owner/administrator and writes only that person's check-in.
   Direct client writes cannot update another user's check-in.
4. **Customer update indicator:** customer-owned view compares the last real
   administrator message, status change or published scope review against
   the customer's last explicit check-in. A newly submitted request with no
   admin activity cannot be falsely labeled as updated.
5. **Personal admin check indicator:** the administrative queue compares
   recorded customer activity against each admin's own latest check-in;
   requests never checked by that admin are also flagged.
6. **Server-side filters:** customer lists can show only records with new
   admin updates; admins can show only work needing THEIR check separately
   from the existing team-level needs_follow_up signal.
7. **Explicit check-in actions:** both request desks provide accessible
   Mark checked buttons. Confirmation requires a successful RPC and the
   account still being signed in. Private links keep their existing
   RLS protection. No emails or customer messages are sent.
8. **Helpful state and regression coverage:** display last checked timestamps,
   account-scoped indicators and failures, plus tests covering RLS,
   timestamps, actual update sources, independent filters and type contracts.

## Deployment

New migration: supabase/migrations/20261123014500_service_request_checkpoints.sql

This Phase 10 migration is not deployed as part of opening the PR.
After review and merge, deploy through the approved Supabase migration tool.
Do not assume a merge changes the live schema. The existing management API
migration history uses generated migration versions that differ from repository
SQL filenames; reconcile using the officially supported Supabase migration
repair workflow before any future CLI db push.

## Required real customer A / customer B / admin staging tests

- Sign in as real customer A, customer B and a verified admin. Customer A cannot
  mark or view customer B's request; anonymous has no SELECT/EXECUTE rights.
- Two admins check the same request separately: each has an independent
  checked_at value; neither admin can overwrite the other's record.
- On a new request without admin activity, customer has no new-update badge.
  Publish a real admin message or scope review: the customer view signals
  that activity. After customer explicitly presses Mark checked, the signal
  clears. A subsequent admin update makes it reappear.
- Admin requests never explicitly checked show Needs my check. After
  checking, it clears until actual later customer activity. The original
  Needs follow-up signal remains separate and unchanged.
- A direct UPDATE trying to backdate checked_at is replaced with server
  time, and unauthorized writes fail RLS. Logout/account switching leaves
  no prior user's check-in status visible.
- Verify private-link check-in, paging/filters, browser/mobile, keyboard
  navigation, and full GitHub CI.

No payments, contract authorization, automatic read receipts, outbound
notifications, delivery promises or new security-testing permission.
