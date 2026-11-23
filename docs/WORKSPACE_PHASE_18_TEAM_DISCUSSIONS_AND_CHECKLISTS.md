# ETERNYX Workspace Phase 18 — Team Task Discussions, Checklists and Assignment Workflows

**Status: proposed source code.** Builds on Phase 17 separate, owner/editor/viewer team spaces. Requires a separately approved, staged Supabase migration. **Merging this PR does not deploy database changes or prove live production permissions.**

## Delivered improvements

1. **Real shared task discussions:** `workspace_team_task_comments` stores a persistent author, team/task identifiers, body and server timestamps. Every signed-in member may read comments from teams they still belong to. Active team owners/editors may post; viewers and nonmembers cannot. 2,000 characters per comment, 200 comments per task.
2. **Safe comment moderation:** author or owner may redact comment text in an active team. Redaction **replaces** the stored body with `[Comment redacted]` and keeps its author/timestamp/redaction event. A viewer, unrelated editor, outsider or archived team cannot redact. A redacted comment cannot be restored via browser, and repeated redaction does not duplicate activity.
3. **Real team task checklists:** `workspace_team_task_steps` stores actual checklist steps (max 30/task), creator, title, done state, completion author/time and update version. A step's team ID must match the referenced task's team ID at the database level.
4. **Check/uncheck with optimistic concurrency:** owners/editors may complete or reopen steps using the exact last-seen `updated_at`. Stale or missing versions fail rather than overriding another person's changes. Real completion actor/timestamp is recorded; reopening clears them. A no-op repeat doesn't manufacture a second event.
5. **Controlled step removal:** active-team owners/editors can remove checklist steps; a server-generated activity event records the removal, while the deleted step disappears from the live checklist. Archived teams and viewers cannot mutate.
6. **Assignment activity:** server-side trigger records real `task_assigned` or `task_unassigned` events whenever a team task's assignee changes, including removal/leave unassignment. The existing Phase 17 membership checks and assignment restrictions stay intact.
7. **Dedicated per-task collaboration interface:** a member selects a real shared task, then sees its persisted comments and checklist with progress, author labels, completion times and permission-aware controls. Viewers see read-only content; archived teams cannot write. Private personal project/files remain completely separate.
8. **Assignment-focused task filters:** All, Assigned to me, Unassigned and Outstanding filters operate over actual member-scoped task rows. They do not invent notifications or claim real-time synchronization.
9. **Strict bounded reads:** comments and steps are fetched with server exact counts and row caps. A truncated page or backend error is displayed instead of silently hiding missing team data. Auth freshness is checked during reads and mutations; old team/account results are suppressed when selection changes.
10. **Expanded server activity:** `workspace_team_events` now records discussion, redaction, checklist and assignment events. Browser roles cannot forge activity or write directly to comments/steps tables.
11. **Regression acceptance:** Node tests validate comment/step input bounds, moderation, progress and assignment filters. The disposable PostgreSQL 17 workflow runs real **three-account RLS and RPC security tests** covering owner, editor, viewer, outsider, cross-space injection, stale checklist writes, actual timestamps, redaction, archived writes and membership removal.

## Boundaries and limitations

- **No new personal-data sharing:** `workspace_projects`, `workspace_tasks`, `workspace_items`, user-only Storage, archived exports and recovery ledgers keep their original private owner-only policies. Team content uses separate tables; there are **no shared file uploads** in Phase 18.
- Viewer is read-only, **including comment posting**. Grant editor to someone expected to add discussions or complete checklists.
- Comments are plain text, not HTML/Markdown with embedded active content. The client relies on React text escaping; no external links or attachments are automatically fetched.
- Comment redaction alters the live body, but SQL administrative/service access and backups may retain earlier values; this is not a legal erasure mechanism or permanent tamper-proof audit log.
- PostgreSQL transactions lock the team row before changing child objects and enforce owner membership on the server. Browser-side optimistic timestamps are supplementary; browser UI permission display is never authoritative.
- The team activity view shows only the most recent 30 events; it is not a complete immutable compliance archive.
- **No real-time subscriptions, chat presence, file sharing, push notifications or email invitations.** Users refresh to see other people's changes. No paid GPU or external AI service.
- Current checklist steps and comments are separate from **personal** Workspace backup/restore formats; Phase 18 does not claim they are included in personal project exports.
- New database objects and RPCs require the SQL migration to be deployed before the UI can work. A clean GitHub merge is not a Supabase deployment.

## Staging and release acceptance

1. Apply Phase 17 migration first in approved **staging**, then `supabase/migrations/20261124190000_workspace_team_discussions_checklists.sql`; verify functions have empty search paths, correct authenticated EXECUTE privileges, no direct browser UPDATE/INSERT/DELETE grants, and RLS on both new tables.
2. Sign in as owner A, editor B, viewer C and unrelated user D. Confirm that uninvited D cannot read or write, viewer C can read but cannot post/toggle/delete/redact, and B can post, create steps and redact only its own comment.
3. Confirm an unrelated team-task ID cannot be used to attach a comment or step across spaces; test direct SQL/browser attempts and actual Supabase PostgREST role behavior.
4. Post multiple comments, redact one, retry redaction and verify the text no longer appears in live reads and only one redaction event is written.
5. Create a checklist, complete a step and reopen it. Verify completion actor/timestamp, stale-write refusal and max 30 steps even with multiple browser tabs.
6. Assign and unassign a member using the existing task editor. Confirm server task events and that member removal/leave clears assignments without deleting task history.
7. Archive the team: read remains available but comments/steps are read-only. Reopen to resume.
8. Run all Node tests, app builds, desktop/mobile browser checks and isolated PostgreSQL acceptance through GitHub CI.
9. **Run an authenticated browser staging session.** Existing public preview browser smoke does not sign in to Supabase and cannot certify real team screens.
10. Verify no personal project, file or recovery data becomes visible to another team member. Gather operator approval and deployment rollback plan before production.
