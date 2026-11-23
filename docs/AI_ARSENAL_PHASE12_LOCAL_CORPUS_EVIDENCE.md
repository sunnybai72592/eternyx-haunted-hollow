# ETERNYX AI Arsenal Phase 12 — Local Multi-Document Evidence Retrieval

## Delivered

1. **True multi-file keyword search** across up to 8 independently uploaded local text files (TXT, MD, CSV, JSON and LOG); uses existing validated file reader. Files are held in browser memory only.
2. **Bounded atomic file admission**: no partial import of a selected batch, duplicate name/ID rejection, 100,000 characters per file and 400,000 total. File selection is explicit; no new remote upload or storage.
3. **Unicode-aware literal token matching** with normalized case and NFKC text: supports exact word queries rather than accepting untrusted regular expressions or executable search syntax. Up to 8 distinct query words and a 120-character query.
4. **All/any search modes**, plus a file-specific filter. ALL requires all query tokens to appear on the same line. Any matches at least one token. No implicit phrase matching or semantic proximity claims.
5. **Deterministic, explainable ranking**: 100 points per query term represented in a line plus up to 50 points for term occurrence count; ties preserve file insertion order and physical line order. This is NOT vector similarity, source quality or an AI relevance metric.
6. **Exact provenance**: each result identifies the original selected filename, file ID, document type, physical line number, snippet's starting column, matched words, frequencies and its true source line length. The excerpt is copied from that source text.
7. **Honest long-line behavior**: source lines above 340 characters display exact bounded substrings with a visible partial-excerpt flag and original line length, not an invented full quotation.
8. **Complete result exports**: local copy, TXT and JSON contain every stored matching source line up to the explicit 2,000-hit cap. The UI displays up to 80 while explicitly stating what is previewed. A query with over 2,000 hits is refused, not silently truncated.
9. **Human-selected AI context**: user chooses 1–6 visible source excerpts. Only an explicit request calls the existing authenticated `ai.documents.analyze` bridge. The full selected snippets plus source labels/lines are sent, with untrusted-data instructions and a 3,600-character maximum local prompt.
10. **Privacy and stale-state gates**: known sensitive patterns in the exact AI prompt trigger a separate send-confirmation; cancelling sends nothing. Editing the query/filter/mode/files or evidence selections invalidates stale search and AI results. A pending file read cannot overwrite newer user actions.
11. **Regression tests** for source limits, Unicode and mixed newlines, deterministic ranked results, full export, partial source excerpts, >2,000 hit rejection, exact unmodified selected AI evidence, chat request length and UI opt-in enforcement.

## Security, privacy and functionality boundaries

- **Offline/local retrieval only**. No live web access, PDF parsing, scanned PDF OCR, embedding model, semantic vector search, cloud indexing, network sync, or automatic AI analysis.
- The upload widget is a user-triggered browser file selector. Selected documents stay in React state until removal, refresh or close. No persistent backups are created.
- Search scores indicate matching word coverage/frequency only. Results **cannot verify whether an author, document, source claim or citation is authentic**.
- Up to 2,000 full evidence results per query are retained; more results are treated as excessive and no partial report is returned.
- Source lines longer than 340 characters use a faithful partial source substring, visibly marked partial in UI, TXT, JSON and any opt-in AI request.
- The explicit optional AI action sends **only** the chosen snippets and metadata to ETERNYX's configured external AI Chat provider. It can consume `ai.chat` credits and save user history. The existing Document Privacy Guard is heuristic, not comprehensive: zero pattern matches do not make data safe to share.
- No database migration, paid model integration, release rollout, AI Video code or background job is included.

## Verification checklist

- [ ] Run `tests/ai-corpus-evidence-phase12.test.mjs` plus previous AI Document Intelligence tests.
- [ ] Add multiple real user-authorized text documents; try two files with the same name or invalid sizes, verify the complete batch is rejected.
- [ ] Search Unicode text, repeated terms, CRLF documents; inspect exact file and physical line evidence, source excerpts, and deterministic ranked sorting.
- [ ] Exercise "all" vs "any" and file filters, invalid queries, oversized results and 2,000-result refusal.
- [ ] With more than 80 hits, preview only 80 while local TXT/JSON exports include all up to 2,000.
- [ ] Inspect long-line excerpts and ensure the partial flag and original line lengths are correct. Verify AI is not claimed to have seen unseen text.
- [ ] Change files, query, filter or mode during a file read and while an AI request is pending; confirm stale results cannot reappear.
- [ ] Cancel known-sensitive-data confirmation; verify no AI network request or credit debit. With explicit consent, inspect the actual provider payload and credit history in staging.
- [ ] Test keyboard and mobile usage of multi-file selection and evidence checkboxes.
- [ ] Confirm no AI Video code and no new database migration. CI passing does not prove authenticated provider availability or production deployment.
