# ETERNYX Workspace Phase 15 — production safety and backup verification

**Status:** Source PR, not automatic remote deployment. No new SQL schema or migrations. Production depends on the previous approved Workspace migrations through Phase 14.

## Implemented improvements

1. **Exact-count task and saved-item backup snapshots.** All export modes now fetch real account/project records using stable ID pagination, exact database totals on every page, a maximum of 1,000 portable tasks/items and validation of owner/project identity. A short page, shifted count, duplicate ID or foreign row aborts export rather than creating an apparently complete file.
2. **Exact-count checklist snapshots.** Checklist export and reviewed recovery now verify actual server row counts for every task-ID chunk, enforce 30 steps/task, reject duplicate and foreign IDs and stop when pages are truncated or changing. Previous behavior could silently accept short responses as full checklists.
3. **Immediate private-file verification.** Even after Storage reports a successful upload, the importer downloads the saved object and compares its actual SHA-256 and size against the original validated backup. An ambiguous upload error is accepted only if the existing object matches; no overwrite/upsert is attempted. A failed comparison prevents database registration.
4. **Previously registered file re-verification.** On recovery retries, already-registered Storage objects are checked against their original archive bytes without re-uploading. Missing or changed objects cause a visible error; no false success.
5. **Completed-import integrity recheck.** Reopening an already completed exact archive no longer simply claims it is unchanged. The owner-only Phase 11 checkpoint RPC must report a complete and matching project, and all file claims must match the source's metadata and actual private bytes. A modified project or missing file is not overwritten and is not labeled as a fully verified restore.
6. **Fresh account-bound restore stages.** Before beginning, at bounded batch intervals, before each private upload/registration and before finalization, the client verifies the signed-in user from the Auth server still matches the expected Workspace owner. The backend's ownership/RLS checks remain authoritative. Old file-picker responses and restore UI updates are suppressed after account switches.
7. **Guard stale recovery targets.** If someone chooses a different recovery session after selecting an archive, restore refuses to import the previously selected file under the new target. Errors direct the user to the Recovery Center rather than promising unconditional safe retries.
8. **Browser-only backup inspector.** An owner can choose an ETERNYX v1/v2/v3 JSON archive and validate it locally before relying on it. The tool checks archive schema, real tasks/steps/notes, v2/v3 included private-file SHA-256 bytes, metadata-only file omissions, optional recovery markers and v2 reviewed payload integrity. It reports the complete archive's exact SHA-256. No file is uploaded or stored remotely.
9. **Strong negative regressions.** Node tests cover failed and shortened pages, duplicate IDs, missing counts, changing counts, wrong owner, corrupted file base64, incorrect checklist values, previously registered missing or tampered files, ambiguous uploads and completed import DB drift.
10. **No additional paid services.** All checks use existing Supabase Auth, DB and private Storage and native browser crypto. No GPU, external AI APIs, cron jobs or billing enforcement.

## Security and honesty

- These safeguards are **fail-closed checks on application-generated backup and import data**, not a global distributed transaction or cryptographic signature. SHA-256 proves equality with a retained expected byte digest; it does not authenticate an unknown sender.
- The local checker verifies the file supplied by the user, not current production records, backend availability, future backup durability or whether Supabase migrations have been applied. A valid metadata archive can intentionally omit private file contents and older history.
- A completed import whose original records have been legitimately edited is reported as changed rather than reapplied. This preserves user edits, but users should inspect and back up the changed project before separate recovery.
- The export routine still cannot obtain a single Postgres snapshot transaction across the separate task, note and Storage reads. Exact-count checks catch missing or shifted pages, but simultaneous same-count field edits between pages may not be detected. A server-side transactional export would be a future migration.
- Auth freshness before stages is a browser check **in addition to**, not a replacement for, server-enforced owner RLS. An account change during a single network request can still occur and must be rejected by the server.
- The project portable export cap remains 1,000 tasks and 1,000 items; file-inclusive backups remain limited to 8 files, 12 MiB total file bytes and 24 MiB JSON. These are intentional scope limits, not entire-account backups.

## Staging acceptance and rollout

1. Review source PR and confirm all existing Workspace migrations through Phase 14 have been separately applied to a controlled staging environment. The source PR **does not** deploy or verify remote migrations.
2. Execute Node utility tests and build, plus desktop/mobile browser CI. Test with two real authenticated staging accounts and enforce foreign owner access denial.
3. Export projects with 0, 1, 200, 201 and 1,000 tasks/items, including 30 checklist steps on a task. Ensure an exact-count page error fails with **no** downloaded archive.
4. Inject a truncated task, item or checklist API page, duplicate IDs and changing counts. Verify each produces an explicit error rather than partially exported data.
5. Select a saved v1 metadata export, v2 file-inclusive backup, v3 checklist metadata and v3 complete checklist+file backup. Verify the local inspector reports correct counts, omitted file entries and actual file bytes.
6. Corrupt a file's base64 while preserving its size; inspector must reject checksum mismatch. Change checklist 'done' to an invalid value; inspector must reject the archive.
7. Simulate successful private Storage upload with a corrupt byte payload on readback; registration must be blocked. Simulate lost upload acknowledgement with an existing correct object; hash verification should permit a safe retry.
8. After completing an import, edit a task in the project or remove a private file, then reselect the exact original archive. Verify it reports a mismatch without creating a duplicate or overwriting user edits.
9. Sign out/change accounts while a file selection or import is in progress. The old owner's private data must not be displayed in the new account, and further import steps must fail closed.
10. Only deploy the frontend through an authorized production release process after staging acceptance and database permission review.
