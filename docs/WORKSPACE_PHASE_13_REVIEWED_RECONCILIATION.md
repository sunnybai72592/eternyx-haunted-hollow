# ETERNYX Workspace Phase 13 — explicit record-by-record reconciliation

**Status:** GitHub PR source code, not automatically deployed. **No new Supabase migration.** This feature requires all previously approved Workspace recovery migrations through Phase 11 and authenticated private Workspace RLS.

## Delivered

1. **True reviewed recovery choices:** The Phase 12 side-by-side recovery screen offers a separate **Build a reviewed reconciliation archive** flow. Each **original task**, **current task**, **original note/link** and **current note/link** is selectable independently. **Nothing is preselected.** A record's source is visible. Duplicate titles retain distinct ordered positions; the workflow never invents a shared record ID to pair them.
2. **Page-by-page human selection:** Four accessible groups of 25 records each, with manual checkboxes, next/previous pages, page-scoped Select shown/Clear shown, and live selected totals. Selection persists while paging. There is no default "take all", silent overwrite or unreviewed auto-merge.
3. **Current project snapshot:** The server-backed reader requires the signed-in owner's private project, then fetches all tasks and saved items with **exact count** and stable ID sorting. It rejects missing pages, duplicated identities, mismatched owners/projects, row-count changes, or projects exceeding the bounded review scope.
4. **Checklist preservation:** Actual current task steps are retrieved through the existing owner-scoped complete-step pagination with the 30-step cap. Selecting a source task carries its original verified v3 checklist. Selecting a current task preserves its *current* saved checklist, including done/undone states. Source v1/v2 tasks have no checklist snapshots and therefore cannot invent missing history.
5. **Read-only recheck before download:** A deterministic SHA-256 digest covers actual reviewed task/item fields, IDs, updates and checklist state. Before preparing an archive, the app **re-reads the complete current project**, verifies exact source-file SHA-256, and requires its fingerprint to match the previously inspected snapshot. If work changed during review, export stops and directs users to review again.
6. **Explicit selected-record archive:** The new file is an **ETERNYX v3 metadata-only project archive**, named `(Reviewed recovery)`, containing only user-selected task/checklist and note/link rows. It includes an informational `reviewed_reconciliation` marker recording the source and snapshot hashes, selected counts, a unique fork UUID and timestamp. **It does not contain original or current database user IDs or Storage paths.**
7. **Strict validation:** Existing v3 import parsing revalidates every selected title, due date, priority, status, note/link and 30-step checklist limit; the output is then compared byte/logical-field-for-field to the intended selections. The 24 MiB archive, 1,000-task and 1,000-note/link limits reject oversized plans rather than silently dropping rows.
8. **Non-destructive restoration:** Downloading the reviewed file **does not call any SQL write RPC, upload private files, modify either existing project or modify the held import session**. The owner must explicitly select the *new downloaded file* in Restore an export to create a new private project under the existing owner-only, replay-safe import mechanism. A later retry of that exact file reuses that new import session.
9. **Honest file exclusions:** Private file bytes and file manifests—whether from the source or the current project—are deliberately **excluded from reviewed reconciliation**. The app prominently says to take separate **Backup files + checklists** exports for any private files. This cannot be represented as a complete merge of two projects or a full backup.
10. **Real regressions:** Node tests cover duplicate task names, original/current checklist selection and done states, source and current note text, exclusion of private file bytes/paths, invalid/duplicate/out-of-range selections, changed source identity, same-count text and checklist changes, missing/truncated count pages, and wrong-account access.

## Safety boundaries and honest limitations

- **No in-place merge, no overwrite, no deletion.** This is a **human-reviewed new-project reconciliation**, not an atomic update to the protected project. The original and the existing partial import remain intact. A reviewed archive may include both source and current versions of the same logical task if the user chooses both. Duplicate names are intentionally allowed.
- This does **not** perform an entity-level three-way merge because the source export does not carry stable internal task IDs. Selecting source vs current records is explicit, rather than falsely matching on titles.
- Source archives may contain file bytes, but they are not emitted in reviewed metadata-only archives. If someone requires an exact complete source backup, use Phase 12's full source fork and the existing full v3 file-inclusive export where supported.
- The snapshot SHA-256 is a *client-reviewed change-detection fingerprint*. It is not cryptographically authenticated by the server or a replacement for RLS, and a concurrent write in the final instant after re-reading may not be detected. No SQL write occurs from the review flow itself.
- Current task, note and checklist record totals are bounded to **1,000 tasks / 1,000 items**, 30 steps per task. The source archive has the same per-project limits; if source+current selection exceeds output limits, the user must reduce the selection before exporting.
- The v3 metadata archive excludes original completion timestamps, old revisions, activity history, file contents and file manifests. A restore uses server-generated completion timestamps for current Done tasks. Provenance metadata is informational, not signed by a trusted authority.
- The import session is identified by the exact **downloaded archive bytes**. Losing that file may prevent resuming an interrupted restore. An independently generated file with a new UUID creates a separate imported project under normal account quotas.
- No new migration, paid external AI API, GPU, fake dashboards, bulk destructive cleanup, collaboration permissions, or background tasks are introduced.

## Acceptance procedure

1. In approved staging, confirm the Workspace v3 import, private Storage and Phase 9–11 owner-only recovery migrations are deployed. Run the full Node/test/build/browser CI suite.
2. Open an interrupted import that has manually changed notes and tasks. Confirm exact source archive SHA verification. Confirm all four record groups start **unchecked**.
3. Select one original task, one manually edited current task, one original note and one edited current note. Verify the preview shows duplicate-titled task records separately and preserves the selected records' actual text, priorities and checklist states.
4. Modify a task without changing the number of rows **while the review remains open**, then attempt the download. The app must refuse until a fresh review. Repeat with a changed checklist done state.
5. Try a source file from another import or a malformed JSON file. It must fail before the new archive is made. Force a truncated task or step page: do not present a complete comparison.
6. Download a reviewed archive; reopen it in the normal importer. Confirm the new project contains only selected records, selected checklists and no private file entries. Confirm the old edited project and its hold status are unchanged.
7. Verify original file-inclusive v3 backups still work through the separate existing full backup flow, and that the reconciliation screen clearly warns about omitting file bytes and historical revisions.
8. Test more than 25 choices per group, 1,000 selection cap, mobile rendering, keyboard toggles and owner changes during in-flight reads.
9. GitHub merge is not an application deployment. Release only through the authorized staging/production process, with real authenticated browser acceptance.

## Future work

Record-level server-held compare-and-swap updates within an existing project, semantic edit merging with stable source identities, immutable conflict journal and file-byte reconciliation require separate server design and explicit owner authorization.
