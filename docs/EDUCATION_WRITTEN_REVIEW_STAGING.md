# ETERNYX Education — verified written-response review (staging only)

**State: source and isolated CI only. No production SQL deployment, no official grade release.**

This milestone adds actual instructor-owned review records for submitted
short-answer responses without forging scores or trusting browser-supplied
grading fields. It is source-only until an authorized isolated staging
project has passed real JWT, RLS, staff permission and trust-boundary checks.

## Functional work

- `scripts/sql/staging-education-written-review.sql`: opt-in SQL **after**
  existing staged atomic CBT, instructor grants, authoring and reviewed
  publication scripts. Stores reviewed points in a private
  `education_written_reviews` table with RLS and **zero browser table grants**.
  No public table policies. This is deliberately not an automatic migration.
- `education_instructor_written_review_queue()`: lists at most 100
  submitted, nonblank written responses for the currently **approved owner
  instructor** of approved published exams. Shows question text, response,
  point maximum and any previous review. It does not show student identities
  or answer keys for unrelated tests.
- `education_instructor_review_written_answer(answer_id, points)`:
  checks a fresh `auth.uid()` against the verified instructor grant and
  teacher record, locks the completed attempt then answer, verifies ownership,
  completed status and short-answer question, and restricts whole-number
  points to `0..question.points`. Duplicate identical requests are
  idempotent; intentional corrections can update the provisional review
  record. Revoking instructor approval cuts off access immediately.
- `src/lib/educationWrittenReviewRpc.ts`: flagged client with strict UUID,
  mark, row and server-confirmation validation. **All** of
  `VITE_CBT_ATOMIC_RPC=true`, `VITE_EDUCATION_INSTRUCTOR_RPC=true`,
  `VITE_EDUCATION_PUBLICATION_RPC=true` and
  `VITE_EDUCATION_WRITTEN_REVIEW_RPC=true` are needed in a tested staging
  build. Production defaults remain off.
- `EducationWrittenReviewPanel` inside the existing verified instructor
  studio: review submitted responses, record or correct whole-number points,
  and retry load or save failures. Changing account clears local mark inputs.

## Eleven safety regressions

1. Anonymous users cannot execute review endpoints or read review records.
2. Students cannot read the queue or forge reviews through SQL.
3. Unapproved instructors have no review access.
4. A different approved instructor cannot read/grade another instructor's exam.
5. Only the owner sees the actual completed written response and point limit.
6. Negative, excessive, missing or otherwise invalid marks are rejected.
7. Valid review marks persist with explicit **unfinalized** confirmation.
8. Identical retries do not change review timestamps.
9. Deliberate corrections update the protected review record.
10. Official attempts and user-answer score fields stay **unchanged**.
11. Revoking the instructor approval immediately denies new queue/grade RPCs.

The GitHub Education PostgreSQL security workflow applies the new SQL after
the prior fixture's baseline, cross-account, deadline and real-concurrency
tests, then performs the above review-role checks in the same disposable
**network-disabled PostgreSQL 17** container. No live Supabase API is called.

## Important: official grade finalization is NOT implemented here

The existing trusted `grade-test` worker deliberately leaves any genuine
written answer pending and can run retries. **Do not** copy provisional review
marks into `user_answers.points_awarded` or set
`user_attempts.score/max_score` from the browser. Before public activation,
implement and stage-test one trusted, transactional aggregator that reconciles
completed human review marks with objective answers, remains idempotent under
worker retries and concurrent reviews, and publishes only the verified total.
Until then, the learner result must stay **Grading pending** even if a
reviewer has saved points.

Production is unchanged: no migration applied, no Edge Function deployed,
no subscriptions enabled, no paid compute started, and no customer data used.
Even green CI is not authorization to turn on this feature publicly.
