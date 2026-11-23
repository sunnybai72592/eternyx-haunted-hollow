# Workspace Phase 33 — Live task board & safe status progression

## Product improvements (no placeholders)
1. Toggle **List / Board** for the current authenticated team.
2. A responsive three-column board derives real **To do / In progress / Done**
   cards from the same already verified and loaded task rows.
3. Search, priority sorting, overdue/upcoming and assignment filters apply
   identically across the list and the board.
4. Editors and owners can move tasks from **To do → In progress → Done**, then
   **Reopen → In progress**, using the existing scoped team RPC. Viewers and
   archived teams have read-only cards with no write actions.
5. A quick status update sends the task's full validated fields and its exact
   server `updated_at` as an optimistic-concurrency precondition. The server
   must confirm the write; there is no fabricated optimistic task update.
6. The shared task card exposes the existing Edit, Discussion/Checklist,
   Delete and quick status action in both layouts, with labels for keyboards
   and assistive technologies.
7. Column counts refer to visible filtered records, not invented KPIs.
8. Board layout resets on account/team switches, while authorization masking
   prevents stale team cards from rendering during revalidation.

## Tests and release caveats
Eight regression groups validate scoped immutable grouping, filtered task
reconciliation, malformed/duplicate/foreign IDs, legal status progression,
payload preservation, stale timestamp rejection, role guards and UI wiring.

No schema changes or production database writes. The action uses the existing
`workspace_team_save_task` RPC; backend authorization and version checks
remain authoritative. Browser build and offline tests alone are not live
owner/editor/viewer/outsider staging acceptance. Live backend deployment,
Storage and Realtime tests remain mandatory before production certification.
