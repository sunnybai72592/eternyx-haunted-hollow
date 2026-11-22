# ETERNYX Education — verified learner results (staging only)

**Status: implementation and isolated database acceptance only; NOT DEPLOYED. Production release remains blocked.**

PR #369 staged the service-only atomic finalizer and official result ledger.
The existing learner results page, however, reads a score directly from
`user_attempts`. An incomplete legacy grading worker might have written
a score before finishing the exam's answer grades, and a browser cannot
distinguish that from a trustworthy completed grade without a separate
server-side confirmation.

## New staged features

- The **read-only**, authenticated
  `public.education_student_verified_result(p_attempt_id uuid)` RPC
  checks `auth.uid()` against the owner of the requested attempt.
  Anonymous accounts, different students and arbitrary UUID probes
  cannot read another result. It returns only five fields:
  `attempt_id`, `grade_status`, `score`, `max_score` and
  `finalized_at`; never correct answers, reviewer metadata or student IDs.
- An official score appears only for a completed submitted/auto-submitted
  exam with a matching immutable `education_final_grades` ledger.
  Missing ledgers return `pending_review` with **NULL** scores even
  when legacy `user_attempts.score` is non-null. In-progress,
  disqualified or invalid exams cannot advertise grades.
- If the official ledger and attempt score disagree, the RPC fails
  closed. It never silently trusts or repairs contradictory records.
- Student results have a new independently gated adapter:
  `VITE_EDUCATION_VERIFIED_RESULTS_RPC=true` requires the previously
  staged CBT, instructor, publication and written-review flags too.
  By default, this new path is disabled.
- In verified mode, the page uses the RPC receipt to determine displayed
  grade totals. Pending or failed verification displays **no grade**.
  Pending results do **not even request** `is_correct` or
  `points_awarded` from `user_answers`; later trusted finalization
  switches the cache key and fetches the completed response breakdown.
  Written answers with graded numeric points display as reviewed,
  without fabricating a correct/incorrect boolean.
- The local text report uses the same verified score projection and
  strips unverified per-answer marks. The download is disabled while
  authoritative verification is in-flight or has failed.
- Student attempt and verified receipt queries use user-specific keys
  and are gated on the currently authenticated account; switching
  users does not authorize access to another account's result.
- Existing production result UX remains on the previous, non-gated
  path until the **coordinated staging rollout is fully approved**.
  This PR does not claim the old production flow is certified.

## Database acceptance

The existing network-isolated temporary PostgreSQL 17 CI workflow
applies the staged result reader after atomic finalization, objective
and essay grade tests, and concurrency tests. Ten additional cases
include no-JWT denial, student A's **7/10** confirmed result,
student B's **1/1** confirmed result, cross-account ID probing,
in-progress grade suppression, ungraded/legacy partial grade
suppression, deliberately corrupted ledger and attempt mismatch
rejection, and unchanged final ledger counts after reads.

The independent Node tests cover the exact opt-in flag,
pending/final projections, report masking, RLS contract,
application data queries, and TypeScript parsing.

## Release blockers

The SQL is in `scripts/sql` and is **not an automatic migration**.
No production SQL, Edge Function, flag, key, or account was changed.
Before activation, provision a distinct approved staging Supabase
project and run real Auth JWT and direct PostgREST read tests,
historical record reconciliation, trusted worker deployment checks,
account-switch/browser tests, role/grant audits, and complete
backups/rollback checks. The finalizer's
`EDUCATION_TRUSTED_FINAL_GRADING` server flag remains disabled.

Supabase hosted staging can have normal service usage charges if
an operator later chooses to provision it; this PR does not create
infrastructure or incur a GPU/API bill.
