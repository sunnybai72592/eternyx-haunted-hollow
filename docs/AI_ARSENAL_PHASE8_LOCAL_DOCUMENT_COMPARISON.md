# AI Arsenal Phase 8 — real local document comparisons

## Delivered
1. Browser-only comparison of two independently supplied TXT/Markdown/CSV/JSON/LOG texts, using a bounded line-level longest-common-subsequence algorithm instead of fabricated AI output.
2. Exact before/after line provenance for added and removed lines, counts for unchanged/added/removed lines, and an optional whitespace-insensitive mode.
3. Bounded work: at most 100,000 characters and 1,200 lines per input; comparison refuses oversized documents rather than truncating.
4. Local second-source file upload through the preexisting validated text-file reader, plus paste/edit controls with a stale-file-read version guard.
5. Human-readable difference preview, one-click copy, and full TXT/JSON downloads. UI may show the first 50 changed lines but exports include all deltas, labeled accurately.
6. Optional real AI Chat interpretation of the **actual retrieved diff**. Explicit user click, bounded to twelve changed lines and 3,600 prompt characters. If too large, no model call or credit debit; users must narrow their sources manually.
7. Separate chat response/error display, history/credit disclosure, and stale-result invalidation whenever a source or comparison setting changes.
8. Pure algorithm tests for insertion/deletion, order, CRLF, Unicode, whitespace options, size/line guards, exact-source provenance, and AI request bounds.
9. The source comparison does not imply semantic understanding, PDF extraction, OCR, server access or autonomous workflow execution.

## Privacy and operational limits
- The two source documents stay local in React state. Selecting source files and calculating differences makes no network requests.
- Only the explicit Compare with AI Chat action transmits the bounded difference text to the configured external AI provider; existing `ai.chat` credits and session history apply.
- Whitespace-insensitive mode compares trimmed/collapsed whitespace, but exported changed lines retain the original text.
- Reordered blocks may appear as removed and added lines. This is a deterministic textual diff, not semantic revision tracking.
- No automatic PDF OCR or semantic/vector RAG. No AI Video files touched.

## Required staging verification
- Run pure compare tests and existing document/AI bridge suites.
- Verify two local files and manual pasted text on desktop and mobile; no backend network calls during offline comparison.
- Test text containing CRLF, emoji, repeated lines and 1,200-line limits; verify export matches exact local source lines.
- Confirm edited/changed source invalidates a previous diff and an in-flight AI output; no stale comparison survives.
- Confirm AI only runs on explicit click, under twelve changes and 3,600 input characters; verify chat credit and saved history behavior in staging.
- Confirm source fields and copy/download actions remain accessible to keyboard and screen readers.
- Browser CI does not prove live provider access, actual account billing, or production deployment.
