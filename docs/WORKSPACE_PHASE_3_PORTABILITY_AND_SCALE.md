# ETERNYX Workspace Phase 3 — Portability, task control and larger libraries

**Status:** Code proposed for review. This PR does not deploy the Supabase schema or make paid API calls.

## What this PR actually enables

1. **Restore project from a Phase 2 JSON export**: Validate versioned `eternyx.workspace.project` JSON locally, preview the project and record counts, ask for confirmation, create an entirely new authenticated project, then import actual tasks, notes and HTTPS/internal bookmarks through owner-scoped Data API writes.
2. **Explicit limitations**: JSON export does **not** contain private file bytes, older revision snapshots, or binary data. These cannot be restored and the UI clearly reports skipped file manifests. Imports are limited to 1 MiB of JSON and 1,000 tasks + 1,000 items. This is **not a full disaster-recovery backup**.
3. **Partial import recovery**: Each upload batch contains at most 50 records; errors state how many records were successfully created and preserve the created project for inspection. No false promise of cross-table atomicity.
4. **Task editing**: Rename a task and update/clear its due date, with an `updated_at` concurrency precondition to reject stale-tab edits.
5. **Real date queue**: Filter to overdue, due today, upcoming, and undated tasks based on the viewer's local calendar day, excluding completed tasks from overdue/upcoming alerts.
6. **Larger Workspace reads**: Paginate owned projects, tasks and items with stable ordering instead of silently stopping at 100/1000. Client currently sets an explicit upper limit of 5,000 records per collection; if exceeded, it reports an error instead of claiming the first 5,000 is a complete library.
7. **Safer private-file deletion**: First delete the owner-scoped metadata record. Only after that succeeds, remove the Storage object. If Storage refuses removal, attempt to reinstate metadata so the user can locate the original file; surface recovery failures instead of misreporting success.

## Security & controls

- No unsafe URL schemes, browser scripts or storage paths from the import file are trusted. The parser whitelists user-facing titles, notes, HTTPS/internal links, tasks, and due dates; server-generated ownership and project IDs are assigned on insert.
- Existing Supabase RLS policies, composite project ownership constraints and private Storage policies remain authoritative.
- Imported files never trigger automatic upload, fetching or execution of external content.
- Each import requires a signed-in user, explicit file selection, preview and confirmation.
- Project import is **not** a replace/overwrite; it always creates a new private project.
- Dashboard paging and sorting use deterministic unique IDs as tie-breakers.
- Database truth and errors are surfaced; no mock records or fake success states are added.

## Acceptance

- Run `node --test tests/workspace-restore.test.mjs tests/workspace-paging.test.mjs`.
- Run full `npm test`, `npm run build` and browser preview tests, including the existing device scratchpad.
- In staging, create an actual project, task, note and link. Export JSON; import it under a separate project. Verify record counts, ownership, and file manifest limitations.
- Attempt a malicious external link, malformed date and over-sized import; verify no project is created.
- Simulate a DB insert failure after the project is created, verify partial project is visible with an explicit error.
- Edit a task in two tabs: stale edit must reject with a visible message. Verify archived projects remain read-only.
- Load more than 1,000 tasks/items and verify page completeness; use two users to verify row isolation.
- Simulate Storage delete failure and confirm the file metadata row is recovered and remains owner-scoped.

## Not claimed

Full binary archival, team collaboration, scalable server-side search of arbitrarily large datasets, resumable imports, perfect atomic file deletion, comprehensive account deletion cleanup and automated cross-pillar artifact ingestion remain separate work. In particular, a JSON export is **not** a complete Workspace backup.
