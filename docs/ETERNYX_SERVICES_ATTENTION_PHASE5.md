# ETERNYX Services Phase 5 — Operator attention and safe session switching

## What is implemented

1. PostgreSQL 15+ security-invoker admin queue view backed by actual service
   requests, protected triage, customer messages, scope feedback and published
   scope reviews. This is **admin-only** and retains original table RLS.
2. A derived "needs follow-up" signal when a brief remains submitted or the
   customer's last message/scope response is newer than an admin message,
   status note or published scope review. This is NOT an unread marker, not a
   verified human acknowledgment and not a response-time commitment.
3. Server-side priority and assignment filters, including "Assigned to me"
   and "Unassigned"; untriaged records default to Normal priority. The
   assignment data remains private to administrators.
4. Meaningful sort options: latest requests, highest triage priority, and most
   recent customer activity. All sorting and page counts are server-side.
5. Admin authorization caches are scoped to the active user id. Account
   switches clear previous rows/drafts, check administrator rights again and
   discard stale query responses to avoid showing old session data.
6. Saving triage priorities/assignments refreshes the operational queue from
   the database instead of leaving badges stale.
7. Regression coverage for auth boundaries, persisted attention signals,
   server-side filtering, session-safe queries and the original write path.

## Deployment gates

Migrate in order after verifying the existing four Services phases:
- 20261122201000_service_requests.sql
- 20261122213000_service_request_activity.sql
- 20261122223000_service_scope_triage.sql
- 20261122234000_services_delivery_gate.sql
- 20261122235500_service_admin_attention_queue.sql

The remote Supabase connection has previously timed out; merging GitHub code
does not guarantee migrations are applied. Do not describe this service as live
until migration history and staging tests confirm it.

## Staging security test matrix

- Customer A / customer B: query the admin attention view via authenticated
  browser API; both must receive no admin-queue records. Customer-owned
  service desk access must remain isolated.
- Admin X and admin Y: both can read the queue. Priority/assignment changes
  must be reflected after a verified successful save; assignment to self is
  checked against the admin_users foreign key.
- Create one submitted request: its follow-up signal must be true.
- Admin publishes a scope review and changes the status to Reviewing: confirm
  the signal clears unless new customer activity is recorded.
- Customer messages/replies after admin's last action: the signal becomes true.
  Admin publishes a later message or memo: the signal clears.
- Switch from an admin to a non-admin in the same tab: previous admin rows must
  clear before the new account can interact with the queue.
- Test 20+ records with priority/assignment/attention filters and page/sort
  changes. Query totals must be exact, and empty results must not show fabricated
  entries.
- Run npm tests/build and Supabase Security Advisor before production release.

No billing, contracts, service-level commitments, auto-fulfillment or new AI
provider calls are activated by this milestone.
