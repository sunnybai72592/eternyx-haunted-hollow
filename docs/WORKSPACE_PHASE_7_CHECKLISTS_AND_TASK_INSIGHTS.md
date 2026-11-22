# ETERNYX Workspace Phase 7 — Real task checklists and operational detail

**Status:** Proposed source code + migration, not a deployed database change. Requires existing Workspace phases 1, 2, 5 and 6 migrations.

## Real improvements in this PR

1. **Private task checklists:** Each task can have up to **30 persisted steps** with actual server-backed create, rename, complete, reopen and delete operations. The browser fetches steps only when opening the checklist to avoid expensive per-task queries on a library of thousands of tasks. A failed query is an error, never a pretend empty checklist. Two-tab edits use `updated_at` preconditions.
2. **Owner and archive isolation enforced in PostgreSQL:** `workspace_task_steps` has owner-only RLS, references an actual task and requires that task's project to be active for all writes. SELECT remains available to the owner of archived tasks. An owner-specific, transaction-locked trigger prevents more than 30 steps even under concurrent browser inserts. Deleting a parent task cascades its steps and their contents.
3. **Persisted task instructions:** `workspace_tasks.details` (up to 4,000 characters) allows real acceptance criteria, instructions, and notes. Creation and update are owner-only, constrained in the database, and old records default to an empty string.
4. **Honest completion timestamps:** A server trigger records the timestamp on transition to Done and clears it when reopened. Other edits cannot forge or reset it. Historical completed tasks deliberately keep `NULL` completion times; the UI says when the old completion time is unknown instead of inventing a date.
5. **Real project progress:** The project task section shows actual completed/total, open, overdue and urgent-open counts with an accessible progress bar. These are derived from the loaded RLS-backed records, not fabricated activity scores or XP.
6. **Task operations:** Copy a task to a new, unfinished task in the same project with its title, priority, details and due date—never original IDs, checklist steps or completion time. Explicitly reopen all Done tasks in a project through a scoped database update after confirmation.
7. **CSV task export:** Download project tasks (title, instructions, status, priority, deadline and recorded completion timestamp) as a UTF-8 CSV with spreadsheet formula-injection mitigation for arbitrary user text. The CSV excludes owner IDs, storage object paths and checklist steps. Each exported row must belong to the selected project.
8. **Portable task instructions:** Metadata-only (v1) and private-file-inclusive (v2) backups preserve task descriptions. Earlier exports lacking them restore as empty instructions; description length is validated before any restore writes. Other previously supported fields and v1/v2 formats remain compatible.
9. **Regression acceptance:** Node tests cover CSV escaping/formula protection, progress counts, safe task duplication, and both backup versions; isolated PostgreSQL 17 tests two-owner RLS, archived read-only checklists, limits, task completion clock, forgery rejection and cascaded task deletion.

## Honest limits and safety boundaries

- **Checklist steps are not yet included** in v1/v2 project backups or CSV exports. Before irreversible project deletion or account deletion, the user must preserve any essential checklist steps separately. A future versioned backup format could add checklists with owner-safe task mappings. Do not label existing project backups as complete task/checklist disaster recovery.
- The completion timestamp represents observed **post-Phase-7 server transitions**. Historical `done` records have unknown completion time, and an imported completed task gets a new completion time when it is restored (not the original date).
- Checklist step cap is **30 per task** and task instructions are capped at **4,000 characters**. Parent task limits from Phase 5 still apply.
- Only actual signed-in Supabase owners can read steps. Archived projects remain strictly read-only. No team sharing, public file links, paid AI service, notifications, GPU, background jobs, or fake data is introduced.
- The CSV formula prefix guard reduces spreadsheet injection risk but spreadsheet apps can vary; imported spreadsheets should still be treated as data, not executable instructions.
- Existing registered-file byte accounting, quota triggers, private-file cleanup and archive purge protections remain unchanged.

## Review and rollout

1. Confirm the previous Workspace migrations have been staged and deployed in order.
2. Apply `supabase/migrations/20261124050000_workspace_task_details_checklists.sql` in authorized staging **after** Phase 6. Do not modify production directly from a merged PR.
3. Run `npm test`, `npm run build`, browser acceptance and the dedicated isolated PostgreSQL 17 workflow.
4. With two real Supabase users, verify checklist rows are unreadable/editable cross-account, archived projects are read-only, and 31st step is rejected by the server.
5. Create a task, mark it Done, edit details without changing the timestamp, reopen, complete again and verify real transition times. Confirm imported legacy Done tasks do not falsely claim an original historical completion date.
6. Exercise task duplication, CSV export with formula-like text, project progress and both v1/v2 import workflows.
7. Confirm a deleted task cascades checklist rows, and an archived project purge removes task and step data only under the prior Phase 6 safety checks.
8. Test mobile/keyboard behavior, slow network failures, concurrent tabs and the existing device scratchpad.

**Deployment note:** SQL and client changes are committed for review only. The PR does not apply migrations, deploy an Edge Function, delete data or alter billing.
