# ETERNYX Workspace Phase 8 — Complete checklist-aware project exports and restore

**Status: PR source code, not deployed.** Requires Workspace migrations from Phases 1, 2, 5, 6, and 7, followed by **`20261124070000_workspace_checklist_restore_batches.sql`**. The code does not access production automatically.

## Delivered

1. **New v3 metadata export:** “Export with checklists” captures current task titles, instructions, status, priority, due dates and **every saved checklist step**, plus current notes, links and file manifests. A task's checklist is stored as an ordered array *inside that task*, not as user-visible Supabase IDs. Every row must come from the chosen owner/project.
2. **New v3 full project archive:** “Backup files + checklists” embeds actual private file contents with existing SHA-256 digests **and** current task/checklist content. Existing hard limits remain **8 files, 12 MiB total private file bytes, 24 MiB JSON**. Original completion timestamps, note revisions and activity history are **not** included.
3. **Bounded complete checklist snapshot:** authenticated batched pagination requests all `workspace_task_steps` for the up to **1,000 exported tasks**, including across multiple pages and owners' RLS. Missing pages, task ID duplication, foreign rows or more than **30 steps per task** abort the export rather than producing a false “complete” backup. The maximum is **30,000 steps** and 24 MiB total archive size.
4. **Versioned v3 restore:** a file picker detects v3, verifies structure, task content, 1–180 character step titles, Boolean done states, per-task capacity and the total archive size before any project creation. Metadata-only archives explicitly report skipped file binaries. Full archives additionally verify all embedded private file hashes.
5. **Correct restore mapping:** The new `workspace_restore_task_batch(uuid,jsonb)` **authenticated, owner-scoped SECURITY DEFINER RPC** creates batches of up to **25 tasks** and their checklist steps **in one database transaction**. It locks the target active project and uses each newly generated task ID, not task titles or ordering of a REST return, to attach its steps. Duplicate task titles cannot cross-wire steps. Invalid batch data, limits, and foreign projects cause a rollback of the entire batch.
6. **Honest partial-recovery feedback:** An import creates a distinct private project and counts successfully committed tasks, steps, notes, links, and private files. If a later batch/upload fails, the successfully committed records remain and the UI explicitly identifies the partial import. Existing imports are **not claimed to be globally atomic**; each v3 task/step batch alone is atomic.
7. **Legacy compatibility:** Older **v1 metadata** and **v2 private-file** backups continue to be readable unchanged. The original “Legacy JSON” export remains available if a project exceeds v3 limits; it **does not include checklists**. Legacy v1's default 1 MiB limit stays intact. V2 text validation may use the existing 24 MiB bounded full-backup limit, without reducing checks on links, tasks, or file data.
8. **Actual regression tests:** Node round-trip tests cover duplicate title mapping, SHA-256 file content, step order, malformed steps, 31st-step rejection, injected properties, owner leakage, and pagination failure. The isolated PostgreSQL 17 CI test applies the new RPC, verifies transaction rollback, archived-project blocking, and real two-owner security.

## Honest limitations

- A v3 archive is **not a complete historical audit backup**. It omits previous revisions of notes/links, previous checklist states, original completion timestamps and Workspace activity. Imported Done tasks get the **restore-time** server completion timestamp.
- V3 caps: **1,000 tasks and 1,000 saved items per project**, 30 steps per task, maximum 30,000 total steps, 24 MiB archive JSON. If a complete export is impossible, it fails visibly; users must not interpret old v1 exports as checklist backups.
- Import is not fully atomic across all batches and private Storage. Failed later batches remain as an explicitly partial project, which can be inspected by the owner. Do not retry blindly; a new import creates another project. Native idempotent resume and owner-initiated purge are future work.
- A valid SHA-256 digest detects accidental corruption, but **does not provide authenticity or encryption**. Local downloads may expose sensitive private content and must be protected.
- No AI API, paid GPU, fabricated data, scheduled workers, collaboration or billing changes are introduced.

## Acceptance & deployment

1. Confirm the Phase 1–7 Workspace migrations have been correctly applied in a **staging** Supabase project. Apply Phase 8 migration afterward; review SECURITY DEFINER privileges and `auth.uid()` requirements.
2. Run `npm test`, `npm run build`, desktop/mobile browser checks, and the isolated PostgreSQL workflow. The PR's changes are not automatically deployed to a remote database.
3. In staging create two tasks **with identical names** and different checklist steps. Export both v3 modes, restore into a new project, and verify every step belongs to the intended newly created task.
4. Test private-file byte-for-byte SHA-256 roundtrips with a PDF/text file, plus metadata-only restore that correctly reports skipped binaries.
5. Force a malformed Boolean and overlong title; verify validation rejects before a project is created. Force an SQL error within one 25-task batch; no tasks or steps from that batch should persist.
6. Confirm user B cannot access or import under user A's project or archived projects, and that the server enforces its 30-step, 5,000-task and other Phase 5 quotas.
7. In the browser confirm v1/v2 restores still function, and that the legacy export is accurately labeled without checklists.
8. Release client **after** the new migration is staged/approved, with production monitoring for failed imports and slow archives.
