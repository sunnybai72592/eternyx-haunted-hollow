# ETERNYX Workspace — Phase 19: Realtime updates, in-app notifications and activity tracking

**Source PR only.** Requires approved Phase 17 and 18 migrations followed by
`20261124210000_workspace_team_realtime_notifications.sql`. A GitHub merge
does **not** apply SQL, activate Supabase Realtime, or prove multi-user readiness.

## Delivered in one PR
1. Persist a per-member, per-team server read cursor with a composite FK to active membership; member removal automatically deletes their cursor.
2. Authenticate the read-receipt RPC; require a **real event in the exact team**, never trust claimed owner/recipient or a fabricated event sequence.
3. Advance receipts monotonically using an atomic upsert; another tab's old acknowledgement cannot roll them back.
4. Apply row-level security plus read-only browser grants to notification cursors; only the current team member may view their own cursor.
5. Subscribe to **INSERT only** on the existing server-generated, member-RLS-protected `workspace_team_events` table; conditionally add that table to `supabase_realtime` publication (not private files/comments or invitation secrets).
6. Reconcile task/member/activity snapshots on event arrivals, coalesce bursts, and reload open discussion/checklist data without erasing a drafted message.
7. Provide visible connection status, explicit refresh, 60-second foreground reconciliation, and tab-resume refresh. Channel subscription is not proof that the production publication is configured.
8. Display an **exact server-counted** number of teammate events since the current membership began and beyond the stored read marker (not a capped 30-row estimate).
9. Offer a verified **Mark all seen** action usable by owner/editor/viewer, including on archived teams. Never silently mark events as seen on merely opening a screen.
10. Add genuine activity category/author filters, real actor timestamps, associated task labels where a current task exists, and per-event unread markers across the latest 30 rows.
11. Add pure helper regressions and a disposable PostgreSQL 17 end-to-end three-account RLS, event-binding, role, archived, monotonic and removal test; register both migration and SQL test with mandatory CI and offline release inventory.

## Security and scope
This is **in-app** collaboration notification, not email, OS push, browser Notification API,
unread per-task inbox, presence, private file sharing, or guaranteed history export.
The team events are metadata only, generated on the server by existing RPCs.
Member roles, team RLS, invitations and owner-private Workspace/Storage are unchanged.
A viewer can read and acknowledge but cannot edit shared tasks.

## Release gate
Apply the migration in an authorized **staging** Supabase project only after Phase 18.
Confirm `supabase_realtime` publication actually contains `workspace_team_events`
and authenticated Postgres Changes is active with tenant-specific RLS.
Login as A owner, B editor, C viewer, D outsider. Verify A/B events arrive without
manual refresh in B's real browser, C can mark seen, D receives no team events,
and removed members lose both Realtime access and cursor reads.
Test two active browser tabs, disconnect/reconnect, app background/foreground,
stale writes, archived teams, a new invitee's historic-event cutoff, exact counts,
and all Node/PostgreSQL/build/browser CI. Observe real staging errors and rollback
before authorizing production. Do not claim live delivery until verified in staging.
