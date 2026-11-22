# ETERNYX Digital Workspace — Functional Foundation

> **Status:** Code and database migration proposed in a pull request. The cloud Workspace is **not active** until the SQL migration has been reviewed, deployed, and acceptance-tested. Do not describe this PR as a live multi-user collaboration system.

## Why Workspace exists

Workspace is the user's private organizational layer across ETERNYX. The Cybersecurity, Developer, AI, Cloud, and Automation pillars perform work; Workspace keeps owner-managed projects, task status, saved notes, useful verified links, and uploaded private files associated with those projects. It does **not** pretend to run external tools or synthesize results. Users may save a real link to an existing tool or an external HTTPS resource.

## Implemented in this PR (after migration deployment)

- Create projects with names/descriptions, edit details, archive/restore (no hard-delete of projects and their files).
- Create tasks, assign optional due dates, change statuses, and delete tasks; server timestamps and owner-scoped records.
- Save project notes and HTTPS/internal route references. Links are reviewed by the owner before saving.
- Upload and download real Supabase Storage files through a **private** bucket. 5 MiB limit; PDF, PNG, JPEG, WebP, TXT, CSV and JSON only.
- Remove saved items and uploaded objects; error state is shown if cleanup is unsuccessful.
- Database-triggered activity events; browser roles have **SELECT only** on activity.
- Browse existing device notes and **explicitly** import a chosen copy into an owned project. No silent localStorage migration.
- Actual owner-scoped project/open-task/file counts and bounded recent history. No mock metrics.
- Existing browser scratchpad remains accessible even when signed out, with its original privacy caveat.

## Authorization model

All new tables use RLS and owner_id = auth.uid(). Task/item rows have a composite (project_id,owner_id) foreign key to prevent assigning data to another user's project. Browser roles have **column-restricted INSERT/UPDATE** privileges; cannot change an existing row's owner. Private Storage objects use a user-id/project-id path and RLS checks the parent project's owner. No public bucket or public URLs exist. The client uses authenticated Storage download, not permanent public links.

Activity is written by restricted database triggers, not user-provided JSON. The trigger is SECURITY DEFINER, with an empty search_path and revoked direct EXECUTE; only reads of activity are granted to authenticated browser sessions. There is no team-sharing model in this release.

## Operator deployment & verification

1. Review migration `supabase/migrations/20261123050000_workspace_owner_projects_tasks_items.sql`, available migration ordering, storage/bucket policies, and dashboard security advisors. Use the project's normal reviewed deployment process; **this PR does not execute remote SQL**.
2. Deploy migration to a staging project first, then check the actual endpoint access. Confirm the schema is exposed through the Data API with appropriate grants (the migration grants authenticated access and enables RLS).
3. Sign in as **Account A**. Create project A; edit its description; create and complete a task; save a note and a link; upload and download a 1 KB TXT file; archive and restore the project; check activity.
4. Sign in as **Account B** in a separate browser profile. Check that project A is not listed, A's row IDs cannot be selected, updated or deleted, and B cannot read, list or remove A's Storage object even using its full path. Attempt inserting a task or file metadata with A's project ID; the ownership constraint/RLS must reject it.
5. Confirm malicious `javascript:` and protocol-relative links are rejected; disallowed MIME types and files over 5 MiB cannot be uploaded. Confirm no public object URL is generated.
6. Confirm the browser-local scratchpad works without signing in, and no copy uploads without explicit confirmation. Repeat on mobile and keyboard-only navigation.
7. Check CI (Node tests, build) and review database advisor warnings before considering this migration production-ready.

## Known constraints / next milestones

- Shared-team collaboration, ACLs/invitations and organization tenancy are **not enabled**. Adding them requires a separate audited access model.
- Full cross-pillar artifact capture and auto-sync are **not enabled**; this iteration saves owner-chosen routes, links and notes. Do not call manual bookmarks automatic workflow orchestration.
- File versions, quota billing, large-file transfer, backup/export, full-text search and automatic account-deletion cleanup for Storage objects need separate implementation and tests.
- There is no free-cost guarantee for hosted Storage/database usage. Review project-level quota and abuse protection before offering files to an unrestricted public audience.
- The current UI limits reads to 100 projects, 1000 tasks, 1000 items and the 30 newest activity events. Add paginated queries before presenting them as unbounded archives.
- Do not activate billing, paid providers or external writes as part of this Workspace change.

**Product rule:** A capability is Available only after its backend, RLS, real-browser behavior and storage semantics are verified. Until then, call it proposed or pending deployment.
