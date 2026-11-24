# ETERNYX AI Arsenal — Phase 15: Private Encrypted Evidence Backups

## Why this phase

Phase 14 implemented bounded, SHA-256-checked but **unencrypted** JSON exports of local document evidence. Phase 15 adds a **separately chosen, password-encrypted** export and import path, without breaking older plaintext backups. This is client-side encryption of user-loaded text; **not** a remote encrypted cloud vault, author authentication or a full key-management product.

## Delivered security and workflow improvements

1. **Real browser cryptography.** AES-256-GCM authenticated encryption/decryption through Web Crypto. Each operation uses a fresh 12-byte random nonce, 16-byte random salt and a 128-bit authentication tag; keys are not extractable.
2. **Passphrase-based key derivation.** PBKDF2-HMAC-SHA-256 with 600,000 iterations, minimum 12-character / maximum 256-character case-sensitive passphrase. A strong unique random passphrase is recommended. This is deliberately a password-based format: weak/reused passphrases remain vulnerable to offline guessing.
3. **Confidential complete workspace.** The entire Phase 14 serialized JSON document (file names, IDs, document text, search query/mode/filter/question, internal SHA-256 digests) is encrypted together. Only public envelope metadata and approximate ciphertext size are visible.
4. **Strict versioned cryptographic envelope.** Format `eternyx.encrypted-corpus-workspace`, version 1; exact whitelisted properties, fixed permitted KDF/iteration/cipher values, canonical base64 encoding, fixed salt/nonce lengths, bounded ciphertext and archive bytes. Reject unknown fields/unsupported settings instead of trying insecure fallback algorithms.
5. **Authenticated decryption and full underlying validation.** An incorrect passphrase or modified ciphertext fails closed with the same generic error. After AES-GCM passes, the existing Phase 14 schema, document bounds, reference integrity and per-document decoded-text SHA-256 validation run before the UI is allowed to preview anything.
6. **Password confirmation and explicit encrypted export.** Two password fields must match before encryption. No plaintext backup is silently created as a fallback on error, and the encrypted output uses an explicit `encrypted-v1.json` filename.
7. **Separate encrypted import.** User enters the passphrase and chooses an encrypted JSON file. Browser decrypts and validates locally, then shows the existing safe preview. Import does not itself restore or call the backend.
8. **Destructive restoration stays human-controlled.** Explicit second confirmation required to replace current local documents. Old selected source context, query search results, fingerprints and AI outputs are invalidated; imported files are not executed or automatically sent to AI.
9. **Ephemeral passphrase handling.** React input values are cleared after use, cancelled/edited workspaces discard pending imports and passwords, and asynchronous encryption/decryption responses are ignored if the workspace has changed. No keys/passphrases are persisted in localStorage, sessionStorage, database or any API.
10. **Backward-compatible plaintext mode with prominent warnings.** Phase 14 plaintext export/import stays available and is explicitly labeled **UNENCRYPTED**, whereas the recommended encrypted option is prominent. A plaintext JSON backup is rejected by encrypted import, and an encrypted archive is rejected by the legacy plaintext parser.
11. **Operational safety and cryptographic test suite.** Regression tests cover Unicode/CRLF source exact round trip, confidential metadata, per-export random salt and nonce, wrong passphrase, tampered ciphertext, unsupported algorithm/version/rounds, base64 canonicality, file size/type limits, missing browser WebCrypto, plaintext compatibility and explicit UI gates.

## Limits and threat model

- Encryption protects the **saved archive's contents at rest from parties without the passphrase**. Because an attacker may attempt many offline passwords, a weak password cannot be made safe by the encryption algorithm alone. Use a long, unique, unpredictable phrase.
- The outer JSON envelope includes cryptography identifiers, iteration count, random salt and nonce, and ciphertext. The file's approximate byte size is visible. Inside are the actual user-supplied documents and search settings, encrypted together.
- The passphrase is not uploaded, but it necessarily exists temporarily in browser JavaScript memory while encrypting/decrypting. Browsers, extensions, screen recording, compromised devices, backup copies, and the user's password manager are outside this local encryption guarantee. Memory cannot be guaranteed wiped in JavaScript.
- This format has **no password recovery**, shared-key escrow, authenticated author identity, document provenance, external source credibility, hardware-backed vault or organization policy integration.
- The underlying source documents continue to be stored in in-memory React state after a successful confirmed restore. Their contents may still be sent to the existing external AI Chat provider **only** by separate user action with existing disclosure and privacy checks.
- New encrypted JSON files are bounded (maximum about 4 MiB, including JSON base64 expansion), as are plaintext corpus backups (3 MiB), with the existing 8-file / 100k-char-per-file / 400k total character limits. Unsupported or invalid data must not be partially imported.
- No new package dependency, paid API, database migration, backend deployment, automatic storage, Web search, OCR/semantic RAG or AI Video code.

## Staging acceptance checklist

- [ ] Confirm all Phase 8–14 existing document tests and new Phase 15 encryption tests, typecheck/build, browser acceptance and GitGuardian pass.
- [ ] Export a private workspace with UTF-8/Unicode, mixed text formats, CRLF source lines, filenames and search settings; verify the **encrypted file contains none of the plaintext data or query/filenames** and roundtrips exactly after correct decryption.
- [ ] Verify repeated exports use distinct salts, nonces and ciphertext, without changing the decrypted workspace.
- [ ] Change one encrypted byte, passphrase, format/version, cipher/KDF/iteration, base64, nonce or salt; confirm fail-closed and no current workspace change.
- [ ] Test a 12-character passphrase and strong longer password; reject shorter than 12, greater than 256, empty, and NUL-containing passwords.
- [ ] Inspect password and confirmation UX, clearing after actions, and no use of localStorage, sessionStorage or network for crypto.
- [ ] Cancel encrypted preview and destructive restoration. Modify file/query/filter while decrypting; confirm late operations cannot restore a stale workspace.
- [ ] Confirm existing unencrypted Phase 14 JSON can still be exported/read through its explicit legacy path; encrypted archives cannot be read by the legacy parser.
- [ ] Check desktop/mobile keyboard and screen-reader use. SHA-256 checks and AES-GCM do not validate the author or correctness of user-supplied content.
- [ ] Validate staging-only real-account AI Chat opt-in independently; encrypted archive import itself must never charge credits or make a remote call.

A passing CI does not certify live user accounts, deployed backend functionality or production data security.
