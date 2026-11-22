# ETERNYX Education — Publication decisions and exam expiry acceptance

**Release status: BLOCKED. CI-only synthetic PostgreSQL 17 coverage, no deployment.**

After the baseline and adversarial acceptance added in PRs #344 and #348, the
Education workflow now runs `tests/sql/education-db-lifecycle-edge-cases.sql`
using the *same disposable database* and exact staged source SQL. This is
deliberately an additional regression gate, not a production migration.

## Ten scenarios checked

1. A PostgreSQL `authenticated` role without an Auth user identity cannot
   enumerate enrolled exams, list drafts, or start an exam.
2. Approved instructors cannot create unsupported, duplicate-ID, wrong-duration,
   multiple-correct, nonboolean-correct or objective-choice-containing essay
   question banks; rejected operations leave no partial drafts.
3. Only the draft owner may request publication. Instructor roles cannot
   approve themselves or review a publication.
4. Trusted admin rejection removes an item from the pending review queue;
   the verified instructor can submit the rejected draft again.
5. Revoking the instructor grant prevents approval of pending requests;
   restoring a verified grant permits deliberate administrator approval.
6. Published tests remain invisible and inaccessible until a trusted
   administrator explicitly enrolls the student.
7. Objective-answer saves reject unknown question IDs, foreign option IDs,
   and forged written responses. Another student cannot save/submit the attempt.
8. The real options save/clear/save sequence works in an ongoing attempt.
9. An expiry simulated **only in synthetic CI data** causes the server to
   auto-submit; repeat saves, submissions or attempt restarts cannot bypass it.
10. Final rows preserve owner isolation, approved publication, correct enrollment,
    retained student answers, and null grades awaiting trusted grading.

## Review gate

Require **Education CBT PostgreSQL Security Acceptance** to pass end-to-end,
alongside normal tests/build. The tests use synthetic `auth.uid()` claim
settings and fixture-owned timestamp changes; these are not possible actions
granted to real learners. Do not treat CI success as proof of deployed
permission safety.

**Still required before enabling Education in production:** an authorized
disposable Supabase staging project, real JWT/PostgREST abuse tests, migration
dependency and schema audit, concurrent transactions, backup/rollback, legacy
client compatibility, grading worker integration, browser tests and security
advisors. Keep all three Education rollout flags disabled in production.

No live users, tables, function privileges, secrets, subscriptions, AI APIs or
paid compute are touched by this PR.
