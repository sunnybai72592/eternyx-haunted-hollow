# ETERNYX Workspace — Phase 2: Real Editing, History and Portable Exports

This release builds on Phase 1's authenticated project/task/item/private file tables.
The SQL migration and UI do **not** become live until reviewed and deployed.

## Shipped in source

- **Edit existing saved notes and bookmarks** without duplicating items. The database keeps previous versions transactionally and advances a server-controlled revision.
- **Browse up to 20 previous revisions** for a note or link; restore a chosen version while preserving the current version in the history. Files are never rewritten as if they were text notes.
- **Optimistic concurrency:** updates require the revision the user actually saw, so stale browser tabs fail instead of silently overwriting newer edits.
- **Project export:** on-demand download of a versioned JSON snapshot. The export queries project tasks and items independently in bounded pages (up to 10,000 each); if it cannot load every row, it fails rather than produce an incomplete archive. It includes notes and bookmark URLs. **File binaries, revision history, storage keys, and user account secrets are not exported**. This is not a full backup.
- **Useful filtering** for task status and task/title/due-date query, plus saved-item type and text search, limited to records currently loaded in the project dashboard.
- **Server-enforced archived read-only:** task/item create/update/delete and private file upload/delete are blocked by RLS when a project is archived; downloads/read access remain owner-only. Restoring the project re-enables writes.
- **Corrected baseline migration:** fixes an invalid dollar-quote delimiter that would otherwise prevent the Phase 1 migration from applying from scratch.

## Security

Public workspace tables have row-level security. Revision history rows are created only by a SECURITY DEFINER trigger owned by the database migration role, with an empty search_path and no direct browser INSERT/UPDATE/DELETE. Browser users receive only SELECT on their own history. Ownership is independently checked by the notes table and in the revision table's SELECT policy. An old tab cannot clobber newer content because the user update matches both item ID and revision.

The standalone acceptance workflow runs original and follow-up migrations on disposable network-isolated PostgreSQL 17, with minimal auth/storage fixtures, then impersonates two authenticated users and checks RLS isolation, revision preservation, no-op updates, audit, archive denies, and restoration. The integration test fixture is **not** the hosted Supabase service: staging acceptance remains necessary.

## Deployment gates

1. Confirm previous Workspace migration history. If Phase 1 was not applied, deploy the corrected Phase 1 SQL first, then this revision migration. If it was already applied, do not rewrite existing production migration history; apply the new revision migration in order.
2. Run Node tests, Vite build, and dedicated isolated PostgreSQL CI.
3. Use a staging Supabase project to check actual authenticated client calls. Verify cross-account reads/edits and Storage operations; verify that archiving makes project data truly read-only.
4. Create and edit a note twice; open version history; restore first version; test conflicts using two browser tabs. Confirm file records are never editable as notes.
5. Download a project export, inspect its text data, confirm it contains no Storage paths or account IDs, and verify that binaries are clearly excluded.
6. Repeat with mobile and keyboard navigation; confirm previous device scratchpad browser acceptance tests remain green.
7. Review Supabase security advisers and storage quota controls prior to production rollout.

This release does **not** add team sharing, automatic cross-pillar result capture, encrypted offline backup, revision pruning, total-project search across unloaded pages, or large-file archival. Do not present those capabilities as live.
