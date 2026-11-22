# ETERNYX Education — CBT security release gate

**Status: BLOCKED pending live database authorization and backend workflow verification.**

This document concerns the Education CBT system, not subscriptions or unrelated ETERNYX tools. A repository-only finding is not evidence that the same configuration is deployed. A live read-only Supabase inspection attempted on November 22, 2026 timed out, so production policy/grant status **could not be confirmed**. No production changes were made.

## Findings from the repository

- The historical CBT migration `supabase/migrations/20251221200912_d6870136-afdc-4c62-bd71-adb4bd852f76.sql` grants an options SELECT policy for all active tests. Its `public.options.is_correct` column holds the answer key. Student React code requesting only `id, option_text` does **not** prevent a direct REST client from retrieving `is_correct` when table/column grants permit it.
- Existing `user_answers` insert/update access is not column-restricted by the historical migration. RLS row checks by themselves do not prevent a student-controlled client from writing `is_correct` or `points_awarded`.
- Similarly, attempt INSERT/UPDATE privileges must exclude student-controlled `score`, `max_score`, protected timestamps and status transitions. A client-only ownership filter is not authorization.
- Exam submission currently writes answers and attempts in multiple browser requests. This is **not atomic**; server-enforced timing, idempotent finalization and grading invocation need a trusted transaction/RPC.
- Short-answer manual review is not implemented as a trusted workflow. Never call an unreviewed essay incorrect or assign it invented points.
- The trusted `grade-test` and `auto-submit-tests` functions are authorized by the project's **server-only secret API key** sent via `apikey`. Do not make these public or pass secret keys to browsers.
- A configured scheduler for the grading/expiry worker was not verified. A queued or submitted attempt is not evidence that grading will run automatically.

## What this PR improves

The pure grading planner counts *all* questions in the maximum possible score, validates that each selected answer belongs to its question, ignores client-provided grading flags, and leaves genuine written answers pending review. The Edge Function preserves a recorded `submitted` or `auto_submitted` status and its original completion timestamp. The trusted worker retries ungraded submitted attempts, including manual submissions, and distinguishes processed scores from pending manual reviews or failed grading calls.

These changes are **source only** until trusted functions are deployed and exercised in an authorized test environment. They do not fix the historical RLS grants or provide atomic submissions.

## Required security checks before public CBT launch

1. **Read-only inventory:** Run `scripts/sql/read-only-cbt-answer-key-audit.sql` in the authorized project's SQL Editor. It returns only schema/permission metadata; **do not commit its output**, especially from private deployments.
2. **Answer-key isolation:** Ensure a student token cannot SELECT `options.is_correct` directly, including via PostgREST, default grants, alternate views or callable functions. A future tested migration should revoke broad SELECT grants and expose only safe option columns to students, scoped to a valid attempt. Keep instructor answer-key editing behind an independently authorized endpoint.
3. **Grade-column isolation:** Ensure a student cannot INSERT/UPDATE `user_answers.is_correct` or `points_awarded`, or INSERT/UPDATE `user_attempts.score` or `max_score`. Explicit role/column grants and RLS must work together; do not rely on `TO authenticated` alone.
4. **Atomic trusted submission:** Move answer writes, status change and deadline checks to a server-authorized operation; ensure concurrent timeout/manual submissions cannot overwrite or double-submit. The current browser sequence is not an exam-grade transaction.
5. **Teacher authorization:** Verify that only legitimately provisioned instructors can edit test metadata, questions or correct-option flags. Never trust user-editable metadata for roles.
6. **Two-user abuse tests:** In staging, use two student accounts and one instructor account to test cross-user attempts, answer-key probes, forged grading fields, expired submissions, concurrent submissions and short-answer review. Include direct REST tests, not just UI tests.
7. **Grading lifecycle:** Configure and test scheduled or event-based trusted invocation; test retry after partial database writes and manual-submission grading. Deploy both Edge Functions only after staging checks.
8. **Review production policy diffs:** Take a backup and verify dependencies for the separate educator authoring flow before changing table grants. A policy edit can break legitimate features.

**Do not mark Education CBT production-secure until these gates pass.**
