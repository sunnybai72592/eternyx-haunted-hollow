# ETERNYX Workspace Phase 10 — Recovery Center, real progress & reversible empty-import cleanup

**Status:** Pull request only. No production data or Supabase project is changed just by merging. This phase requires the existing Phase 1–9 Workspace migrations and `supabase/migrations/20261124110000_workspace_import_recovery_review_and_discard.sql` after those migrations.

## Delivered in one phase

1. **Private Recovery Center:** Lists the actual RLS-scoped `workspace_import_sessions` for a signed-in owner, newest first, 20 per page with explicit pagination. Filters distinguish *unfinished*, *completed* and *sealed* imports. Each entry opens its real Workspace project.
2. **Inspect real committed progress:** `workspace_import_inspect` verifies `auth.uid()` against the session owner and returns the original expected totals, imported task/checklist/note/file receipts and current project row counts. UI never invents a score or infers completion from a client button.
3. **Private Storage inspection:** The server separately counts Storage objects in the exact `owner/project/` prefix, claimed file keys, uploaded-but-not-registered objects, missing Storage objects for registered files and unexpected/unclaimed objects. This surfaces interrupted-upload states without exposing private URLs or object paths to another account.
4. **Honest mismatch warnings:** The UI calls out discrepancies between actual task/item/step counts and the recorded batch ledger, missing registered files, pending private uploads and unclaimed objects. This is a **count reconciliation**, not a content-level integrity audit or data-repair promise; user-modified records may retain the same counts.
5. **Resume the exact archive:** From an unfinished session, the owner can directly open the backup file picker with the session's SHA-256 fingerprint pinned. A different uploaded file is rejected **before** import; choosing the exact original clears the pending target. The original Phase 9 idempotent batch/file recovery still performs every write.
6. **Owner-safe empty-project disposal:** `workspace_import_prepare_discard` only accepts an authenticated owner's **unfinished, active and physically empty** project—zero task rows, saved items, claimed file slots and Storage objects. It marks the project *archived* and the import session *discarding* in one transaction. No private file is deleted.
7. **Two-stage irreversible confirmation:** After the first state is committed, a separate server inspection and confirmation are required before `workspace_import_finalize_discard` may remove a still-empty archived project. It rechecks owner, project, tasks, saved items and Storage objects, and reuses the existing Phase 6 file-free archived-project purge, which also deletes the session receipts by cascade. It will not erase a nonempty project.
8. **Server state-transition guard:** A database trigger refuses `discarding → complete` and reopening a completed session, even if an older Phase 9 RPC is invoked with a zero-item import. Sealed sessions must be explicitly undone or finalized.
9. **Undo seal:** Before final deletion, `workspace_import_cancel_discard` safely reactivates the project and resumes the session's `active` state. Repeated calls are safe; completed imports and cross-owner sessions are refused.
10. **Real user-facing recovery context:** The interface makes clear which original backup file is required, why a discard is blocked, how to inspect and manually clear stored work, and which operations permanently destroy a private project. Loading failures are surfaced, not shown as empty history.
11. **Automated acceptance:** Isolated PostgreSQL 17 tests authenticated two-user isolation, completed-session refusal, current-vs-ledger counts, physical orphan objects, file claims, nonempty task/note refusal, sealing, undo, no post-seal batch writes, final project/session cascade, and SQL rechecks. Node tests cover count validation, warnings, statuses, and fail-closed UI eligibility.

## Safety boundaries

- **This is NOT a bulk reset** of interrupted imports containing work. The quick discard is intentionally available only when *no task, item, file claim or private Storage object exists*. Uploaded or registered files must be handled with the authenticated Workspace and Supabase Storage controls; claimed files require manual review. Nothing calls SQL `DELETE` on `storage.objects` in this migration.
- After a successful first seal, the account may **Undo seal** or explicitly finalize; the first stage is reversible. Final deletion is irreversible and removes the empty imported project and its recovery receipts.
- Never automatically discard an imported project containing user's work. For nonempty imported projects, open the project, inspect backups, and use the existing normal archive/deletion workflow only after clearing private files using the Storage API.
- This design preserves Phase 9's exact-byte import fingerprint, ordered idempotent batches and server-verified file registration. It does not reconstruct manually deleted work, provide an all-or-nothing Storage/database transaction or cryptographically authenticate archive sources.
- The inspection reports counts and Storage metadata, **not** complete text/file hashes or original item revision history. A count match cannot prove a task's content is unmodified.
- A session with file claims never qualifies for the empty-project shortcut, even if the corresponding upload was manually removed. This is deliberate to avoid risking in-flight private uploads. Users can still use normal reviewed project cleanup controls where permitted.
- UI lists a page of owner-only sessions and has a *Load 20 more* control; a page is not claimed as full import history.
- No paid external AI APIs, GPU, fake scores, automatic cron, subscription enforcement, destructive batch jobs or public file access.

## Review and production rollout

1. Apply all prior Workspace migrations through `20261124090000_workspace_import_sessions.sql` in an approved staging environment, then review and apply `20261124110000_workspace_import_recovery_review_and_discard.sql`. Inspect SECURITY DEFINER ownership, grants and Storage RLS.
2. Run `npm test`, `npm run build`, desktop/mobile browser CI, and the disposable PostgreSQL 17 acceptance workflow.
3. With two Supabase test accounts, verify foreign session IDs cannot be inspected, sealed, undone or finalized; no account can see another's import list.
4. Simulate one import stopped before its first batch: inspect, seal, undo, seal again, confirm deletion, and verify the project slot and session are gone.
5. Start an import containing a task, saved note, file claim or actual orphan Storage object. Verify the empty-project shortcut rejects **all** of these without deleting anything.
6. Verify a sealed session rejects new import batches and file claims. Reopen the existing original archive and observe a clear *sealed* error until Undo seal.
7. Inspect a session with missing registered objects / unregistered uploads: verify actual counts and warning wording, and confirm the user can reselect the exact source archive to resume.
8. Check UI accessibility/keyboard, pagination, page refresh, canceled file-picker selection, and owner switching while async queries are in progress.
9. Merging the PR **does not apply the SQL migration** to the remote environment. Release the client only once its database dependency has passed staging and production authorization.

## Remaining future scope

Protected archival of user-modified partial imports, owner-initiated cleanup of registered Storage files with server-side byte verification, complete historical revisions export, audit exports and eventual fully transactional distributed restore remain separate work.
