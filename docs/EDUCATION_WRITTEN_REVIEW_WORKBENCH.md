# ETERNYX Education — instructor written-answer review workbench

**Status: frontend-only upgrade; NOT DEPLOYED.** This change does not enable, publish, deploy or alter a Supabase RPC, database migration, RLS policy, production feature flag, automatic grader or instructor role.

## Purpose and real workflow

This improves the existing **Verified instructor workspace → Written response reviews** panel that reads `education_instructor_written_review_queue` and writes provisional review marks through `education_instructor_review_written_answer`, both already gated by `VITE_EDUCATION_WRITTEN_REVIEW_RPC` and established instructor authorization. The server still performs the decisive **server-side** authorization, permission checks, grade immutability and finalization.

The authorized queue currently returns **up to 100 responses**. The UI provides truthful counts for those **returned records only** and explicitly discloses when the 100-response limit is reached. It does not present that partial queue as a complete historical backlog.

### Daily instructor features

1. **Search authorized written responses** by the returned assessment title, question wording or student answer. Search is local to rows already supplied by the authorized RPC; it does not issue a new search call, record analytics or query other students.
2. Filter pending, reviewed or all. A reviewed response receiving **zero points** is counted as reviewed, not incorrectly left pending.
3. **Filter by real assessment** using the returned test IDs and titles, not guessed categories.
4. Sort by **server-returned order**, **assessment/question** or **recently reviewed first** using actual `reviewed_at` timestamps.
5. Show exactly how many responses match and how many pending responses remain in the current view. Counts are never fabricated as total course submissions.
6. **Refresh reviews** manually and retry failed queue reads. No background polling or extra paid service is added.
7. A reviewed response now shows its **confirmed provisional points and saved review timestamp** when available; unrecorded timestamps say `Not recorded`.
8. Validate each drafted mark as a **whole integer between zero and the actual question maximum**. Blank, fraction, negative, exponent, leading-zero text or out-of-range values cannot be silently submitted.
9. Disable writes when the mark has not changed. Distinguish a true **unsaved local draft** from an unchanged server-confirmed review.
10. **Discard local mark** for a single response without modifying the server; keep other local drafts intact. Refreshing the authorized queue removes draft input for rows no longer returned or already saved, retaining still-unsaved locally edited values for permitted rows.
11. A deliberate replacement of a previously saved provisional mark still requires explicit confirmation. A **finalized grade is not editable here**.
12. Protect against rapid repeated submissions with a synchronous in-flight guard and account-change generation fencing, preventing an old teacher's pending completion from changing the new account's UI.
13. **Treat successful server confirmation as success** even if a subsequent separate queue refresh fails. In that situation the UI says the review was recorded and offers a refresh, rather than falsely claiming the write failed.
14. Continue exposing server errors and rejected saves as **unconfirmed**; there are no optimistic official marks, client-created grades or certificates.

### Privacy, backend authority and deployment

All queued answer text, provisional marks, filters and unsaved mark drafts remain in the active browser component; nothing is placed in localStorage, sessionStorage, an external API or a third-party model. Changing accounts clears the previous instructor's search, draft and error state **before paint**. Existing saved provisional reviews remain server records, not automatically finalized student scores. This is not a bulk grading or publishing action.

**50 Node regressions** cover real read-only queue operations, filtering/sorting, strict mark validation, zero-point reviews, stale/foreign draft pruning, generation fencing, user-facing UI wiring and server confirmation error boundaries, alongside normal repo tests, build, desktop/mobile browser journeys and GitGuardian checks.

**NOT DEPLOYED** to staging or production by this PR. Protected backend activation remains subject to verified instructor/learner JWT tests, row-level security and release authorization.
