# ETERNYX Education — coordinated CBT security rollout

**State: staging source prepared, NOT DEPLOYED, production release BLOCKED.**

## Why this exists

The historical Education schema permits overly broad browser access to the `options` table and permits writes to sensitive grading columns when broad table grants are in place. The previous exam client also writes answers and the submission status in separate browser requests.

The staging script at `scripts/sql/staging-education-cbt-atomic-security.sql` provides a reviewable, transactional PostgreSQL design to address those paths. It is **not** a migration, must **not** be run automatically, and cannot safely be deployed without a live schema audit and coordinated client change. Attempts to read the connected production SQL metadata on November 22, 2026 timed out; production grants and deployed policies remain unverified.

## What the staged script does

- Revokes browser table-wide access to answer options; re-grants only `id`, `question_id`, and `option_text` on `public.options` for authenticated users, with an active-owned-attempt RLS policy. Trusted grading keeps `is_correct` accessible through its privileged backend client.
- Prevents browser-side inserts/updates of attempts and answers, including client-forged `score`, `max_score`, `is_correct`, `points_awarded` and final statuses.
- Creates authenticated-only `start_cbt_attempt`, `save_cbt_answer`, and `submit_cbt_attempt` RPCs, with `SECURITY DEFINER SET search_path = ''`, explicit `auth.uid()` ownership checks, locked attempt rows, server-side deadline enforcement and question-option pairing.
- Writes response changes while an exam is in progress and finalizes the attempt status in one server transaction per RPC. A final status update is serialized against concurrent answer saves via row locking.
- Returns no answer-key fields or secret credentials to the browser.
- Retains the existing `user_attempts` one-attempt-per-user/test constraint. Legitimate retake policy, password-based test admission, teacher provisioning and enrollment checks are **not** implemented by this script.

## Flagged browser integration

`src/lib/educationCbtRpc.ts` and `src/pages/TestInterface.tsx` include an opt-in integration enabled only when `VITE_CBT_ATOMIC_RPC=true` is set **at build time**. By default the existing exam path stays unchanged. In opted-in mode, the client starts via `start_cbt_attempt`, restores the authenticated account's persisted answers, saves changes through `save_cbt_answer` with a short debounce, and finalizes with `submit_cbt_attempt`.

Never enable the flag without the reviewed matching database RPCs and grants. Never apply the staging SQL while old direct-write clients remain active.

## Release blockers / required staged verification

1. Confirm actual production schema, deployed RLS policies, object ownership and inherited grants using `scripts/sql/read-only-cbt-answer-key-audit.sql`. **Do not assume repository SQL matches production.** Confirm database backups and a rollback plan.
2. **Teacher authoring compatibility:** `CreateTest.tsx` currently performs direct `options.select('*')` and direct question/option writes. The staged revokes intentionally deny those calls, including for logged-in teachers. Build and verify a separately authorized instructor service before deploying permission revocations. Review its role source; user-editable metadata must not authorize an instructor.
3. **No leakage through other API surfaces:** Verify student REST SELECT on `options.is_correct` is denied, including table and column grants, views, functions, inherited roles and PostgREST. Test with a student JWT and a separate instructor JWT.
4. **No forged scores:** Try to INSERT/UPDATE `user_attempts.score`, `max_score`, `end_time` or `status`, or `user_answers.is_correct` and `points_awarded` via REST. All student direct-write attempts must fail.
5. **Server deadline tests:** Verify a saved answer before expiry, rejection after expiry, a refresh resuming the original clock, and an expired response finalizing without accepting late changes.
6. **Two-student authorization tests:** Attempt cross-account start, read, save, submit, and result access with different JWTs. No account may see another account's answers or attempts.
7. **Concurrency and retry:** Race saving an answer against manual submission and worker auto-submission. Only one status transition should succeed; no save after submission. Run duplicate clicks and offline/resume tests.
8. **Exam grading:** Confirm the trusted grading service can still read `is_correct` through its backend role, counts unanswered questions, and leaves written answers pending human review.
9. **Teacher test access / proctoring:** A currently active test is not sufficient proof a student is enrolled or knows an access password; add policy before a high-stakes deployment.
10. **Rollout order:** In a **separate staging project**, deploy approved schema and instructor workflow, set `VITE_CBT_ATOMIC_RPC=true` for the staging web build, run all scenarios above, then coordinate a maintenance-window production rollout that migrates all active clients together. Never activate a permanent fallback that undermines protected permissions.
11. **CI limits:** Node source-contract tests and TS syntax checks do not establish SQL correctness or database security. Require an isolated PostgreSQL integration test using real RLS roles and JWT claims before approving this SQL.

**Production CBT security is not yet certified. No production database or function deployment is included in this PR.**
