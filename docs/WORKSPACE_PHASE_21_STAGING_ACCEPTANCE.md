# Workspace Phase 21 — authenticated four-account staging gate

This PR adds **no migration**. It does not change the production Supabase project, send email, upload files, perform record writes or certify the deployment. CI can check syntax and fixture validation **offline**; this is not a live test.

The operator runs `npm run workspace:staging:config` to validate supplied environment variables without network access. After creating four **dedicated real staging accounts** and a real team with owner, editor, viewer and uninvited outsider, run `npm run workspace:staging:acceptance`.

Get the exact required environment variable names using `node scripts/workspace-team-staging-acceptance.mjs --help`. Required preexisting fixtures include a team space, one team task with at least one saved comment and checklist step, plus one owner-private personal project, task and item. Never invent fixture IDs to make the test pass.

The command requires an exact HTTPS staging Supabase hostname matching an explicit project ref, a publishable or legacy anon key (not a service key), and confirmation `READ_ONLY_FOUR_ACCOUNT_ACCEPTANCE`. It **hard-blocks** the known production ref. It logs no credentials, raw SDK exceptions, personal row data or account IDs.

Checks performed against the real staging Data API:
1. Four separate authenticated account sessions confirmed through Auth.
2. Owner/editor/viewer membership and exact space ownership verified.
3. Saved team task, comment and checklist rows readable by all three members.
4. Uninvited account cannot read team content, membership, events or cursors.
5. Notification snapshots and current-user cursors are isolated by RLS, and unread counts match exact server queries under stable event conditions.
6. Shared server activity actually exists and is visible to the three members.
7. The owner's personal project, task and item are invisible to everyone else.
8. Anonymous team reads return no rows or an actual access-denied response.

Each network request has a 12-second limit. Missing real fixtures, connection timeouts, unexpected permissions, stale identity, concurrent activity or null counts **block** acceptance rather than yielding a pretend empty success. Only Auth sign-in sessions, SELECT and a read-only snapshot RPC occur. The JSON report is sanitized and explicitly marks production, Realtime, mutation-role guards, migration history and private Storage bytes **not verified**.

**Independent release blockers:** Confirm real Supabase migration history and cumulative timestamp collisions before any migration command; verify real Realtime delivery across accounts, reconnect/leave behavior, actual viewer write denial, owner/editor writes with separate authorized staging test fixtures, private Storage byte boundaries, rollback, browser mobile/desktop and operator approval.

**Live check on 2026-11-23:** Eternyx Supabase control plane reported ACTIVE_HEALTHY, while remote migration listing and security advisors both timed out at the database connection. Neither should be treated as proof that Phases 17–20 were deployed.
