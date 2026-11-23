# AI Arsenal Phase 3 — actual PDF text-layer extraction and bounded document retrieval

## What changed
1. Replaced raw `TextDecoder` of binary PDF contents with actual text-layer parsing by pinned `npm:unpdf@2.2.1` (serverless PDF.js) in the authenticated document processing Edge Function. Pages are numbered in extracted text.
2. Validates PDF magic header, page count (1–60), bytes (maximum 12 MiB), text budget (240,000 characters), and soft 20-second deadline; PDF.js evaluation is disabled and max image dimensions are limited.
3. Fails clearly for scanned/image-only PDFs: **OCR is not implemented for PDF pages**. Existing image OCR still depends on the prior configured external provider and is not activated by this PR.
4. Validates MIME/image signature, storage object key belongs to the authenticated user, and database file size matches actual storage object bytes.
5. Chat context retrieval now makes up to six bounded, case-insensitive query-term searches scoped to the selected owner's document; each returns up to 40 candidates from anywhere in the document (rather than fetching the first 200 chunks). It deduplicates and ranks up to five context passages by lexical overlap.
6. Original chunk indexes are retained in context as segment markers. When no passages match, the system prompt explicitly instructs the model not to invent an answer from the selected document.
7. Upload UI enforces 12 MiB PDFs, surfaces safe processing errors, and requires verified Edge Function success before telling users a PDF is ready.
8. Pure tests for headers, page bounds, text extraction limits, owner-scoped storage paths, image magic numbers, and integration boundaries.

## Limits and non-goals
- PDF text layer only: no automatic OCR for scanned PDFs, password recovery, rich table extraction, hyperlink fetching, or guarantee of correct reading order. Text extraction quality depends on embedded PDF fonts/text layer.
- Lexical `ILIKE` search is **not semantic RAG, embeddings, vector search, or independent citation verification**. At most 240 raw candidates (six terms x 40) are retrieved; some relevant passages can still be missed. Original segment numbers are labels, not verified citations.
- The 20-second timeout is an awaited deadline, not a hard interruption of CPU-bound parser code. The Supabase runtime still supplies hard CPU/memory limits.
- Image OCR calls may incur external-provider costs if that existing feature is enabled; this PR introduces no new paid model calls or model registrations.
- No migration or new third-party secrets. No AI Video files changed.

## Required staging acceptance before promotion
- [ ] Run `node --test tests/ai-pdf-ingest-guards.test.mjs tests/ai-document-context-ranking.test.mjs` and the normal CI.
- [ ] Deploy **both** `process-document` and `eternyx-ai-chat` Edge Functions to staging with Supabase's current Edge bundler; verify `npm:unpdf@2.2.1` resolves and executes. A green frontend build does *not* prove a Deno Edge deployment.
- [ ] Using an authorized test account, upload a small text-layer PDF. Confirm meaningful extracted text and ready status; ask a question whose answer appears late in the document and validate context/answer.
- [ ] Try image-only scanned PDF: confirm a safe `no_text_layer` failure instead of binary data being marked ready.
- [ ] Try malformed PDF, a PDF with more than 60 pages, >12 MiB PDF, wrong PDF signature and mismatched declared image content.
- [ ] Test owner A versus owner B document/storage references and ensure no cross-user access.
- [ ] Test missing query match: response must not assert invented document facts.
- [ ] Test existing PNG/JPEG/WebP OCR workflow separately with approved paid-provider settings if configured.
- [ ] Confirm status/error details, no duplicate chunks on reprocessing, and that logging contains no document contents.
- [ ] If Edge PDF parsing exceeds runtime limits, move heavyweight extraction to a dedicated worker; do not remove resource limits or trust client MIME fields.

## Follow-on
Scanned-PDF OCR with explicit provider approval, DB full-text index or pgvector embeddings with RLS, true cited excerpts, scheduled storage cleanup, safer provider/rate controls, and document evaluation suites remain outstanding.
