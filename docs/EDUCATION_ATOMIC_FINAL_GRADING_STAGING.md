# ETERNYX Education — atomic trusted CBT final grading (staging only)

**Deployment: BLOCKED. This is source and disposable CI acceptance only. No production changes.**

Previous Education milestones added enrolled-only exam admission, separate
database-role and real-JWT staging guards, instructor-controlled private
drafts and publication, and provisional short-answer review marks. The
original `grade-test` Edge Function persists each answer and attempt grade
in **separate** REST requests, leaving a partial-write window. Its
legacy pure planner also does not consume reviewed essay marks.

This milestone adds a single PostgreSQL transaction in
`scripts/sql/staging-education-atomic-final-grading.sql`, after the
review SQL: a service-role-only
`education_finalize_cbt_grade(p_attempt_id uuid)` RPC that locks the
submitted attempt, checks publication and enrollment, validates every
question and answer, evaluates objective answer keys privately and includes
only **verified, stored written reviews**. It updates submitted answers and
the official attempt score, then creates a private immutable result ledger
**in the same database transaction**.

## Security and correctness contract

1. `anon` and `authenticated` roles cannot execute the finalizing RPC.
   `service_role` can call it, but even that role has no direct grant
   to the finalized-grade ledger. The finalization table has RLS enabled
   and no browser-facing policies.
2. Attempts must already be completed (`submitted` or
   `auto_submitted` with `end_time`), in an approved published exam,
   with the learner explicitly enrolled.
3. Questions must be valid and worth 1–1,000 points each; totals count
   **all** questions, even unanswered ones. Invalid or cross-exam
   responses, fabricated written text on objective questions and
   mismatched objective choices cause an error.
4. Nonblank written responses require valid marks from an instructor
   whose trusted grant and teacher ownership are **still active** at
   finalization time. Empty/missing written responses award zero.
5. If one written response is unreviewed or its reviewer was revoked,
   the RPC returns `pending_review`, no score and the number awaiting
   review. **Nothing is graded or changed in any table.**
6. Valid objective and reviewed-written marks are combined into the
   official total, with answered question grades and final attempt score
   written atomically. Correctness is never fabricated for written
   responses (`is_correct=NULL`).
7. A second finalization returns `already_finalized` with unchanged
   score and timestamps. An attempt row lock serializes simultaneous
   trusted calls, and the finalized-grade ledger is unique per attempt.
8. A verified instructor may edit provisional marks **only before**
   finalization; a trigger rejects inserts/updates/deletes of reviews
   after that student's final grade is committed. Both the instructor
   RPC and finalizer use the same attempt lock.
9. Existing legacy partial grades (non-null `score` or `max_score`
   but no ledger) are rejected. They must be separately reconciled in
   staging, rather than silently overwritten.

## Server integration

The existing `grade-test` trusted Edge Function preserves its normal
trusted secret-header validation. When, and **only when**,
`EDUCATION_TRUSTED_FINAL_GRADING=true` is configured **server-side**,
it calls the new privileged RPC instead of its previous per-answer
updates. It validates the finalizer's response before reporting
`finalized`, `already_finalized` or `pending_review`. The worker
can leave pending written attempts for retries until reviewed. The
toggle must **not** be configured by a frontend `VITE_*` variable.

Until staging verifies the coordinated Edge Function and SQL rollout,
the new path remains disabled. The old separate-write path is
unmodified, meaning **the production grading system is not thereby
certified secure or atomic.**

## Isolated CI acceptance

GitHub's existing disposable, network-disabled PostgreSQL 17 workflow
applies the exact four original staged Education scripts, runs student,
authorization, publication, timing, race and written-review regressions,
then applies the new finalizer. Its additional checks assert:

- Server-only execute grants, private ledger and student denial.
- Revoked reviewers result in pending review without partial updates.
- Null/nonexistent/in-progress attempts are rejected.
- Forged cross-exam choices and objective prose are rejected.
- Existing legacy grade values are not overwritten.
- Authorized reviewer renewal allows accurate **7/10** marks on a
  mixed objective/written three-question exam.
- Objective-only auto-submitted exams finalize accurately.
- Repeated finalization leaves exact scores and audit timestamps intact.
- After finalization, instructor corrections and browser ledger updates
  are denied.

A further concurrency gate should verify competing requests against
one real temporary database rather than sequential simulations.
No hosted staging RPC has been executed by creating this PR.

## Remaining deployment blockers

Provision and review a distinct staging Supabase project; run its
real-JWT/PostgREST audit; inspect the actual schema, function owners,
grants, triggers and public functions; obtain backup and rollback plans;
verify trusted `grade-test` and `auto-submit-tests` deployment and
scheduler; check old partially graded attempts and pending manual
reviews; test full browser/teacher paths and the production policy
migration window. Do not enable the new service flag or Education
frontend flags in production until the complete staging acceptance passes.

No production database, Edge Functions, auth users, subscriptions,
billing, GPUs or paid infrastructure are touched by this PR.
