# ETERNYX Workspace Phase 4 — Private-file-inclusive backups and accountable deletion

**State:** Proposed source changes. No production database migration or Edge Function deployment is performed by the PR itself.

## Delivered capabilities

1. **Complete local project backup, v2:** The Workspace project screen offers **Backup with files** in addition to the existing text/metadata-only **Export JSON**. The new format embeds actual private file bytes with explicit original MIME, size and SHA-256 digest. Every file is downloaded using the signed-in owner's authenticated private Supabase Storage access. If any download or verification fails, the complete backup fails rather than silently skipping that file.
2. **Verified restore:** Workspace accepts both v1 text/metadata exports and v2 file-inclusive backups. The v2 parser validates format/version, project fields, task due dates, note/link content, file types, length and file digests **before creating any project**. On confirmation, it creates a distinct private project, writes tasks/notes/links and uploads included private files to new owner/project Storage keys. File registration requires a matching Storage object, and failed metadata registration attempts to remove the newly uploaded file.
3. **Strict client limits:** At most 1,000 tasks, 1,000 items, 8 private files and 12 MiB of private-file bytes in a complete backup; 24 MiB maximum JSON payload, 5 MiB per file, with a MIME allowlist. These bounds limit accidental memory use and excessive reads. Larger projects should use regular metadata-only export or an operator-supported backup.
4. **Integrity and privacy:** Every embedded file has a SHA-256 checksum, checked before import. Owner IDs, internal Storage object paths and administrative credentials are not embedded in either export. A backup *does* contain private note text and file contents; the operator must store it securely. Checksums detect corruption, **not** authenticity or tampering by a malicious person who can replace both data and hash.
5. **Account deletion cleanup:** The authenticated delete-account Edge Function now recursively enumerates account-scoped Storage objects in `workspace-private` and `avatars`, deletes bytes via the official Storage API, and re-reads to verify the folders are empty **before** deleting the Auth identity. If a Storage operation fails, the function returns an error and does not delete the Auth identity. This corrects a privacy gap where cascading database-row deletion would leave raw file objects behind.
6. **Regression tests:** Node tests exercise actual binary v2 roundtrips, digest integrity, missing/private file failures, maximum file/record limits, XSS scheme rejection, Storage cleanup across over 100 project folders, cross-account paths, missing buckets, partial deletion, and retryable failure.

## Honest limitations

- Historical note/link revisions, audit events, workspace data outside the selected project, and user avatar bytes are **not** included in a project v2 backup.
- This is a limited per-project browser download, **not** automatic recurring cloud backup. No subscription, external AI API, GPU, or paid service is required.
- Restore is bounded and non-transactional across Storage and database; successful batches remain if later files fail. The UI explicitly identifies partial restore counts. This is intentional, not silently claimed atomic.
- This release does not implement permanent per-account quotas or a garbage collector for already-orphaned Storage files. Account deletion cleanup handles account-owned Storage paths, including orphaned objects under that prefix.
- A client-side SHA-256 checksum does not provide cryptographic authentication or encryption of exported data.
- A concurrent upload during account deletion can cause the final Storage verification to fail; the account identity remains. A server-enforced deletion lock is future work.

## Verification and deployment

1. Confirm Phase 1–3 Workspace migrations have been reviewed and applied in the environment. Phase 4 has no new SQL migration.
2. Run `npm test`, `npm run build`, browser acceptance, and the targeted Workspace full-backup/cleanup tests.
3. In a staging Supabase project with 2 user identities, create a project with a PDF and text file, notes, links and tasks. Download v2 backup; import as a separate project; verify file byte-for-byte SHA-256 digests, ownership and private access.
4. Alter one byte in the base64 content and check that import stops *before* creating a project. Confirm unsupported MIME and oversized backups are denied.
5. Test v1 imports separately; existing metadata export remains backward compatible.
6. Invoke account deletion with confirmation through staging. Check account-owned Workspace and avatar files are removed from **Storage bytes**, not just `storage.objects` rows; verify a second user's files remain.
7. Simulate a Storage deletion error, confirm the identity is **not** deleted, then retry cleanly. Check database cascades on successful Auth deletion.
8. Deploy the updated `delete-account` Edge Function **only after** staging acceptance and security review; PR merge alone does not deploy it.

Related references: `docs/WORKSPACE_PHASE_2_REVISIONS_AND_EXPORT.md` and `docs/WORKSPACE_PHASE_3_PORTABILITY_AND_SCALE.md`.
