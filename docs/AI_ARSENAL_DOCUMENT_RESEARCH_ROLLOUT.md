# ETERNYX AI Arsenal — grounded documents and research bridge

## Included
- Document Intelligence local TXT/MD/CSV/JSON/LOG inspection and search remain browser-only; new **explicit opt-in** document analysis and requested-field extraction send prepared text through existing authenticated `eternyx-ai-chat`.
- For large local text documents, select the relevant excerpt before requesting AI. No silent truncation or unattended upload. The prompt plus task guidance must remain within the backend's 4,000-character message limit.
- Research Studio gains an opt-in AI synthesis mode for user-supplied notebook references and excerpts. This is **not live web research**. Sources, publisher names, and claims remain user-entered and unverified; model output is not a verified citation.
- Both actions use the existing `ai.chat` credits/entitlements, return real backend responses only if the chat service is deployed and configured, and save normal chat history. Neither activates dedicated multimodal providers or new per-studio billing.
- The existing chat/document retrieval code now evaluates bounded document chunks against query terms rather than just selecting the first five. This is **lexical relevance only**, not pgvector/embeddings/semantic RAG, and the source document's existing owner check remains unchanged.
- No AI Video code, model registration, secret keys, SQL migrations, automatic source fetching or code execution.

## Staging acceptance (required before production promotion)
1. Confirm that `eternyx-ai-chat`, `process-document`, and credit/entitlement RPCs are deployed; never paste provider keys into source or issue comments.
2. Test small sample TXT document: AI summary, field extraction, returned non-mock text, one credit operation per successful click, and saved chat session.
3. Test document larger than allowed request; confirm refusal before API call, then select a short excerpt, explicitly approve AI submission, and verify returned text matches only submitted source.
4. Test research synthesis with two contradictory **manually entered** references; verify warnings that no URL was fetched or verified. With a notebook above budget, verify rejection without silent omission.
5. Test unknown session, insufficient credits, disabled entitlement and offline provider, and confirm no automatic retry.
6. Test editing any inputs while AI is pending; the old result must not display after edits. A submitted request may still spend credits.
7. Review response accuracy and security boundaries; run desktop/mobile acceptance.
8. Audit lexical retrieval on known multi-chunk docs; confirm no irrelevant fallback and that the 200-chunk cap is explicitly documented.
9. Use these as an intermediate milestone only. Proper PDF parsing, OCR, embeddings/vector similarity, external research fetching with security protections, dedicated studio feature billing, and full provider gateways remain future work.
