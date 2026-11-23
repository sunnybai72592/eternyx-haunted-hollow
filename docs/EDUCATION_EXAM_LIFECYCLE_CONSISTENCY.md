# ETERNYX Education — Consistent Exam Lifecycle Across Catalog, Editor, and Results

**Status: source-only; NOT DEPLOYED.** This PR changes no hosted Supabase schema, JWT grant, RLS policy, RPC, grading worker, environment flags, tuition/billing or production deployment.

## Why this is the next Education milestone

The student catalog, private history, CBT editor, server submission recovery and results review are implemented, but each has historically evolved in separate PRs. Several real points of friction existed at the seams:

- The exam editor trusted unvalidated `start_cbt_attempt` and legacy attempt-envelope records (`id`, `status`, `start_time`). A missing/unknown state only surfaced later as an unclear deadline or navigation problem.
- React Query could report saved answers loaded before its `useEffect` had restored those answers into the current editable state. An immediate edit or submission could race with hydration. This matters for real written answers.
- The question list rejected duplicate UUIDs but not repeated `order_index` values, leaving the learner's traversal ambiguous.
- The catalog and history recognize an actual terminal flagged attempt, while some exam-editor branches recognized only submitted and auto-submitted records; the terminal learner couldn't reliably reopen their real result.
- After confirmed submission, only the catalog's owned attempt-list cache was invalidated; the paginated private history might remain stale until its own next fetch.
- A browser with an expired attempt but a failed saved-answer restoration could not finalize that same server attempt, even though the backend submission RPC—not the local answers—is responsible for expiration.

## Changes

1. **Validate every server attempt envelope** on both atomic RPC and older legacy query paths. The returned attempt must contain a valid unique-style UUID, a recognized in-progress/terminal status, and a parseable server-supplied start timestamp. Invalid envelopes fail the existing exam-query error boundary; no fabricated local start time, new grade or certificate is inferred.
2. **Explicit field allowlist:** the editor retains only `id`, `start_time` and `status` in its attempt projection. Additional backend fields (teacher notes, grading columns, secret fields) are not copied into the UI data object.
3. **Protect stable question order:** refuse duplicate or malformed `order_index` values before the client attempts to start or resume the exam. Sparse unique author indices remain accepted.
4. **Hydrate saved answers before paint:** switch the existing restored-answer reconciliation to `useLayoutEffect`, after the owner-scoped save-queue reset. The already built query may be loaded; that alone must not make the exam editable.
5. **Exact owner/attempt restoration gate:** allow atomic answer changes only when the fetch succeeded, the restored answers actually reached the editor, the active save queue exists, and its owner/attempt scope matches the restored scope. An old user's answer cache or old attempt's queue cannot unlock the new one.
6. **Normal submission protection:** do not allow pre-deadline atomic finalization using an unhydrated local answer snapshot. The existing serialized save queue still flushes actual, fully restored changes before the server accepts a submission.
7. **Expired finalization without late writes:** once the original server-derived deadline has passed, the browser may request the existing `submit_cbt_attempt` RPC for that exact attempt even if saved-answer restoration is unavailable. No answer-save request is initiated after the browser knows the deadline elapsed. The server decides ownership, enrollment, final status and whether an expired attempt may be submitted.
8. **Terminal-status parity:** normal submitted, auto-submitted and server-flagged terminal attempts all link to their real results and disable exam editing. A flag is explicitly **not a determination of misconduct or an academic grade**.
9. **Refresh both student views:** successful atomic submit, legacy submit, owner-verified recovery and manual server-status confirmation invalidate the signed-in owner's **catalog attempt list** and **paginated private history**. No other account's cached data is invalidated or searched.
10. **Visible progress:** when the query says saved answers are available but hydration has not completed, the learner sees a brief restoring notice; editing/submission stay blocked until the exact scoped state is ready.
11. **Source isolation and rollout:** only the CBT editor, a pure lifecycle validator, the existing pure question-integrity validator, documentation, and regressions are changed. No automated hosted write or production rollout occurs.

## Honest limitations

This is an **integrated client-side correctness milestone**, not an authenticated end-to-end hosted release. The already existing disposable PostgreSQL 17 exam rehearsal exercises enrollment, server transactions, private written review, grade finalization and ledger-backed results. Separately provisioned live Supabase staging with real JWT accounts is still required before launching protected student CBT into production.

The server-side admission checks, RLS ownership, atomic answer saves, original deadlines, idempotent submission and trusted final grading remain authoritative. No browser guard substitutes for those protections. An expired attempt's unsaved text is **not guaranteed to have reached the server**: finalization without re-sending late answers explicitly preserves that safety boundary. An urgent review of a submission error must use the existing owner-scoped status read rather than assuming the network response proves failure.

**59 new Node regressions** cover actual normalized attempt envelopes, all terminal and malformed statuses, owner/attempt hydration checks, question order integrity, deterministic two-question restore/review/submit projections, deadline/expiry decisions, source wiring across catalog/history/editor/results, and privacy. Existing full CI, build, desktop/mobile browser journeys and GitGuardian are the merge gate.

**NOT DEPLOYED.** Before any production claim, run and approve the already documented hosted two-student real-JWT acceptance, instructor grading tests, backup/rollback planning and protected deployment verification.
