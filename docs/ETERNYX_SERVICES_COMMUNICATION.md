# ETERNYX Services — Conversations, Timeline and Review Safety

This milestone follows the original Services request intake. It creates a real
account-owned follow-up channel for each request, a server-authored audit timeline
for status changes, an administrator conversation interface and safe concurrent
review behavior. No payment, contracts, SLA or automatic service delivery is
activated here.

## Improvements delivered

1. Customers can open one request's conversation and send validated follow-ups.
2. Admins can view and reply to that request from a search- and status-filtered
   service desk, after the existing verified admin authorization check.
3. Request-creation and status-change events are recorded on the server by
   database triggers, not editable by browser clients.
4. Admin status changes use optimistic concurrency on updated_at: stale edits
   cannot silently overwrite an intervening update. Timestamp manipulation
   is no longer a permitted frontend action.
5. Activity is scoped by request-owner/admin RLS. Customers cannot read another
   account's activity, forge audit events, update/delete messages, or claim an
   admin status by posting a message.

## Deployment sequence

1. Confirm that the previous migration
   supabase/migrations/20261122201000_service_requests.sql is deployed.
2. Apply
   supabase/migrations/20261122213000_service_request_activity.sql
   through the project's reviewed migration workflow, not by merging a PR
   alone.
3. Run npm test and npm run build, then use two separate authenticated test
   accounts and a verified administrator in staging.
4. Verify customer A cannot SELECT or INSERT into B's request. Try forging
   event_type=status_changed, created_at, from_status or to_status using
   client credentials and verify database rejects them. Verify UPDATE and
   DELETE on service_request_activity are denied.
5. Verify an admin status update creates an immutable timeline entry, and
   a new request creates a request_created event. Verify a customer message
   does not alter request status.
6. Open two admin sessions, load the same request, save a change from one
   session then save a stale draft from the other: the second must fail with
   a refresh-required notice, never overwrite.
7. Verify mobile and keyboard layouts, scroll behavior, and a browser refresh
   that preserves the saved conversation.
8. Run Supabase security advisors and cross-account RLS checks before launch.

## Notes

- Conversations are intentionally plain text only. Do not paste credentials,
  sensitive customer records or production data; attachments are not supported.
- Activity shows up to 200 oldest entries per request. Pagination and retention
  controls are a separate follow-up before high-volume launch.
- The live database was not modified by this GitHub PR. Production migrations
  and staging RLS checks are release gates.
- If service_requests is not yet present, this follow-up migration will not
  apply; run them sequentially.
