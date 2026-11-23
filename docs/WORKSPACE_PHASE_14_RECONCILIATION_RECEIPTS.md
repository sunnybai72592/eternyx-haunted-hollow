# ETERNYX Workspace Phase 14 — reconciliation preparation journal and local archive verification

**Delivery status:** PR source code. New SQL requires separate authorized staging review/deployment after Workspace Phase 11. The PR does not update remote Supabase merely by merging.

## Improvements

1. **Append-only, owner-only journal:** the new `workspace_reconciliation_receipts` stores verified owner/session references, the user-reported source/snapshot/archive/selected-payload SHA-256 values, selected source/current task/note counts, checklist step counts, excluded private-file counts, a server-generated timestamp and the explicit event label `archive_prepared`. No task text, link URLs, task IDs, Storage paths or file bytes are journaled.
2. **Server-verified source association:** a SECURITY DEFINER RPC checks the signed-in `auth.uid()` owns the original Workspace import session and the reported source archive SHA matches that session. The project is taken from the trusted session and must match the user's account. Client-supplied project IDs are not accepted by the function.
3. **Hard receipt limits and immutable browser access:** bound task/item totals to 1,000 each, checklist steps to 30 per task, excluded file count to 2,000, digests to 64 lowercase hexadecimal characters, and per-account receipt history to 1,000. Browser roles have SELECT-only RLS, with INSERT exclusively through the controlled RPC, and no UPDATE or DELETE privileges.
4. **Replay-safe recording:** exact repeated same-archive preparation attempts return the original receipt; altered counts, source, snapshot or payload digest under a recorded archive hash are refused rather than silently replacing history. The server serializes same-archive requests.
5. **Verifiable v2 review marker:** reviewed reconciliation archives now include an informational marker with a SHA-256 over the complete selected *portable tasks, checklist states, notes and links* (`payload_sha256`), selected step count and number of excluded file entries. This marker is not a digital signature or trusted provenance assertion.
6. **Independent local archive validation:** `verifyWorkspaceReviewedArchive` checks supported v3 metadata archive parsing, review marker schema, actual selected task/item counts, actual checklist step count, all portable content against the embedded payload digest, and the exact archive SHA-256 against an optional saved preparation receipt. Tampered documents or missing data are rejected.
7. **Legacy honesty:** Phase 13 v1 reviewed archives remain readable but are explicitly tagged as **not payload-verified**, since those files lacked a selected-record content hash. They cannot be logged as new v2 verified receipts without regenerating a reviewed file.
8. **Preparation, not download claim:** the app confirms the locally verified reviewed archive, registers its owner-only preparation receipt, and only then initiates a browser download. The journal shows *prepared*, never *download succeeded*. A canceled/blocked browser download does not become false evidence of a saved file.
9. **Private Recovery History UI:** a 10-at-a-time paginated, newest-first journal shows real owner-only records, separate source/current selections, omitted-file counts, and a short archive digest. History refreshes after preparing a reviewed export. It never invents scores or shows stored private content.
10. **Local verify-from-disk control:** pick a saved JSON file against a specific owner-only receipt. The browser reads it locally, checks the exact SHA-256, selected payload/step content hash, source/snapshot digests and all counts, and reports success/failure. The file is not uploaded to a server.
11. **Node and actual PostgreSQL acceptance:** regressions cover changed task text, modified checklist state, changed metadata, exact-byte alteration, historical v1 markers, malformed selection totals and source identity, plus real two-user PostgreSQL RLS, replay idempotency, conflicting receipts, disallowed direct mutations and cross-account denial.

## Boundaries and limitations

- **Not server-signed evidence:** the server checks session ownership and existing source digest, but it does not itself open or compute SHA-256 over the browser's generated archive bytes. The client reports archive/payload/snapshot digests. A malicious owner client can submit self-consistent but false metadata; this is an account-private preparation log, **not a cryptographic audit trail or public provenance certificate**.
- **Not proof of download or import:** browsers do not reliably confirm that a file was saved. `archive_prepared` means the server recorded the locally validated preparation before the application triggered download. Import status remains separately tracked by Phase 9 import sessions.
- A correctly recomputed payload digest proves internal consistency, not who wrote the file. It cannot authenticate a third-party source or detect a coordinated change to both payload and digest without comparison to a trusted previously saved archive SHA.
- **Immutable to authenticated browser roles** but administrative SQL access/service roles can alter or delete records; records also cascade if the underlying source project or session is deleted. Do not treat this as permanent tamper-proof compliance archiving.
- The journal holds no private file contents, no task/notes, no source task IDs, and no selected record indexes. The original/current archive still omits private file bytes/manifests, revision history, activity and original completion timestamps.
- The v2 content hash is computed over the reviewed archive's complete task and note/link arrays, including saved checklist states. It does not cover excluded files or authenticate the original source, which requires the retained original and source digest.
- This feature requires the new SQL migration and previous recovery migrations. If the RPC cannot be reached, reviewed export preparation will fail visibly rather than pretending a journal entry was saved. The independent legacy Phase 12 recovery-copy export still exists.
- Concurrency gaps remain when source project data changes immediately after pre-download review; Phase 13 already re-reads before export, but no distributed lock or transactional freeze is claimed.
- No automatic merges, source overwrite, public collaboration, paid AI APIs, GPU or billing enforcement is added.

## Staging rollout

1. Confirm the owner-only Workspace migrations through Phase 11 are applied in a staging project. Apply `supabase/migrations/20261124150000_workspace_reconciliation_receipts.sql` with authorized review, inspect SECURITY DEFINER ownership and RLS.
2. Run Node utility tests, application build, desktop/mobile browser CI and isolated PostgreSQL acceptance with Bob/Alice fixtures.
3. With two users, attempt to read or forge the other's preparation receipt. Confirm all cross-owner operations fail. Re-run the same digest: only one journal row. Change recorded counts: reject.
4. Review original/current tasks, notes, checklists in Phase 13; prepare reviewed archive. Confirm the journal shows the server timestamp and **prepared** status. Cancel the browser save and confirm the journal still says prepared, not downloaded.
5. Select the saved file from journal history. Correct bytes/checklists must pass; changing text, checklist done state or even whitespace must fail when compared to exact archive SHA.
6. Select a Phase 13 legacy v1 reviewed archive and confirm it remains parseable but cannot claim v2 payload verification.
7. Confirm no file bytes, private Storage key, saved task text, selected task internal IDs, or credentials appear in journal rows or history interface.
8. Restore the file separately through the existing owner-scoped import flow and verify no original project changes. Journal preparation alone must not create a project or import session.
9. Deploy the frontend only after the SQL dependency is staged and applied to production with authorization; merging the source PR does not deploy the database.
