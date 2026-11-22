# ETERNYX Education — Adversarial PostgreSQL acceptance

**Status: repository CI verification only. Production release remains BLOCKED.**

This follow-up to merged PR #344 adds adversarial SQL checks to the same
disposable, network-isolated PostgreSQL 17 container. It does not migrate any
database, update Supabase, turn on feature flags, create paid resources, or
declare the live Education exam pipeline secure.

## Seven extra regression boundaries

1. Anonymous roles cannot execute staged student, instructor, enrollment or
   helper RPCs; authenticated browser roles cannot insert/update protected
   answer-key and grading columns.
2. A second student cannot enumerate the first student's enrolled tests,
   questions, options, attempt rows or answers, nor save/submit their attempt.
3. A student cannot mutate publication state or forge correctness, points or
   attempt scores through SQL, and cannot self-enroll.
4. Submission is idempotent; saved answers cannot be modified after submission
   and the unique completed exam attempt cannot be restarted.
5. Administrator duplicate enrollments are idempotent; unknown users are
   refused; an unstarted enrollment can be revoked and no longer grants access.
6. A second approved instructor can author a private question bank, but another
   instructor cannot open it; a teacher record without admin approval is not
   sufficient to create a draft.
7. Final test state is verified as the fixture owner after role-specific probes,
   detecting accidental mutations from rejected operations.

The workflow runs the baseline `education-db-acceptance.sql` followed by the
new `education-db-adversarial.sql` script against **the exact four staged
Education SQL scripts** and the historical CBT migration. SQL errors fail the
job immediately; the container is removed in an unconditional cleanup step.

## What this does NOT verify

- Real hosted Supabase Auth JWTs, PostgREST endpoints or deployed function
  ownership, grants and schema; the fixture provides synthetic identities.
- Transaction-level concurrency, browser flows, legacy client regressions,
  worker grading and manual review.
- Live production grants, database backups, release/rollback readiness,
  permission advisor findings or safe migration to existing customer data.

Until those live staging tests, deployment reviews and backups have passed,
keep `VITE_CBT_ATOMIC_RPC`, `VITE_EDUCATION_INSTRUCTOR_RPC` and
`VITE_EDUCATION_PUBLICATION_RPC` disabled in production.

### CI verification

Open the PR and require green **Education CBT PostgreSQL Security Acceptance**
alongside regular install, test and build checks. Do not merge on a red or
skipped database-security job. A green synthetic CI result is a **staging
prerequisite**, never a production go-live authorization.
