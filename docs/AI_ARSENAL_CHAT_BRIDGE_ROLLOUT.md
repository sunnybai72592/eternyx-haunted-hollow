# ETERNYX AI Arsenal — Writing/Coding Chat Bridge (Phase 1)

## Scope delivered in this PR
- Four real AI Writing flows: drafting, rewriting, summarization, translation.
- Two real AI Coding flows: explanation and review of user-supplied source text.
- Shared, bounded chat-request builder and single authenticated client adapter.
- Shared UI hook with single-flight guard and stale-output invalidation.
- Clear per-click provider/credit disclosure, human-readable errors, copyable responses and regression tests.
- AI Arsenal directory describes Writing/Coding as **opt-in through AI Chat**, not as independently enabled AI providers.

## Deliberate constraints
1. This is a reuse of the existing `eternyx-ai-chat` Edge Function and its server-side Groq configuration. **It does not deploy a new inference service** and does not turn on any disabled model in `AI_PROVIDERS` or `AI_GENERATION_PROVIDERS`.
2. All requests are made only when a signed-in user clicks the respective AI action. The source and task instructions are transmitted to the configured chat provider and stored in the account's normal chat session/history; do not submit secrets or unauthorized proprietary source.
3. The backend currently enforces a maximum of **4,000 total message characters**, including our task instructions. The bridge rejects oversized prompts rather than silently truncating them.
4. These requests consume **`ai.chat` entitlement and credits**, NOT the future `ai.writing.*` or `ai.coding.*` feature entitlements. Those dedicated per-feature limits and billing remain future work.
5. No automatic retry, code execution, repository write, autonomous action, or paid background job is introduced. Editing a local input during an in-flight request hides the now-stale result, but **cannot cancel that request or prevent credit consumption**.
6. Outputs are model-generated suggestions, not validated code or factual guarantees.
7. No AI Video implementation is touched.

## Release acceptance checklist
- [ ] Merge only after CI build and tests pass; check unrelated baseline failures explicitly.
- [ ] Verify existing `eternyx-ai-chat` and credit RPC deployments and `GROQ_API_KEY` configuration on staging (do not paste keys into GitHub or the browser).
- [ ] Sign in with a **consenting staging account** with known chat-credit balance and permitted non-sensitive test content.
- [ ] Run Writing draft, rewrite, summarize, translate, and Coding review/explain; verify returned text is genuine, no mock text.
- [ ] Verify exactly one chat credit transaction/request on successful generation and a saved conversation. Check the credit balance on failed/uncertain requests without automatically retrying.
- [ ] Test no-entitlement, insufficient-credits, expired-session, and provider-offline errors. Long source must fail locally before invoking the backend.
- [ ] Edit input during an in-flight request; confirm stale output is suppressed without claiming the job was cancelled.
- [ ] Repeat on narrow/mobile and desktop browsers; check accessible errors, focus, and copy.
- [ ] Do not describe this bridge as a completed multimodal AI Universe or dedicated per-feature engine.

## Subsequent AI Arsenal milestones
A dedicated model gateway with server-side feature-key entitlements, safer credit reconciliation, PDF parsing/RAG corrections, multimodal providers, agent approval scopes, and staging deployment evidence remain separate work.
