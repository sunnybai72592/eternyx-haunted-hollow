# Workspace Phase 32 — Real-team task triage and handover

Phase 32 adds actual task search and export using only the current, RLS-loaded
team snapshot. It does not simulate records or call a new backend.

## User-visible workflow improvements

1. Search shared task titles and details (up to 120 characters) locally.
2. Filter overdue, upcoming within the next seven **calendar days**
   (including today), and completed work, in addition to existing filters.
3. Sort by recent activity, earliest due date, urgency, or task title.
4. Display real outstanding, overdue, upcoming and completed counts.
5. Mark overdue tasks in the list, excluding completed items.
6. Export **only currently visible filtered tasks** to local CSV for handover.
   The client does not request unseen team data, raw user IDs or invites.
   CSV cells are quoted, quotes escaped, and spreadsheet formula prefixes
   neutralized. No export is possible while team authorization is masked.
7. Reset search/sort/filters on account or team switches; do not leak one
   team's view preferences or previous rows into another team's screen.
8. The team directory now requests `count: "exact"` to fail closed if a
   150-item API limit truncates the server's membership list.

## Testing and remaining release blockers

Ten Node regression groups cover calendar boundaries, filters/search,
sort, stable summaries, CSV injection, foreign team data, malformed rows,
oversized exports, member directory truncation and UI wiring.

No new database migration or remotely executed SQL. Team server RLS and
RPC checks remain authoritative. Production has NOT been certified;
real staging role, realtime, storage and migration deployment tests remain.