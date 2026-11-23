# AI Arsenal Phase 5 — indexed lexical search and PDF-page provenance

This PR upgrades source grounding. **It does not activate embedding-based semantic search or automatic scanned-PDF OCR.** AI Video is out of scope.

## Implemented
1. Actual parsed PDF page markers are preserved **on every chunk**. Search results can identify the original PDF page without guessing from segment number.
2. Evidence snippets are exact substrings of retrieved text, shifted toward the user's question when a chunk is longer than the display budget.
3. Evidence APIs and UI distinguish actual PDF page markers from mere document segment numbers and identify the retrieval mode accurately.
4. Review-only PostgreSQL GIN full-text index and **SECURITY INVOKER** search function. The SQL uses owner checks and \`auth.uid()\`; it does not accept caller-controlled user IDs or bypass RLS.
5. Optional Deno Edge search mode: \`ETERNYX_AI_DOCUMENT_FTS_ENABLED=true\` uses the reviewed RPC once deployed. Default continues the existing bounded owner-scoped lexical retrieval. There is no hidden fallback on indexed-search errors.
6. The indexed search query is built from at most eight deduplicated Unicode word terms with OR operators authored in code; no interpolation of raw user SQL.
7. Indexed results are bounded to 80 candidates, ranked to five evidence excerpts, and gated by an owned document's \`ready\` state. Missing evidence is rejected **before consuming \`ai.chat\` credits**.
8. Regression checks for real page metadata, chunk boundaries, FTS query shaping, SQL/RLS boundaries, opt-in mode and evidence display.

## Database change: review only
SQL source: \`docs/sql/ai_document_search_fts_review.sql\`. This is **not** an auto-applied migration. We deliberately avoid modifying the user's production Supabase schema while database access and migration collision audits are unresolved. Generate a proper migration with the Supabase CLI after the schema is verified, merge it only after database-owner approval, test permissions and performance, then set \`ETERNYX_AI_DOCUMENT_FTS_ENABLED=true\` for the staging Edge Function. Never set the flag before deploying the RPC.

## Mandatory staging acceptance
- [ ] Verify current DB schemas and migration collision checks; run SQL in isolated staging with a read/write user authorized for DDL.
- [ ] Verify GIN index via \`EXPLAIN (ANALYZE, BUFFERS)\` on a representative owner dataset; benchmark a late-document keyword and multi-term query against old ILIKE.
- [ ] Test \`search_owned_document_chunks\` as signed-in user A against A's ready document; confirm rows ordered by relevance, bounded <=80.
- [ ] Query A's document as user B, anonymous and pending/failed document owners; all must yield **zero rows**. Revoke PUBLIC execute is required.
- [ ] Deploy the updated \`process-document\` and \`eternyx-ai-chat\` functions to staging. Reprocess a text-layer PDF so new chunks carry page markers.
- [ ] Test questions matched only on PDF page 40, multi-page document and terms like CP/IR/pH. Ensure the displayed page number is the one from the parser.
- [ ] Confirm no match returns 422 **with no credit charge**, and missing/invalid RPC fails closed rather than quietly using an unsafe path.
- [ ] Verify source excerpts, result mode labels and downloaded conversation text against actual document chunks. Evidence is still only held in the live UI, not historical chat sessions.
- [ ] Verify scanned PDFs still reject missing text layers, and the existing explicit-consent page-image OCR workflow still needs a configured vision provider and staging authorization.
- [ ] Run node utility tests and CI build; frontend green alone does not prove DB search deployment or the PDF parser in Edge runtime.

## Remaining milestones
Native OCR for scanned PDF pages requires a separately validated rendering/OCR worker and resource budget. Semantic vector retrieval needs populated embeddings, an approved model/provider and an owned RPC with RLS. Persistent evidence provenance and document lifecycle management also remain open.
