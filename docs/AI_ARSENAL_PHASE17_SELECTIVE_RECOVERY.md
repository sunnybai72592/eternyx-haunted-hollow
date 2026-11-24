# AI Arsenal Phase 17 — selective local document recovery

Builds on Phase 16 verified encrypted and plaintext backup previews. The new additive path never removes or replaces a current source or adopts backup search settings.

- Explicit source checkboxes start empty; bulk selection includes only new non-conflicting sources.
- Identical source ID, exact decoded text, filename and kind are skipped. A same-ID change or case-insensitive filename collision can be deliberately recovered as an independent copy. Different IDs are not proof of different authorship or provenance.
- Copies receive a deterministic unused ID and visible unique filename, reserving both existing and backup identities. Oversized labels use a bounded fallback. Exact decoded text and kind are retained.
- Preview shows selected count, copy names, projected file count and decoded-character count. Eight files and 400,000 total characters are enforced atomically with existing admission checks.
- Confirmation re-plans synchronously from the current verified snapshot. No implicit restore, remote calls, or AI submission. Existing query, filter, question and match mode stay unchanged. Search results, selected excerpts, fingerprints and AI results are invalidated for fresh review. Changing the backup or workspace clears selections.
- Full destructive replacement remains a separate Phase 16 action. The new path does not modify downloaded archives, claim authorship, provide secure memory erasure, or revoke earlier copies. Backups and recovered text are untrusted user content.

## Acceptance
Run `node --test tests/ai-corpus-selective-recovery-phase17.test.mjs tests/ai-corpus-import-rotation-phase16.test.mjs` with Node 22 and installed TypeScript, followed by the full suite and app build. Browser acceptance: choose a verified plaintext and encrypted backup; confirm no default selection; add only new sources; explicitly select a conflicting revision, review its renamed copy, cancel and retry; test duplicate and capacity gates; verify query/filter/question unchanged and stale results cleared. Change backup selections and current query while previewing; ensure stale selection is discarded. Test keyboard navigation, desktop/mobile layouts, and verify no recovery network request. Production browser acceptance is not established by source checks alone.
