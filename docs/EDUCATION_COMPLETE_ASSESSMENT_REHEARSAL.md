# ETERNYX Education — integrated full assessment rehearsal

**Status: source only; NOT DEPLOYED to any hosted Supabase project or production.**

After PR #378 added manual real-JWT hosted *read-only* validation gates,
this milestone verifies the **complete exam lifecycle** in one deterministic
integration test on the existing **disposable, network-isolated PostgreSQL 17**
CI database. Unlike tests of isolated RPCs, this creates a fresh synthetic
teacher-authored examination and follows its entire journey.

## The complete 17-stage journey

1. Set up two independent, synthetic learner records in disposable PostgreSQL.
2. A verified instructor creates a full, private bank with a five-point MCQ,
   three-point true/false and two-point written question.
3. The teacher requests but cannot self-approve publication.
4. The student cannot start or discover an unpublished exam.
5. An independent trusted admin approves publication and enrolls Student A.
6. Unenrolled Student B cannot discover or start the approved test.
7. Student A starts exactly one attempt and saves a correct MCQ, incorrect
   true/false and substantive written answer using real authorized RPCs.
8. Student B cannot save, submit or read Student A's attempt, even knowing its UUID.
9. Student A submits; repeat submission is safe and late saves are denied.
10. The trusted service refuses to grade an unreviewed written answer and
    leaves **no partially written marks, score or final-grade ledger**.
11. A separate approved instructor cannot read the owning teacher's queue.
12. The verified owning instructor records exactly **1 of 2** written points.
13. Trusted atomic grading then computes **5 + 0 + 1 = 6/10** and a retry
    returns an immutable finalized grade without overwriting it.
14. The database confirms all three question grade rows, the final attempt
    score and the ledger agree; the written answer remains neutral
    (`is_correct = NULL`) instead of being falsely marked correct/incorrect.
15. Student A receives exactly the five-field, ledger-backed 6/10 result;
    Student B cannot read it; neither student has direct ledger privileges.
16. Instructor attempts to change official reviewed points after finalization
    are rejected.
17. Administrators cannot revoke an enrollment after an exam was started.

## User-facing report correctness

`src/lib/educationResults.mjs` now prints a reviewed written response with
its verified awarded/possible points instead of mislabeling its null
correctness field as `Grading: Pending`. Objective answers can show their
earned points. In-progress, submitted-but-ungraded or invalid points remain
pending in exports; no invented pass mark, certificate or reward is generated.

## Verification

- Run the **Education CBT PostgreSQL Security Acceptance** GitHub workflow.
  The new test executes *after* existing RLS, authoring, publication,
  manual-review, transactional grader, concurrency and verified-read checks.
- The workflow destroys the temporary database even after a failure and
  uses `docker run --network none`.
- New offline Node regressions cover the 17 stages and correct written-answer
  presentation without running any database or requiring external services.

## Honest limitations and next release gates

This is a valuable integrated **SQL rehearsal**, **not** evidence of a real
Supabase Auth JWT being carried through the whole exam lifecycle. Hosted
Education acceptance workflows remain manual and depend on an independently
provisioned, approved staging project with pre-created synthetic accounts and
fixtures. The subsequent real-JWT write-path acceptance needs explicit owner
approval and a separate staging-only mutation guard, plus transactional
cleanup and backup plans.

No real accounts, production SQL, Edge Functions, keys, premium AI services,
billing or new infrastructure are changed by this source PR. All production
Education flags remain OFF pending staging release approval.
