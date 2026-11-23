# AI Arsenal — Phase 9: JSON and CSV structural comparisons

## Scope

Upgrades the existing browser-only two-document comparator with true **structural** diff modes. Both text sources are supplied by the user, and comparison remains local until a separate, explicit AI Chat request.

## Nine functional improvements

1. **JSON structural diff**: parse both inputs as real JSON, compare objects by property name (ignoring ordering), arrays by index, and primitives by exact value/type. Missing fields are distinct from JSON null.
2. **Traceable JSON locations**: every changed/added/removed node has an RFC 6901 JSON Pointer, with correct escaping of slash and tilde. Changing a nested field no longer appears as an unrelated text line rewrite.
3. **CSV quote-aware parsing**: actual comma-separated data with quoted delimiters, doubled quotes, UTF-8 BOM, CRLF, and quoted multiline values. No formula execution, CSV evaluation, or remote lookups.
4. **CSV unique-key matching**: a user supplies an exact, case-sensitive header name. Rows align by that unique value even when row order and column order change. Single-cell edits, added rows, and removed rows are shown separately.
5. **Fail-closed ambiguity**: duplicate keys, empty keys, incompatible column names, malformed quotes, duplicate headers, and unequal-width rows are rejected rather than guessed or silently reconciled.
6. **Bounded local work**: 100,000 characters per source, 32 JSON levels, 5,000 JSON comparison nodes, 1,200 CSV data rows, 100 CSV columns, 2,000 report changes. Limit violations refuse the entire comparison instead of returning an incomplete result.
7. **Exact source evidence**: changed values are JSON-serialized source values, not AI paraphrases. Results distinguish addition/removal/change and show their exact JSON Pointer or CSV record/key/column.
8. **Complete reports**: the UI previews up to 50 structural changes for usability while copying and downloading TXT or JSON exports retain every change; previews explicitly disclose their display cap.
9. **Opt-in AI interpretation**: a separate user click sends a small, whole structural report (at most 12 changes and a 3,600-character prompt) through the already deployed, authenticated `ai.documents.analyze` chat bridge. It may consume existing `ai.chat` credits and save chat history. There is no silent truncation, background request or automatic retry.

## Activation boundaries

- Raw line diff remains the default mode; JSON and CSV are explicitly selected.
- CSV columns must have identical *sets of names*, although their order may differ. Duplicate column names are invalid. CSV field comparison is exact and case-sensitive.
- Arrays are aligned by **index**, not heuristic move/rename detection. Adding/removing an object can be represented as a whole JSON value rather than field-by-field edits.
- Structural comparison is deterministic text/data processing, not semantic AI understanding, OCR, PDF extraction, external data validation or document authenticity verification.
- Model output is advisory and must be checked against the source document. The two original source documents stay private during local comparison; only an explicitly submitted complete bounded difference report reaches the configured chat provider.
- The UI does not auto-submit large reports; users must narrow the inputs manually.
- No new database schema, paid service, image/audio/video feature or AI Video code is included.

## Acceptance checklist

- [ ] Run new `ai-structured-comparison-phase9.test.mjs` and existing Phase 8 regression suite.
- [ ] Test pasted and uploaded JSON with property reorder, arrays, nested paths, null vs absent, and path escaping.
- [ ] Confirm invalid JSON and excessive nesting/nodes return errors with no partial output.
- [ ] Test CSV files with quoted commas, embedded quotes, multiline cells, BOM and CRLF.
- [ ] Compare CSV files with reordered columns and rows. Require a unique key; duplicate/missing values or incompatible schemas must be rejected without arbitrary matching.
- [ ] Confirm 1,200-row, 100-column and 2,000-change limits, plus correct preview/full-export separation.
- [ ] Edit either source, the comparison mode or CSV key; verify stale results and stale AI responses disappear.
- [ ] Test client accessibility, mobile layout, copy/download of full reports and that no network calls occur during local comparison.
- [ ] Test opt-in AI Chat with an authenticated staging account, valid credit entitlement, and provider availability; verify no charges for rejected/oversized reports.
- [ ] Confirm AI Video is untouched and native scanned-PDF OCR / embedding search remain separate unverified work.

Passing GitHub unit/build checks alone does not prove the external AI provider or staging account integration.
