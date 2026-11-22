# Education CBT — resilient autosave, real attempt navigation, instructor review UX

**Status: code changes, no backend migration, NOT DEPLOYED or verified against hosted production.** Existing Education rollout flags retain their current values. No production exam or customer data was read, changed or erased as part of this PR.

## What now works better

**Student exam autosave:** the atomic CBT UI now uses a purpose-built, single-writer queue for a single account and attempt. It keeps only the **latest** edit for each question, serializes overlapping server saves, drains new edits made while a request is in flight, and retains a failed latest edit for retry instead of silently discarding it. An older failed request cannot push an obsolete essay on top of newly typed text. The queue is disposed and pending data cleared on session or attempt changes; there is no localStorage, plaintext file or cross-account persistence.

**Connection and submission recovery:** learners now see explicit **saving / saved / unsaved** state, a retry button when an answer save fails, and a guarded reconnect retry only before the original exam deadline. Confirmed submissions wait on the save queue; if writing cannot be confirmed before the deadline, the normal submission stays available for manual retry. Expired attempts provide a clear **Retry submission** control, without treating a browser clock as trusted server authorization. The real server still enforces enrollment, ownership, final deadlines, answer edits and grading.

**Catalog recovery:** in atomic mode, Education queries the student's **own** attempt summaries (never other users' attempts) before offering an exam action. Fresh exams open normally; in-progress attempts show **Continue assessment**; submitted/auto-submitted attempts navigate straight to their existing results rather than making a doomed new start request. Unknown status, missing ownership, malformed IDs or failed attempt queries **disable the exam action** until verified. After confirmed submission, the account-scoped attempt list is invalidated so returning to Education shows current state. The legacy mode continues unchanged pending full staged rollout.

**Results improvements:** learners can **Check latest result** manually after teacher grading. Only an actual verified final-grade receipt provides the final timestamp. A legacy unverified score is labeled as unverified, never presented as trusted-ledger certified. When the database hides old answer options after submission, the report displays **Selected option recorded**, not a raw option UUID mistaken for answer text. Export remains a downloadable learner report, not a certificate.

**Instructor review:** the written-review workspace now defaults to **pending** responses and offers pending/reviewed/all filters, truthful counts for the returned queue (up to 100), a confirmation before replacing an already recorded provisional mark, and clears stale local mark drafts after successful server review. An instructor mark remains provisional until trusted official finalization.

## Safety and validation

- No new Supabase table, policy, migration, API permission or service-role client introduced.
- No grading, payment, GPU, subscription, production feature flag or hosted staging operation changed.
- **14 async queue regression tests** exercise overlapping writes, out-of-order edits, failures, recovery, multiple questions, teardown and no duplicate saves.
- **23 source and real navigation regression tests** cover auth-scoped attempt routing, safe fail-closed start/resume/result handling, UI save states, retry and review accuracy.
- Standard repository install, build, browser checks and secret checks remain the merge gate.
- Staging atomic CBT, teacher reviews and verified-result RPCs still require the separately approved and already documented hosted acceptance steps. No source-side test substitutes for those real-JWT checks.

**Known limitations:** a forced browser/tab close before a pending save completes cannot guarantee delivery, and the app does not persist private unsent answers across restarts. This is deliberate to avoid leaving exam responses on unprotected devices; the student is told when there are unsaved changes. Failed network writes may still have reached the database; the queue retries the latest known value and relies on the idempotent, owner-scoped server RPC. The backend remains authoritative about every attempt deadline and official result.

This is a practical student and instructor usability milestone, not a claim that ETERNYX Education is already production certified.
