# Workspace Phase 20 — notification snapshot and paginated activity inbox

**Source PR, not a deployment.** Phase 17–19 migrations must precede
`20261124230000_workspace_team_notification_snapshot.sql` in an approved staging
environment. This phase does not change personal Workspace private sharing
or introduce fake communications.

## Improvements
1. A SECURITY DEFINER **single-statement, current-member-only** notification snapshot
   returns exact teammate unread count, current server cursor and newest actual event ID,
   avoiding race-prone separate browser reads.
2. The RPC is explicitly granted only to authenticated accounts. A removed member
   or outsider gets no snapshot. SQL does not return personal files, comments, messages
   or event bodies.
3. Mark-all-seen uses a fresh server snapshot and the existing monotonic,
   team-event-validated Phase 19 receipt RPC.
4. Activity history loads older real event rows in pages of 40, using event-ID
   keysets, current-team RLS and exact SQL counts for incomplete-page detection.
5. Never silently replace a failed page with an empty list; failed auth, wrong-team
   payloads, malformed IDs or inconsistent counts display errors instead.
6. Deduplicate event IDs, retain deterministic newest-first order and cap the
   in-browser history view at 400 metadata-only events.
7. Reset older-page pagination on new activity to avoid cursor gaps when realtime
   events arrive during a long session.
8. Search and filter already loaded server activity by action, task title,
   category, actor and unread-only status.
9. Open a real existing team task directly from its activity entry. Deleted
   tasks do not invent a route.
10. Explicit user-initiated CSV export covers **visible loaded events only**,
    including timestamp, actor label, action and related task. CSV-injection
    characters in untrusted task titles are escaped.
11. Node regressions verify snapshots, paging, deduplication, cross-team rejection,
    local search and spreadsheet injection; PostgreSQL 17 CI runs true three-account
    owner/viewer/outsider snapshot acceptance plus archive and removal tests.

## Limitations and release gate
- Realtime is best-effort and must be validated with authenticated browser accounts
  in Supabase staging. The client continues to poll while visible and has a manual
  refresh button. An event channel subscription does not prove delivery.
- The team activity history is **not** an immutable compliance archive; records
  still reside in the team's server tables. CSV is a user-initiated partial export.
- Search applies only to the currently loaded metadata; it does not issue an
  unbounded full-history search.
- Deploy Phase 20 SQL only after reviewing Phase 17–19 migrations in staging.
  Verify owner A, viewer B, outsider C, member removal, archived read-only access,
  multi-tab mark-seen, pagination through 100+ real events, export, reconnect, and
  RLS before approving production.
