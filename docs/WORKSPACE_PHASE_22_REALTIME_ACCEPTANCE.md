# ETERNYX Workspace Phase 22 — real Realtime delivery and outsider RLS acceptance

Phase 22 adds an **operator-run, nonproduction-only** Postgres Changes acceptance harness. A simple `SUBSCRIBED` WebSocket is **not proof** of data delivery or RLS. Phase 22 requires one genuine new, committed event to be delivered across three authenticated member accounts while excluded from a signed-in outsider.

This PR does not deploy Supabase migrations, create tables, write application data, create mock events or change the production project. **Auth sessions** are created in staging; the **human operator** edits a single existing staging team task, which writes to staging through the normal authorized app after the script prints `ARMED`.

## Operator workflow

Run `npm run workspace:staging:config` and complete Phase 21's existing four-user **real staging** fixture setup. Only dedicated, authorized test accounts are allowed. Set the additional variable `WORKSPACE_STAGING_REALTIME_CONFIRM=READ_ONLY_REALTIME_WINDOW`. Use a nonproduction staging project ref and publishable/anon key. Do not use a service-role key. Run `npm run workspace:staging:realtime:config` first, then `npm run workspace:staging:realtime`.

The operator sees `ARMED` only after all four authenticated WebSockets subscribe and a **real latest-event ID** baseline is read. In the staging browser signed in as **the fixture owner**, edit and save the existing specified team task **once** within two minutes. This emits a real server-generated `task_updated` event from the existing secure RPC. Do not use the SQL editor to forge an event; do not edit production. The test runner itself does not invoke any mutating RPC.

## What a pass actually proves

1. Four distinct real Supabase Auth sessions verified, each Realtime authenticated with its own JWT.
2. Owner/editor/viewer membership, owned active team and existing shared task checked.
3. Outsider actually excluded from the team before subscribing; all four subscribe to the same team-filtered Postgres Changes table.
4. New event's ID is strictly after the post-subscription server baseline.
5. Exact owner ID, task ID, team ID and `task_updated` event type match.
6. Owner, editor and viewer **each** actually receive that same new event ID through the WebSocket.
7. The event is then independently queried from the real database as the owner and as editor/viewer.
8. Outsider cannot read the event through the Data API and receives **no team event** while observing the same window.
9. Three-second quiet window catches delayed outsider delivery; all channels cleaned up.
10. Deterministic Node tests cover false positives from subscriptions, stale/wrong actor/space/task IDs, partial delivery and outsider leaks.

**Fails closed** on missing fixtures, Auth problems, a missing Realtime publication, disconnected subscribers, no operator-triggered update, inaccessible server event, outsider packets, mismatched account permissions, timeouts and incomplete subscription. Only fixed safe status codes and a metadata-only result are exposed. No record bodies, password, JWT, URL or private fixture ID is printed.

## Limitations

- This is **staging delivery verification only**, not end-to-end browser UX or production readiness.
- It does **not** verify multi-tab reconnection, removed-member subscription revocation, mobile background delivery, role write permissions, a secure private Storage byte read or migration history. Those remain separate gates.
- Phase 21's read-only fixture checker is adjusted to accept tasks with **one or more** real comments/checklist steps; multiple saved rows are normal.
- SQL schema revisions require reviewing the complete repository's migration history, known timestamp collisions, and authorizing actual deployment. Supabase database visibility has previously timed out; that remains a blocker until independently rechecked.
