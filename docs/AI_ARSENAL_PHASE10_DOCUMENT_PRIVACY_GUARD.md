# AI Arsenal Phase 10 — Document Privacy Guard (local)

## Delivered

1. **Pattern-based local inspection** of the currently loaded TXT/MD/CSV/JSON/LOG text or selected AI excerpt. Detectors: common email syntax, explicitly labelled credential assignments, Bearer tokens, JWT-looking tokens, Luhn-valid payment-card-like numbers and international phone number patterns.
2. **Redact only matched value spans**, leaving surrounding text and credential labels intact. Higher-priority credential/Bearer matches win over nested JWT/email-like candidates. Every replacement is marked `[REDACTED_...]`.
3. **No partial scan under limit pressure**: at most 100,000 UTF-16 characters and 250 non-overlapping findings; oversized input, NUL/binary text or excessive findings fail closed.
4. **Reviewable, source-positioned findings**, exact category counts, line and column, and full human-inspectable redacted text. The findings UI/audit list categories and positions without including the original matched values.
5. **Private outputs**: clipboard copy of redacted text or value-free finding audit; complete local TXT downloads for both. No network calls, external uploads, background jobs or storage writes are used for scanning and exports.
6. **Explicit AI input selection**: optional checkbox uses the reviewed, current redacted text for document AI analysis/extraction via the existing authenticated `ai.documents.analyze`/`ai.documents.extract` bridge. It is opt-in, not automatic. Editing source, changing excerpt or changing the task invalidates stale copies and previous AI results.
7. **Raw-text disclosure**: clicking AI Chat with known unmasked candidate values requires an additional explicit confirmation; excessive candidates refuse submission. This does not imply other secret formats have been found.
8. **Separate comparison AI gate**: the existing line/JSON/CSV difference prompt is scanned before AI submission. Known candidate values require additional confirmation; the document-analysis redaction toggle does not silently change comparison evidence. Existing comparison limits and explicit AI Chat consent remain unchanged.
9. **Regression tests**: source fidelity, Luhn filtering, overlap priority, token masking, Unicode/line positions, audit value non-disclosure, resource limits, invalidation and actual opt-in AI request routing.

## Safety & important limitations

**This is NOT comprehensive DLP, PII discovery or anonymization.** Regular expressions can miss names, addresses, unusual secrets, medical information, short credentials, locale-specific numbers, text embedded in images/scanned PDFs, handwritten notes and context-dependent private details. False positives are possible. A report with zero findings does **not** certify a document is safe to share. Users must review the entire redacted output and any external AI request themselves.

Scanning stays local, and clipboard/download are explicit user actions. No secret-value source snippets are included in value-free audit exports, but the reviewed redacted copy might still contain other undetected sensitive details.

The optional AI Chat action sends **exactly the selected source** (raw or redacted for document analysis; raw bounded diff for comparison) to the already configured external AI Chat backend; it can consume existing `ai.chat` credits and save chat history. Nothing is sent merely by scanning. Unreviewed comparison reports are never automatically sanitized, to avoid silently falsifying source evidence.

No new database migration, provider, paid OCR service, automatic uploaded-PDF parsing, embedding model, or AI Video code is included.

## Staging checklist

- [ ] Test all detectors using synthetic, non-production examples; confirm only value spans are masked and false positives are identified.
- [ ] Test 100,000-character limit, 251 findings and invalid/binary source text: fail closed, never partial or silently truncated.
- [ ] Test the audit export contains categories and positions only (no matched original text). Check complete redacted TXT export and clipboard behavior.
- [ ] Select excerpt and run a scan; change selection or source to confirm stale redacted copies and opt-in state are invalidated.
- [ ] With a consenting staging account, explicitly send a small redacted excerpt to AI Chat and inspect the network message/credit history. Verify it contains markers instead of the detected original values.
- [ ] Click AI Chat using raw text with known sensitive pattern matches; confirm the extra privacy consent. Cancel and check no request was made.
- [ ] Click optional comparison AI with a changed value resembling a secret; confirm it is never sent silently and is not affected by the document-analysis toggle.
- [ ] Verify accessible form labeling, keyboard navigation and mobile layout.
- [ ] Verify no AI Video code changes. Native scanned-PDF OCR and semantic embeddings remain unimplemented and independently gated.
