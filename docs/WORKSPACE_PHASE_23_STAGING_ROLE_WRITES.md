# Workspace Phase 23 — Actual role-write acceptance in disposable staging

**Zero production changes. This phase has no new migration.** The Phase 21
read-only staging harness and Phase 22 Realtime harness do **not** prove write
authorization. Phase 23 provides actual isolated staging create/deny/delete
acceptance with a dedicated disposable team. Running `npm test` alone does
not exercise the remotely hosted Supabase database.

## Explicit setup

Use the same four dedicated staging Auth users as Phase 21. Create a NEW,
ACTIVE, **empty** team with the exact case-sensitive name
`ETERNYX STAGING WRITE PROBE`. Make the four users: one owner, one editor,
one viewer, one outsider (NOT a member). There must be no other team members.

The team MUST be separate from the read-only fixtures and must contain zero
tasks. Do not place business documents or real users in it. The harness
checks the exact name, owner, roles, active status, task emptiness and
outsider exclusion **before writing anything**.

In addition to Phase 21 environment variables, set:

- `WORKSPACE_STAGING_WRITE_SPACE_ID`: UUID of the dedicated EMPTY team.
- `WORKSPACE_STAGING_WRITE_CONFIRM=DISPOSABLE_STAGING_WRITE_ROLE_PROBE`.
- `WORKSPACE_STAGING_WRITE_AUDIT_CONFIRM=PERSISTENT_TEST_EVENTS_ACKNOWLEDGED`.

The existing Phase 21 config validator refuses the known Eternyx production
project, noncanonical hostname and elevated/service-role keys. These checks
also apply to this runner. Operator commands:

```sh
npm run workspace:staging:write:config
npm run workspace:staging:write
```

Config validation is offline, without login or writes. The actual test
**creates genuine staging task records**, comments, checklist steps, and
associated immutable event history. It cleans up only tasks created during
the run and verifies that the server recorded their deletion events.
**Events remain in the shared team activity history after cleanup**, by
design; deleting tasks does not roll back their audit trail.

## What the live acceptance proves

1. Separate Auth sessions and four distinct user identities.
2. Dedicated team owner/editor/viewer roles and confirmed outsider exclusion.
3. Viewer, outsider and anonymous task creation requests denied.
4. Owner and editor can create real tasks with correct server actor IDs.
5. Editor can create a real comment; owner can create a real checklist step.
6. Viewer and outsider cannot post comments, create steps or delete tasks.
7. Direct browser table INSERT attempts by viewer, outsider and anonymous users
   are denied; successful unauthorized inserts are tracked for cleanup.
8. Server-authored task-creation, comment and checklist events persist.
9. Cleanup uses returned UUIDs plus exact expected nonce-tagged titles,
   never bulk-deleting other people's tasks.
10. Task removal is independently verified, including the final zero-task
    invariant and server task-deletion events.

The test **fails closed** on missing migrations/functions/roles, missing
fixtures, unexpected permissions, malformed responses, row mismatches,
timeouts and cleanup problems. When cleanup fails, do not retry blindly:
inspect the isolated staging team and manually remove only test-created
tasks with the `ETERN YX` / `ETERN YX STAGING ROLE PROBE` marker
(spelling in the actual test is `ETERNYX STAGING ROLE PROBE`), then
recreate a clean preflight team if needed.

The output contains fixed check labels only, not passwords, JWTs, UUIDs or
task bodies. It explicitly marks production, migration history, Storage byte
access and Realtime delivery as **unverified**. A positive write test is
not production rollout approval.

## Independent blockers

Verify SQL migrations Phases 17–20 in staging, database advisories and
remote migration timestamp collisions before any production roll forward.
Run Phase 21 read-only, Phase 22 real Realtime, Phase 23 role-write,
separate actual revocation/reconnect/mobile browser and protected Storage
checks. Require operator approval for each test and a documented recovery
strategy. Do not infer live status from merged GitHub PRs.
