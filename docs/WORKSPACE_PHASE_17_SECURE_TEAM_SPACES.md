# ETERNYX Workspace Phase 17 — Secure Team Collaboration Foundation

**Source PR only.** This adds an independently permissioned team subsystem and a new Supabase SQL migration. **Merging does not deploy SQL or grant access to existing private Workspace data.** Production deployment requires separately authorized migration review and genuine multi-account staging verification.

## Included improvements

1. **Isolated team spaces.** A signed-in account may own up to 10 spaces, each with name, description and active/archived state. A new space starts private with exactly one owner membership. Team sharing does **not** modify the original `workspace_projects`, `workspace_tasks`, `workspace_items`, `workspace_task_steps`, `workspace_activity`, import/recovery tables or `workspace-private` Storage RLS policies.
2. **True role-based membership.** The owner is recorded permanently; invitations can grant editor or viewer. Owner/editor can create/update/delete shared tasks on active spaces; viewers have **read-only** access. Only owners invite, revoke pending invites, change roles, remove members and archive/reopen spaces. Members can leave, while owners cannot silently drop ownership.
3. **One-time secret invitation codes.** Each code contains 64 random lowercase hex characters, is returned to its creator once and **never stored in plaintext**. PostgreSQL saves a private hash; the browser cannot SELECT the hash. Codes expire after seven days, are single-use, can be revoked by the owner, and replay by the same active member is idempotent. No emails, public lookup, search for user accounts or unrequested invitations are sent.
4. **Server-enforced tenant isolation.** All five team tables enable RLS and deny direct browser writes. The role helper resolves only the authenticated caller's role using a narrowly scoped SECURITY DEFINER function. Authenticated users can SELECT team data **only** after joining. This does not make legacy personal projects or private files accessible.
5. **Shared task assignments.** Team tasks persist title, details, priority, status, due date, creator, optional current-member assignee, actual completion transition time and update timestamp. The server refuses assignment to outsiders, enforces at most 500 tasks/space and requires an optimistic timestamp for updates to prevent stale overwrites.
6. **Controlled lifecycle.** Archive makes team task writes and new invitations unavailable; reopening is owner-only. When a member leaves or is removed, their existing tasks remain, but their assignment is cleared. Owner/editor deletion emits a server event.
7. **Server-generated audit trail.** All membership, invitation, task and archive changes create immutable-to-browser event rows. Users cannot fabricate or delete activity through standard browser roles. The UI shows the latest 30 actual events; no made-up engagement scores or simulated synchronization.
8. **Genuine Workspace UI.** Create and join a team, select existing memberships, generate/revoke one-time codes, manage roles, leave, archive/reopen, assign/edit/delete tasks and see server activity. All mutations call authenticated RPCs, and account changes clear previously loaded team data. Refresh is explicit; **real-time collaboration is not yet enabled**.
9. **Three-user PostgreSQL security regression.** Disposable tests exercise owner→editor→viewer, joining by invitation, code replay and revocation, uninvited outsiders, foreign task assignment refusal, stale update rejection, activity write grants, legacy personal project isolation, archiving and post-removal access revocation.
10. **Release inventory and Node tests.** CI applies the new migration in disposable PostgreSQL and runs its three-user acceptance test; the offline Workspace release inventory now includes both new source files. Node tests cover strict invite code format and task validation/role capability rules.

## Known limitations / choices

- **Phase 17 uses SEPARATE team spaces.** It does not share an existing personal project, task, note, file or backup with team members. Converting personal projects to shared ones would require an explicit, thoroughly reviewed data migration and Storage-sharing model; it is intentionally not attempted here.
- Invitation tokens are **bearer secrets**. Anyone with a valid unused code who has a signed-in account can join. A sender should deliver it privately. Invitation codes are not tied to the recipient's email or identity. The database stores only an MD5 hash of a **high-entropy, random 64-hex token**; this is a preimage-resistant token lookup in this context, **not a password-storage scheme or a signed proof of authenticity**.
- Other members are displayed by a short account-ID prefix, not fabricated names or emails. Profile names, discovery and secure address-based invitations are later design work.
- All team changes happen through explicit server RPCs. This is not a live WebSocket/realtime collaboration solution, does not send push notifications, and does not include inline file sharing or team checklists yet.
- No new third-party messaging provider, external AI API, GPU, email automation, subscription gate, public Storage bucket, or paid service is introduced.
- Team rows and events remain tied to their membership and server-permitted account. Authenticated clients cannot issue direct table INSERT/UPDATE/DELETE.
- The new SQL does not automatically apply to existing Supabase projects; the UI depends on deploying that migration in staging and production in correct order.

## Staging acceptance before production

1. Review and apply `supabase/migrations/20261124170000_workspace_team_spaces.sql` in **authorized staging** after prior Workspace migrations. Check actual PostgreSQL function search paths, RLS policies and browser role grants. Do not apply it directly to production without approval.
2. Sign in as A and create a team. Verify user B and a third unrelated user C cannot see it prior to invitation. Verify A's existing personal tasks, notes, backups and `workspace-private` files remain strictly owner-only.
3. A creates a one-time viewer or editor code and privately shares it with B. B joins; B alone may replay its consumed code. C cannot reuse it. A can revoke an unused invitation; expiry is seven days.
4. Assign a task to B, update it from an editor account, and test a stale timestamp conflict. Switch B to viewer: B must see tasks but cannot create/update/delete them or invite others.
5. Remove B and verify B cannot read team tasks, members or activity anymore. Old accepted code must not restore membership. Assignments should clear without destroying task history.
6. Archive, reopen and delete test tasks. Confirm the activity history records real events and archived teams refuse mutations.
7. Run PostgreSQL acceptance workflow and general app tests/build/browser smoke; verify the release inventory includes this migration/test.
8. Test the React UI in authenticated staging on mobile and desktop. **Public CI browser preview does not sign into Supabase**, so it is not sufficient to certify authenticated team UI/Storage behavior.
9. Confirm no private-team data leaks into public search, personal project exports or unrelated authenticated users. Collect operator sign-off and rollback plan before rolling out.

## Next planned phases

Phase 18: richer shared task workflows (comments/checklists, optional identities, controlled notifications). Phase 19: real-time team updates and verified staging lifecycle/observability. Direct private file collaboration requires a separate Storage access design and is intentionally deferred.
