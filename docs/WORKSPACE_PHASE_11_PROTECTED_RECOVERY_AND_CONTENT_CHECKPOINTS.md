# ETERNYX Workspace Phase 11 — protected recovery and content checkpoints

**Status:** Pull-request code only. Merging this PR does not deploy Supabase SQL or perform background data changes. Apply in staging **after** Workspace Phases 1–10.

## Delivered

1. **Owner-protected recovery hold:** the `workspace_import_sessions` state adds `held`, plus a 300-character optional reason and server time. Authenticated `workspace_import_set_hold` can protect an existing *unfinished, active* import even when it already contains real tasks, checklists, notes or private files. Holding never deletes or overwrites data.
2. **Hard server write gate:** all four existing Phase 9 write RPCs are redefined with the same signatures and permissions to require the active status and a matching stored content checkpoint before continuing, replaying batches, claiming a file, registering file metadata or finalizing. Protected, sealed or completed imports cannot accidentally restart through old browser tabs.
3. **Real content drift checks:** a deterministic, server-generated digest covers actual owned project name/description/status/pin and saved task, checklist and item *identifiers plus their content/revision/updated timestamps*, not simply the number of rows. Manual text changes, deletions, additions, status changes, and step edits after a successful import checkpoint are detected even when the row counts still match.
4. **Transactionally advanced checkpoints:** new import sessions start with a snapshot of their empty project. After a successful imported task or note/link batch ledger insert, or verified private-file registration, a PostgreSQL trigger advances the baseline within the same transaction. If the enclosing import fails, the checkpoint rolls back with it; no false success.
5. **Safe release workflow:** a hold may be released only when the server confirms current project content still matches the last committed checkpoint. If the owner made changes during the hold, releasing fails without discarding their work. A user may preserve the modified project using a real local v3 backup and keep recovery protected.
6. **Private integrity inspection:** `workspace_import_integrity` returns checkpoint presence, live DB match status, server timestamp, protected state and reason only for an owner-authenticated session. Signature secrets and private file paths are not exposed. Recovery Center displays these alongside Phase 10's actual Storage metadata/count inspection.
7. **Recovery UI and fail-closed actions:** adds a *Protected / On hold* filter, protect/release buttons, reason and timestamp, explicit same-count content-change warnings, and a resume action that requires inspecting a clean checkpoint. The ordinary importer also blocks protected sessions clearly instead of continuing.
8. **One-click access to a real rescue export:** Recovery Center can open the affected project's existing v3 export buttons, including checklist and actual private-file-inclusive backup options; it does not pretend the metadata diagnostic is a complete project backup.
9. **Downloadable sanitized diagnostic:** a confirmed browser download saves **only** verified counts, status, checkpoint time and anomalies (no archive SHA, internal project/session IDs, filenames, Storage paths, task text, private bytes or credentials). Intended for support and troubleshooting, not as backup or proof of file authenticity.
10. **Regression coverage:** Node tests validate private report sanitization, safe/unsafe integrity labels and same-count drift messages. Isolated PostgreSQL 17 tests owner-only hold/release, held replay/write/finalization rejection, manual edit preservation, changed-content blocking, correct checkpoint advance, file registration and cross-owner denial.

## Safety and limitations

- This **protects in-progress imports**. It does not reset or overwrite existing user tasks and it does not run any SQL deletes on private Storage.
- The checkpoint digest uses PostgreSQL MD5 for **local change detection only**. It is **not** a digital signature, hash of file bytes, encryption, tamper-proof authenticity guarantee or a substitute for the private Storage integrity checks. File content must be separately verified through download and SHA-256 as in Phase 9.
- The checkpoint is recorded from existing rows **at Phase 11 migration time**, so changes made before deployment cannot be reconstructed retroactively. After deployment, server-authorized import writes advance it automatically.
- If the owner manually edits a partial project after a committed import batch, normal same-file resume intentionally **fails closed**. The edited project remains safe and inspectable, and current v3 backup controls remain available. A later conflict-resolution tool would need explicit per-record review rather than silently overwriting text.
- Database + Storage imports are still transactional per batch, not globally atomic; original completions, historical item revisions and activity history are still not included in current project exports.
- Checkpoints include project database text and current registered file metadata but **not physical file bytes, Storage object integrity or historical audit data**.
- Changes made concurrently with an import are not prevented by record locks on all user-editable tables, so a content check does not make this a fully serializable multi-client transaction. Test concurrent browser tabs and preserve backups during recovery.
- Status transitions only support `active → held`, `held → active`, and the existing Phase 10 `active → discarding → active`, with normal `active → complete`; completed sessions cannot be reopened or held through authorized RPCs.
- No paid GPU, external AI API, cron, fabricated recovery state, or new billing dependency.

## Reviewer acceptance and rollout

1. Confirm the latest Phases 1–10 migrations are applied in an authorized staging environment. Review `supabase/migrations/20261124130000_workspace_import_protection_and_integrity.sql`; it redefines four existing owner-scoped import RPCs to enforce the drift/hold check. Deploy separately from Git merge.
2. Run `npm test`, `npm run build`, desktop/mobile browser tests, and dedicated isolated PostgreSQL acceptance. Review SECURITY DEFINER ownership, `REVOKE PUBLIC` and the absence of user-writable session status grants.
3. Start an import, commit one task/checklist batch, protect it, and verify a second tab cannot replay, add tasks/notes, register a file or finalize.
4. Release the hold **without** modifying the project, continue the import, and verify the checkpoint advances. Modify the original task's details but leave the number of rows identical: integrity must detect drift, reject new import batches, and preserve the edited row.
5. While held, edit saved notes or checklist steps. Verify the owner cannot release the hold until a separately reviewed recovery plan exists. Do not claim the archive can overwrite user edits safely.
6. Test an interrupted private upload and registration. Physical Storage upload before metadata registration must not be mistaken for database-content drift; the Phase 9 SHA-256 verification remains required.
7. Test cross-owner session IDs and ensure no account can inspect, hold, or release another user's private restoration. Verify completed and discarded projects cannot be held.
8. Confirm the Recovery Center offers a true v3 project backup option, and that its metadata-only diagnostic omits source hashes, file paths, private bytes, and identifiers.
9. Merge only after checks pass; apply and verify SQL through an authorized staging-to-production process before releasing the dependent frontend.
