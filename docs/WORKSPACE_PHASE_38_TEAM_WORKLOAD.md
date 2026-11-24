# Workspace Phase 38 — Real team workload

The expandable workload table uses the full verified team snapshot, not filtered
or fabricated data. It includes zero-task current members, unassigned tasks,
and a privacy-preserving aggregate of assignments outside the current roster.
Outstanding, in-progress, overdue, upcoming (today through seven days), urgent
open and completed counts are actual task counts, not capacity or effort.

Outstanding and overdue buttons replace task filters, clear search/priority,
and show matching assignments in List view. Unknown assignees are not clickable.
All roles with verified access can read the table. The view resets on team or
account changes; no writes, migrations or new service dependencies.

Run `node --test tests/workspace-team-task-operations.test.mjs`. The focused
workflow uses Node without npm installation. Verify in real staging/browser:
role revocation, roster changes, team switching, responsive table and keyboard
navigation. Staging RLS/Storage/Realtime remain separate release gates.
