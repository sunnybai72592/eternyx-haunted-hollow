# AI Arsenal Phase 14 — Verified Local Corpus Workspace Backups

## Scope

Phase 14 makes the existing 8-file local Document Intelligence evidence collection portable. This is browser-only backup and restoration: no database, cloud index, background task, provider integration, or AI Video changes. The exported JSON contains **full plaintext decoded document content**.

## Implemented improvements

1. **Versioned portable workspace export**: user-triggered JSON archive (format `eternyx.local-corpus-workspace`, version `1`) containing up to eight validated local text files and their stable IDs, filenames, kind, original decoded text, keyword query, match mode (all/any/phrase/near), selected file filter, and optional AI evidence question.
2. **Actual per-file SHA-256**: Web Crypto computes the digest of UTF-8 encoding of each file's decoded text; the backup includes this checksum. It is not a hash of the original raw bytes, signature, creator authentication, or proof of factual correctness.
3. **Full integrity verification before accepting a restore**: every file is rehashed and checked against its stored digest. If any digest mismatches, the entire import fails—there is no partial success or silent repair. A maliciously rewritten bundle can include new matching hashes, so the checks are not an authentication system.
4. **Fail-closed schema validation**: strictly whitelisted root fields, exact version, supported file kinds, valid IDs and unique case-insensitive filenames, no binary/NUL or invalid text, and no injected executable/authorization fields. Uses the existing corpus admission validation.
5. **Bounded local read and export**: 3 MiB maximum for JSON upload/decoded contents; underlying corpus remains bounded to 8 files, 100,000 decoded UTF-16 characters per file and 400,000 total. If the browser cannot provide WebCrypto SHA-256, refuse import/export rather than silently skipping integrity verification.
6. **Explicit import preview**: only a user-chosen .json file is parsed. The preview shows backup file counts, decoded character totals, filename list, search mode/query, and verification status. No current workspace is changed while previewing.
7. **Destructive replacement confirmation**: a separate user click must confirm replacing all currently loaded documents and search settings. Cancel preserves the user's original files; import is not a merge.
8. **Restore without stale evidence or execution**: preserve only verified decoded text and search configuration. Imported or previously cached search hits, selected excerpts, fingerprints, previous AI responses, and unfinished requests are invalidated. The user must search again; importing never calls AI or a server.
9. **Concurrency protections**: modifying source files, query, filter, mode or AI question cancels pending import previews. Async file reads, fingerprint calculations and backup exports have generation guards so stale results cannot overwrite later user actions.
10. **Plaintext transparency and inventory preview**: explicit notice that full original decoded document text is stored unencrypted in the exported JSON. The separately copyable inventory excludes full document contents but includes counts, names, source IDs, query and decoded-text digests.
11. **Regression and staging checklist**: automated tests cover round-trip identity, all query modes, broken JSON, schema tampering, duplicate/oversized files, missing credentials/crypto, checksum mismatch and UI restore boundaries.

## Security and privacy boundaries

- **Backup is plaintext.** It can contain confidential excerpts, credentials, technical notes and filenames. Users must store it privately; do not upload it to untrusted places. This feature does not encrypt backups.
- **SHA-256 here verifies consistency of the saved text with the hash saved in the same bundle**. It does not authenticate authors, determine whether the source is genuine or detect tampering if both the text and its saved hash have been altered.
- The backup is not a signed archive, not an encrypted vault, not a source authenticity proof, and not a remote synchronization service. There is no automatic persistence: the user must click Export and keep the file.
- Restoring does not automatically run a keyword search, contact the AI provider, execute embedded content, or charge credits. The separate optional AI Chat bridge retains its existing explicit-click and privacy-warning requirements. Its availability requires account-level staging verification.
- The loaded source files stay in browser memory only, subject to the existing caps. The browser file selector can read .json user-chosen files; URL strings inside the data are not visited.
- No live web research, embeddings, OCR, native scanned PDF parsing, provider change, new database migration, or AI Video work is claimed.

## Staging acceptance

- [ ] Run the Phase 14 unit suite and all preceding Phase 8–13 Document Intelligence regressions; validate the frontend build and desktop/mobile Chrome acceptance.
- [ ] Export a workspace with 8 actual text documents of mixed supported kinds and Unicode content; verify complete JSON round-trip, source IDs, text, query mode and filter.
- [ ] Corrupt one character in one document while leaving its saved hash intact; confirm **the entire import is refused** and currently loaded files remain unchanged.
- [ ] Reject unsupported version, unexpected fields, injected permissions, duplicate filenames/IDs, NUL bytes, oversize text/JSON and unsupported file formats.
- [ ] Choose a backup, review preview, cancel and confirm no workspace changed; accept only after a second explicit destructive confirmation.
- [ ] Modify files, search query, file filter, mode and question while an import is reading; ensure stale async completions cannot apply.
- [ ] Click Export while another source changes or an import starts; ensure older export work cannot publish an obsolete backup.
- [ ] After restoring, verify no stale results, AI answers, selected context, fingerprints, downloads or network requests; manually run a fresh search.
- [ ] Inspect unencrypted JSON and inventory copy and confirm privacy warning is obvious. Check keyboard and mobile file-selection/confirmation accessibility.
- [ ] Confirm AI Video and Supabase source/migrations remain untouched.

Passing CI does not certify external AI providers, deployed hosting, or actual account billing behavior.
