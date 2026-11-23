# ETERNYX AI Arsenal — Phase 13: Source-Verified Local Evidence Review

## Purpose

Phase 12 shipped local multi-file keyword evidence search. Phase 13 makes retrieval more precise and lets users inspect and independently compare the *loaded text* before optionally sending selected evidence to AI Chat. This is not live research or a truth/authenticity verifier.

## Functional improvements

1. **Consecutive-word phrase search**: user selects Phrase mode. Matches normalized Unicode word tokens in the exact query order, preserving repeated terms, on the same physical line. Punctuation and whitespace between those tokens are NOT compared character-for-character.
2. **Bounded proximity search**: user selects Near mode. All distinct query words must occur within three intervening words of one another on a single physical line, in any order. It is lexical word proximity, not semantic similarity.
3. **Unicode-combining-mark support**: token matching includes Unicode mark characters so accent-bearing Arabic/Pashto and other normalized scripts preserve their word tokens. The source string and UTF-16 source columns are never rewritten.
4. **Explainable phrase/near bonus scores and source spans**: results report the real first and last source character columns for a matched phrase/near window. Phrase adds a constant 300 scoring points; near adds 150 plus a distance bonus. Standard ALL/ANY scoring is unchanged. All modes retain stable sorting and the 2,000-hit fail-closed cap.
5. **Original source context view**: open any visible hit to inspect up to two preceding and two following physical source lines. The selected line and neighboring lines remain source-derived, not AI-generated.
6. **Explicit partial context**: source lines longer than 340 characters are shown as exact 340-character substrings marked PARTIAL with their actual full line lengths and start column.
7. **Current-source quote revalidation**: before using a search hit for optional AI Chat, verify its file ID, source filename and kind, line number, current line length, excerpt offset, complete/partial status, exact source substring and any phrase/near source columns. Stale or mismatched source evidence is rejected instead of submitted.
8. **Complete selected evidence review**: copy or download 1–6 explicitly selected excerpts together with adjoining source context as a *local* textual review. This is separate from optional AI submission; surrounding context is never secretly added to the AI prompt.
9. **Per-file coverage review**: counts matching lines and actual covered query words for each filtered source, including files with zero hits. These counts are not source-quality rankings, factual agreement, verified citations or AI assessments.
10. **Actual browser SHA-256 source fingerprints**: optional user-initiated WebCrypto SHA-256 for UTF-8 encoding of the **current decoded text in memory**, with displayed hashes and a complete downloadable manifest. Since decoding/line endings could differ from uploaded bytes, these are NOT guaranteed original-file checksums, signatures, author authentication or proof of factual truth.
11. **Stale-hash safeguards**: changing/removing source files invalidates fingerprints; a prior asynchronous hash computation cannot overwrite results for a newer source collection. Browser contexts without WebCrypto return a clear failure, not fabricated hashes.
12. **Regression coverage and staging checklist**: verify phrase/repeated-word order, near-window boundaries, Unicode/CRLF and UTF-16 columns, malformed queries, source edits and line tampering, bounded selected review, per-file counts, SHA-256 against known cryptographic digests, and opt-in AI gates.

## Security and scope

- All search, source review, keyword coverage and SHA-256 operations are **local browser functionality**. No automatic upload, remote indexing, vector database, OCR, new model or paid provider.
- `searchCorpus` still supports ALL/ANY modes; Phase 13 adds Phrase/Near with explicit source-derived match spans. The same maximum eight files, 400,000 total characters, and 2,000 complete hits remain in force.
- The local SHA-256 manifest describes **decoded text**, not necessarily the original file bytes. Fingerprints cannot establish authenticity; they only help compare known in-memory text values.
- The optional `ai.documents.analyze` action still requires a deliberate user click. It sends **only the selected bounded excerpts**, with original source label/line/column; it can consume existing `ai.chat` credits and store history. A separate heuristic privacy-warning confirmation remains active when common sensitive-looking strings are detected.
- No AI Video changes, no schema migration and no external source-credibility assertions.

## Staging acceptance checklist

- [ ] Run the Phase 13 new tests and all prior AI Document Intelligence regressions, syntax, application build and Chrome desktop/mobile CI.
- [ ] Compare ALL/ANY search with new Phrase and Near; confirm repeated term order and no false positives on separated or reversed phrases.
- [ ] Check Near with exactly three intervening words (accepted), four intervening words (rejected), and reversed word order (accepted).
- [ ] Verify combining-mark Arabic/Pashto, NFKC normalization and UTF-16 columns for mixed-script lines, emoji and CRLF source text.
- [ ] Use long lines: verify copied snippets exactly match the original substring and every incomplete excerpt is labelled PARTIAL with real line length/column.
- [ ] Preview ±2 source lines, manually edit/remove a file and verify stale selected evidence is rejected before AI transmission.
- [ ] Select 1–6 results; copy/download full local source-context review. Confirm this is separate from optional AI chat and cannot include hidden context in the AI prompt.
- [ ] Validate per-file coverage counts, including files with no matching lines, against the user-loaded input.
- [ ] Calculate browser SHA-256 fingerprints; compare against SHA-256 of the current decoded UTF-8 text, not raw upload bytes. Change files during hashing; confirm stale fingerprints are never displayed.
- [ ] Confirm no search or hashing network calls. Use a consenting staging account for explicit AI Chat request payload/credit/history verification; CI alone cannot verify provider or production activation.
- [ ] Confirm AI Video code, backend schema and migrations remain untouched.
