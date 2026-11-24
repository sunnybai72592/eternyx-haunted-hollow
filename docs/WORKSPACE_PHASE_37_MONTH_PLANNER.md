# Workspace Phase 37 — Monthly planner and live local dates

- Navigate Gregorian months with real filtered daily counts and accessible outstanding/completed labels.
- Select a date to review task summaries; use existing role-gated controls in the groups below. Undated tasks remain in schedule groups; exports still cover the full filtered view.
- Today returns to the current local day; refresh every 30 seconds and on focus/visibility changes, with cleanup.
- Reset selection on team/account changes. No new database calls, migrations or paid resources.

Run `node --test tests/workspace-team-schedule.test.mjs` and the full suite. Browser checks for narrow screens, keyboard selection, midnight rollover, filter composition and access revocation remain necessary. Live staging RLS, Storage and Realtime are not verified.
