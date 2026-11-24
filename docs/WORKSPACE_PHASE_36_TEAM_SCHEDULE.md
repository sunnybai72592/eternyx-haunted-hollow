# Workspace Phase 36 — Team scheduling, rescheduling and calendar handoff

Workspace adds a third **Schedule** view alongside List and Board.

- Group the current filtered RLS-loaded tasks by **overdue**, **today**,
  **next seven days**, **later**, **no due date**, and **completed**.
- Sort each schedule group by actual date and task identity, never
  fabricated event timestamps or activity scores.
- Give editors a labeled per-card due-date input in all three views.
  A changed date or cleared date uses the existing authenticated
  `workspace_team_save_task` RPC, full validated fields, and the exact
  `updated_at` concurrency token. No optimistic local modifications.
- Export only visible, currently authorized **outstanding dated tasks**
  as an all-day `.ics` file, excluding completed or undated work.
  Calendar end dates are exclusive (including year rollover).
- Keep titles/details safe by escaping RFC5545 properties, removing
  newline injection, and folding UTF-8 content to 75 octets per line.
  Assignee display labels are pseudonymous. Export is local to the browser.
- Reuse the current role/space verification and existing team/account
  layout reset, visibility masking, bounded 500-task view, and search
  and priority/assignee filter composition.
- Add ten test groups covering calendar boundaries, expiry, cross-team
  data, edits, property injection, UTF-8 folding and UI wiring.

No production schema changes or remote SQL. Staging backend/RLS, permissions,
Realtime and Storage checks remain unverified; CI does not replace them.
