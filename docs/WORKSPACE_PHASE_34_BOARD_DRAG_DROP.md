# Workspace Phase 34 — Real Drag/Drop and Accessible Direct Task Moves

Phase 34 extends the verified team Kanban introduced in Phase 33.

## Improvements

1. **Native drag-to-column** moves a card between To do, In progress and
   Done on desktop, using a dedicated card handle instead of dragging
   nested Edit/Discussion buttons.
2. **Keyboard/touch equivalent:** every editable card in both List and
   Board layouts includes a native labeled "Move to" select. No drag
   gesture is required.
3. **Direct stage transitions:** authorized editors may move directly
   from To do to Done or Done to To do, in addition to existing
   one-click Start / Complete / Reopen progression.
4. **Scoped and bounded drag receipts:** drag data includes only team ID,
   task ID, source status and server revision. It carries no task title,
   details, assignee or secret. Foreign/malformed/oversized data fails
   closed.
5. **Stale-drag checks:** a drop is resolved against the exact current,
   filtered RLS-loaded rows. A removed, hidden, duplicate or changed
   task cannot be moved by a stale dragged receipt.
6. **Server-confirmed status changes:** no optimistic local card updates.
   The existing permission-scoped `workspace_team_save_task` RPC checks
   role, active team, field validation and `updated_at` against the
   stored row, and success is displayed only after reconciliation.
7. **Interaction polish:** drop-zone visual cues, nested dragleave
   flicker protection, no-op same-column drops, busy/role guards, and
   reset of drag state on account or team switches.
8. **Regression coverage:** nine offline test groups for direct transitions,
   invalid fields/roles, forged and stale receipts, filtered views,
   keyboard source wiring, source guards and no optimistic writes.

## Important release limitation

This branch does not apply SQL migrations, deploy a backend or execute
production data changes. GitHub UI tests do not prove end-to-end
browser drag gestures or live account permissions on a staging service.
Real staging owner/editor/viewer/outsider, Storage and Realtime tests
remain necessary before production release.
