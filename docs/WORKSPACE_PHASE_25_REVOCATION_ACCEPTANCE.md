# Workspace Phase 25 — live staging member revocation and Realtime isolation

## Why this is a separate test

Phases 21–24 establish read-only team boundaries, ordinary Realtime delivery,
owner/editor task writes, and personal Storage ownership. None proves that a
**previously authorized subscriber** stops receiving live team events after
a legitimate owner removes that member. A successful `SUBSCRIBED` result is
never proof of delivery or exclusion.

This Phase 25 operator-only test uses a **new dedicated staging team** and
the four dedicated staging accounts from Phase 21. It deliberately performs
**real database writes and removes the test editor's membership**. A temporary
task is deleted during cleanup; the membership removal and server-generated
audit events **persist after the test**.

Never run on production or a team containing real users or work data.

## One-time operator setup

In an authorized, independent STAGING Supabase project, create a fresh
**active**, **empty** team named exactly:

`ETERNYX STAGING REVOCATION PROBE`

There must be **exactly three members**: fixture owner (owner role), fixture
editor (editor role, explicitly consenting to removal), fixture viewer (viewer
role). Fixture outsider must not be a member. No team tasks, and **no
unconsumed active invitations**. Do not reuse the Phase 21 team or Phase 23
write-test team. The test editor MUST be a disposable, authorized staging
account; never remove a real person's membership.

Set the 17 existing `WORKSPACE_STAGING_*` Phase 21 environment variables,
plus privately set:

- `WORKSPACE_STAGING_REVOKE_SPACE_ID` — dedicated team UUID
- `WORKSPACE_STAGING_REVOKE_CONFIRM=REMOVE_DISPOSABLE_STAGING_EDITOR`
- `WORKSPACE_STAGING_REVOKE_HISTORY_CONFIRM=PERSISTENT_STAGING_REVOCATION_AUDIT_ACKNOWLEDGED`

Use a nonproduction project ref and a publishable/legacy anon key, not a
service role key. Base validation blocks Eternyx's known production project.
Run `npm run workspace:staging:revoke:config` first (no network/writes),
then `npm run workspace:staging:revoke` when authorized.

## What a successful *real* run verifies

1. All four real Auth accounts are distinct, active team roles exact, owner
   legitimate, no outstanding invitations and no existing team tasks.
2. All four scoped Postgres Changes subscriptions become active; the owner
   creates a real temporary task.
3. Owner, editor and viewer **each actually receive** the same server
   `task_created` event. Outsider receives none. The event is persisted.
4. The owner removes the editor via existing
   `workspace_team_member_change` RPC, and a real `member_removed`
   event plus two remaining member rows are confirmed.
5. The editor's **original still-signed-in JWT** loses team spaces, tasks,
   events, members, cursors, comments/steps, notification snapshot and role.
6. Fresh login of the removed editor still cannot read protected team data.
   Both stale and fresh sessions fail to update an existing test task.
7. A new scoped subscription is armed as the freshly logged-in, removed
   editor account while original owner/viewer subscriptions remain active.
8. Owner edits the task. Owner and viewer receive its genuine new
   `task_updated` event, while **neither the pre-removal editor socket nor
   the fresh editor socket nor the outsider** receives any later team event.
9. The test-only task is deleted using the exact returned ID and checked
   title. The server-generated delete event must still reach owner/viewer
   without leaking to removed editor/outsider.
10. The result prints fixed-safe check names and explicit
    **not production certified / migration not verified** limitations.
    No account names, JWTs, private user UUIDs or event payloads are printed.

The runner uses existing secured Supabase RPCs, not raw SQL or service keys.
Real operations are **staging-only**; there is no new SQL migration in this
PR. It fails closed on auth, timeouts, role drift, hidden rows becoming
visible, incorrect event IDs, unexpected socket errors, outsider packet
leaks and cleanup problems.

## Recovery and non-reversible side effects

A task cleanup failure blocks release. Inspect **only the disposable staging
team**; remove only the task named `ETERNYX REVOCATION TEST...` created by
this test. Never run blanket DELETE statements. If the owner revoked the
editor successfully and a later check fails, the editor remains removed;
a fresh disposable team or explicitly approved re-invite is needed to retry.
Audit events remain even after task deletion. Realtime/Postgres Changes may
have delays; any unverified result is a failed acceptance, not a pass.

**Independent remaining release gates**: real staging execution of Phases
21–25; Supabase migration-history reconciliation and SQL advisors;
desktop/mobile browser session recovery and release approvals. Merging
GitHub code alone does not deploy migrations or demonstrate live security.
