# ETERNYX Workspace Phase 9 — resumable imports, verified retries and durable recovery

**Status:** GitHub pull-request source. This change DOES NOT apply SQL to Supabase or alter production data automatically. Depends on the previous Workspace phases 1, 2, 5, 6, 7 and 8.

## What was built

1. **Owner-only import sessions:** a new private `workspace_import_sessions` table records the SHA-256 of the chosen exact archive, version, new project ID, expected totals and completion state. An authenticated server function obtains a transaction-scoped lock on owner + fingerprint before creating the project. Reopening the **same byte-for-byte archive** returns the existing session and project instead of making duplicates. Different archive bytes intentionally create a different import.
2. **Durable progress receipts:** `workspace_import_status` reports server-committed task, checklist, item and registered-file counts, expected totals and state. The client displays the actual partial progress if an import fails; it does not infer success from the last button click.
3. **Atomic idempotent task/checklist batches:** task chunks are at most 25 tasks. Each batch runs through the previous verified `workspace_restore_task_batch` mapping RPC. In the same PostgreSQL transaction the server records `(session, phase, index, payload fingerprint, counts)`. Retrying an identical batch returns a replay receipt without inserting duplicate tasks or steps. Changed payload, skipped index or counts exceeding the archive manifest are rejected.
4. **Atomic idempotent note/link batches:** owned saved notes and links are inserted in <=25-row transactions and recorded in the same immutable batch ledger, with title/link/note constraints checked by the existing database. Cross-account project IDs/owner IDs are never accepted from an archive.
5. **Deterministic private-file claims:** a file claim records its stable, session-specific Storage key, index, title, bytes, MIME and SHA-256 digest before upload. Retries reuse that key, not a fresh random filename. At most 8 file claims per v2/v3 archive.
6. **Non-overwriting, SHA-verified private upload retry:** Storage uploads use `upsert:false`. If an earlier upload may have succeeded before a connection failure, the browser downloads the existing object and verifies its **actual bytes/size against the original archive's SHA-256** before asking the server to register it. A mismatch fails closed. The server's existing file-upload metadata trigger also rejects incorrect size or MIME. Private bytes are not embedded in public project paths.
7. **Idempotent file registration:** `workspace_import_register_file` creates the private file listing and records successful registration within one database transaction. Replaying an already-registered claim returns success without a second file row.
8. **Strict finalization:** a private `workspace_import_finish` function refuses to mark an import complete until exactly the declared task, checklist, note/link and registered-file counts have committed. Repeated calls to finish an already complete session are safe.
9. **Accessible restore and recovery feedback:** same file → resume/reuse, completed archive → open existing project, partial failure → keep source selected and show actual server receipts, with clear wording about which steps remain. No silent full-project deletion and no destructive overwrite of an earlier successful import.
10. **Security and regression coverage:** isolated PostgreSQL 17 tests the real two-account RLS, exactly-once task/step and item batches, tampered replays, skipped indices, deterministic file claims, missing-upload rejection, duplicate finalization, incomplete import rejection and session visibility. Node tests cover hashes, batch boundaries and byte-verified existing uploads.

## Limitations and operational honesty

- This is **per-batch** transactional recovery, not one transaction across PostgreSQL and Storage. An interruption can leave a partial project and unregistered private Storage object. Re-selecting the **identical original archive** is the supported recovery path. Do not erase the source archive until finalization is confirmed.
- SHA-256 is used as a durable file fingerprint and retry content check, **not a signature or authentication mechanism**. The client validates actual bytes on retries; the server checks Storage object size/MIME but does not independently hash object content.
- If the owner manually edits/imports into the partial project, the immutable batch ledger does not mistake those user changes for archive batches. If a committed task was manually deleted after its receipt, replay will not reconstruct it. Consult the project before resuming imports after manual changes.
- The same exact archive is intentionally import-once per account. To make a separate clone from identical source data, export an updated archive with different bytes, or use a different workflow after review.
- Existing standalone non-session import projects cannot retroactively adopt a Phase 9 session. They remain protected by normal Workspace RLS and archive/purge controls.
- Source archives can contain sensitive private notes/files; browser memory is temporary and no raw full archive is written to the session ledger. The ledger stores owner ID, source digest, counters and file digest/metadata. Uploaded file bytes stay in private Storage.
- The v3 backup bounds remain unchanged: 1,000 tasks/items, <=30 steps per task, <=8 files / 12 MiB private bytes / 24 MiB archive. v1 and v2 imports remain readable and are now routed through the same resumable session flow. Historical revisions/audit and original completion times are not restored.
- No paid AI APIs, fake status badges, scheduled jobs, GPU, public file sharing, billing plans or mock recovery dashboards.

## Staging acceptance and rollout

1. Confirm previous Workspace migrations up through `20261124070000_workspace_checklist_restore_batches.sql` have been applied to staging. Apply **`supabase/migrations/20261124090000_workspace_import_sessions.sql`** next.
2. Run `npm test`, `npm run build`, desktop/mobile browser journeys, and the dedicated PostgreSQL acceptance workflow.
3. On two real users, import the same v3 file from two tabs. Only one owned project should appear; the other tab should report replayed committed chunks.
4. Simulate connection loss after a task batch, note batch, successful Storage upload (before metadata registration), and registration (before acknowledgement). Re-select the exact file; counts and bytes must match, with no duplicated tasks, notes or files.
5. Tamper with a retried file's Storage contents, keeping the same nominal size. Upload must not overwrite it; the retry should fail on SHA-256 mismatch.
6. Confirm another account cannot query the import ledger or continue someone else's restore using a leaked session UUID.
7. Verify the owner can still export v1, v2 and v3 and import all three; archived project read-only and original file cleanup policies remain enforced.
8. Verify canceling a file picker does not create a session. A completed restore should re-open its original project rather than silently create a new one.
9. **Only after authorized staging review**, apply SQL to production and deploy the client. A merged PR alone cannot deploy or validate remote Supabase.

**Follow-up ideas:** explicit user-approved discard of incomplete imports with private object cleanup, server-verified file content digest, and protected recovery when a project was modified after batch receipts.
