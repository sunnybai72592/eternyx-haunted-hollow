# AI Arsenal Phase 16 — Safe Backup Change Review and Encrypted Passphrase Rotation

## Why Phase 16

Phase 15 added genuinely encrypted browser-local backups. Phase 16 addresses two practical recovery tasks: **review what replacement will actually change** and **re-encrypt a private backup under a new passphrase without creating a plaintext download**.

## Implemented improvements

1. **Verified-backup comparison before restore**. Both AES-GCM authenticated imports and legacy SHA-256-validated plaintext imports are compared to the current local corpus before a destructive action is permitted. The compare is entirely local.
2. **Exact stable source-ID matching**. A source ID present in both workspaces is checked by exact decoded text, case-sensitive filename and file kind. Different IDs are never silently matched based on similar names or content.
3. **Explicit five-way file status**. Added, removed, content-changed, filename/type-only modified and unchanged are counted and displayed. Every selected backup gets a complete preview, including zero changes.
4. **Search and question drift flags**. Query words, all/any/phrase/near mode, source filter, and optional AI question are individually flagged as changed/unchanged without silently comparing or transmitting them to a service.
5. **Real destructive restore warning**. The confirmation states how many existing source files will be removed and how many source contents overwritten. File removal and content overwriting are also disclosed in the preview. When all files and settings are identical, replacement is disabled.
6. **Privacy-minimized copyable change report**. The local text report includes only category counts and changed-setting yes/no flags; it omits full source text, filenames, source IDs, raw search terms, questions, cryptographic hashes and passphrases. The UI itself still displays relevant names from the user-selected backup.
7. **Actual passphrase rotation, not a UI-only rename**. A chosen encrypted JSON is authenticated and fully validated using its current passphrase, canonical decoded workspace text is re-serialized and SHA-256 checked, and a separate AES-256-GCM archive is written with the new passphrase, newly generated random salt and nonce. The original archive is not modified, deleted or replaced.
8. **Safer rotation controls**. Distinct old/new/confirm password inputs, fail-closed mismatch checks, new passphrase must differ from old, no automatic plaintext fallback, bounded file reader, explicit local download filename and stale asynchronous result invalidation.
9. **Clear post-rotation guidance**. Test the new file with its new passphrase **before** manually deleting old copies. Rotating one downloaded copy cannot revoke other copies, recover a forgotten passphrase or authenticate who supplied the documents.
10. **Regression suite**. Tests assert exact Unicode/CRLF changes, source identity, metadata-only changes, no-op, search-only drift, private reports, real cryptographic rotation, old-key rejection, new random salt/nonce, wrong-old-password/tampering failure and UI guards.

## Honest security and deployment scope

- All operations are local browser work. No network, backend, external AI, background persistence or paid provider is introduced. Rotation necessarily creates temporary plaintext **in JavaScript memory**, not a plaintext **download**. Do not claim secure memory erasure or hardware attestation.
- The comparison verifies differences between **user-loaded** text and a cryptographically validated backup. It does not prove source authenticity, truth, or authorized authorship. A party knowing the existing passphrase can create a new encrypted archive from their own copy.
- Rotating one encrypted archive **does not revoke existing copies**. Old copies and any existing unencrypted backups must be handled by the user. Lost passphrases cannot be recovered.
- The previous 8-file, 100,000-character/file, 400,000-total-character, 3MiB plaintext and ~4MiB encrypted caps stay unchanged.
- The same deliberately opt-in AI Chat path remains. Loading, comparing, rotating and restoring do **not** invoke AI or charge credits, and imported search hits/AI results are never trusted as fresh.
- AI Video, Automation/CTF, Supabase and deployed service source are untouched.

## Validation checklist

- [ ] Run new Phase 16 suite and all Phase 8–15 document/unit tests, syntax, app build, and desktop/mobile Chrome CI.
- [ ] Import an encrypted and a legacy plaintext snapshot: ensure both show exact per-source and setting differences without replacing current files.
- [ ] Compare changed source content and CRLF/Unicode variants. Same filename/new ID must count as removed+added; metadata rename/unchanged text must not count as content changes.
- [ ] Check no-op disables restoration. Confirm warnings enumerate removed and overwritten files before any replacement.
- [ ] Copy the change summary and check no filenames, user text, passwords, hashes, source IDs or search/question values appear in output.
- [ ] Re-encrypt with different passphrase; compare decrypted originals, salt, nonce, ciphertext and exact snapshot values. Verify new passphrase works, old one fails for the new file, while the old file remains readable using the old passphrase.
- [ ] Alter ciphertext, enter wrong old password, same old/new password, invalid file type, too-small new password: no backup should be created.
- [ ] Test file/query changes while operations run and verify stale results are discarded; no implicit restore or AI/network calls.
- [ ] Confirm changed component compiles with existing React/TypeScript and test sample files on Chrome mobile/desktop and keyboard navigation.
- [ ] Distinguish CI acceptance from production authorization and account-level external AI verification.
