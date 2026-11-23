# ETERNYX AI Arsenal — Phase 4 (source evidence, safer OCR, credit protections)

## Shipped in the code of this PR
1. **Evidence-aware AI Chat:** document retrieval returns bounded plain-text excerpts plus their original one-based document chunk numbers, not model-generated citation URLs. The live answer UI displays these excerpts behind an expandable section. The excerpts are **not stored in the historical chat log**; past responses will not retain these cards.
2. **More accurate lexical relevance:** supports two-character technical terms (CP, IR, pH), uses whole-word matching instead of substring false positives, rewards neighboring query terms, and retains deterministic tie-breaking. Retrieval remains bounded at six candidate query terms and 40 database results per term. This is **not vector/semantic RAG**.
3. **No-evidence / no-charge:** if the selected ready document has no matching snippets, the API responds with `422 NO_DOCUMENT_EVIDENCE` without calling the model or consuming `ai.chat` credits. The UI tells the user to refine their question. It does not fabricate a document-grounded response.
4. **Document readiness:** requests against uploaded, failed, or currently processing document records are refused before charging credits.
5. **OCR with explicit consent:** a user may export an authorized scanned PDF **page as PNG/JPEG/WebP**, upload it as an image, and choose external vision OCR. The UI asks permission before any image upload and clearly states the external provider might incur operator cost. The API also requires `ocrConsent: true` for image processing. **This is not automatic scanned-PDF OCR**.
6. **OCR resource controls:** image uploads limited to 6 MiB, provider request has a 20-second abort deadline, output text checked for emptiness and length.
7. **Provider-spend safeguards:** image processing uses a status compare-and-set to prevent overlapping requests from starting multiple provider OCR calls on the same file. Already-ready documents return a no-work success. A failed OCR can still be retried intentionally, so operator-level abuse monitoring and rate limits remain needed.
8. **Evidence transparency:** evidence displayed only for new answers with a selected document and returned snippets. The conversation export includes the currently visible snippets, labeled as retrieved—not independently verified. These are precise *chunk excerpts*, not guaranteed PDF page coordinates.
9. **Regression suite** for boundary-safe lexical ranking, original segment numbers, no-match credit protection, OCR consent, status gate, timeouts, and UI evidence.

## Required staging acceptance (not established by source/CI alone)
- [ ] Confirm PR CI, then deploy the changed `eternyx-ai-chat` and `process-document` Edge Functions to a non-production environment.
- [ ] Test PDF text layer and a real scanned PDF. The scanned PDF must still fail with OCR-not-supported and must **not** start a provider request.
- [ ] Export an authorized scanned PDF page as a JPG/PNG or WebP file. Confirm that declining the image consent does not upload or run OCR; accepting it processes only when the existing vision provider configuration is enabled.
- [ ] Try calling `process-document` with an image document ID but without `ocrConsent` and check for HTTP 403. Confirm 6 MiB upload limit and provider timeout.
- [ ] Concurrently invoke processing on the same document; only one call should acquire the database state and reach the paid provider. Check that repeated calls on a ready record do no new work.
- [ ] Ask about coating and CP terminology; verify segments across a document, whole-word matches, and UI excerpts. The excerpt must match exactly stored chunk text.
- [ ] Ask an unrelated question with a ready document selected; expect 422 without an `ai.chat` debit. Ask while status is `failed` or `processing` and expect 409 without a debit.
- [ ] Confirm no evidence data from account A is accessible to account B. Verify new evidence only appears in the in-memory live response, not historical chat results.
- [ ] Test error behavior on desktop/mobile. Review external image-OCR cost controls and abuse monitoring before exposing it broadly.

## Remaining AI Universe work
Native scanned-PDF OCR or a dedicated bounded OCR worker, embedding/semantic search with proper owner isolation and indexed PostgreSQL queries, validated PDF page citations, persistent evidence metadata, separate per-studio entitlements and provider policies, rate controls/quotas, and full staging-to-production validation. AI Video remains completely outside this PR.
