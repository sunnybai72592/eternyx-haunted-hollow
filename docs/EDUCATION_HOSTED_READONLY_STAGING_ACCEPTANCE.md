# ETERNYX Education — hosted JWT and PostgREST read-only staging acceptance

**Status: source committed; hosted tests NOT run until manual setup and approval. No production deployment or authorization claim.**

The isolated PostgreSQL tests from Education PRs #344, #348, #350, and
#352 verified SQL behavior with synthetic database roles. They did not use
real Supabase password sign-ins, JWTs, or PostgREST. This milestone adds a
**separate, protected, manually triggered read-only hosted acceptance**.

## Scope: 30 meaningful checks

The test connects to a dedicated nonproduction Supabase project through a
publishable/anon client key, signs in two independent named **staging-only**
students using `signInWithPassword`, verifies each authenticated identity,
then runs real `from(...).select(...)` and read-only `rpc(...)` requests.

The suite checks both users are non-admin and not instructors; confirms
Student A sees an explicitly enrolled published exam and Student B does not;
verifies legitimate question, option, attempt and answer reads, including
known fixture ownership; checks Student B cannot read these; verifies
`options.is_correct` remains **column-privilege denied even for A's own
option**, never accepting zero-row responses as sufficient; verifies the
private enrollment and instructor-grant tables cannot be queried; rejects
student access to the admin review RPC; tests anonymous catalog/attempt/answer
access; and verifies both sessions sign out. The evidence contains only
fixed case names, pass/fail results and conservative release-state booleans.

The test never calls `INSERT`, `UPDATE`, `DELETE`, privileged admin APIs,
DML RPCs, storage uploads, AI providers, billing or deployment commands.
A missing/expired fixture, absent staging schema, unreadable legitimate
owned row, unreachable API, failed login or missing check is **FAIL**,
not a green or skipped verification.

## Required operator setup

1. Use a **separate Supabase staging project** with a different 20-character
   project ref from production. Complete a reviewed coordinated staging
   migration of the historical CBT schema and four staged Education SQL
   scripts in their documented dependency order. **Do not** apply this to
   production or copy live customer records. Staging hosting and Auth usage
   may incur the normal charges/quotas of the chosen plan.
2. Reuse the repository's already established protected GitHub environment
   `rls-staging`, with trusted reviewer approval, exact staging HTTPS URL,
   production and staging refs, and publishable/anon key. The existing
   production-project SHA-256 fingerprint guard remains in force.
3. Create dedicated **non-admin, non-instructor**, password-authenticated
   Student A and Student B staging users, with distinct secure passwords.
   Their emails must satisfy the existing `rls-...` staging-account naming
   gate. Store the login secrets in that environment only, never in this
   chat, committed source, logs or an issue.
4. Using a **separate approved staging setup procedure**, prepare one
   published exam approved by an admin and enrolled only for Student A.
   This test does **not** create or modify that fixture. Student A must
   already have a real `in_progress` attempt with a saved objective
   `selected_option_id`, and the option must belong to the configured
   question, which belongs to the configured exam. Leave enough exam
   duration to complete the read-only checks before it expires. Student B
   must be unenrolled and have no attempts for that exam.
5. Store these **fixture UUIDs as protected environment variables**
   (not public repo-level variables):
   `ETERNYX_EDU_STAGING_TEST_ID`,
   `ETERNYX_EDU_STAGING_QUESTION_ID`,
   `ETERNYX_EDU_STAGING_OPTION_ID`,
   `ETERNYX_EDU_STAGING_ATTEMPT_ID`,
   `ETERNYX_EDU_STAGING_ANSWER_ID`.
   The five UUIDs must be valid and distinct. These names do not encode
   user identities or answer correctness.
6. In GitHub Actions, start **ETERNYX Education hosted read-only staging
   acceptance → Run workflow**, explicitly set
   `approve_education_read_only=true`, then pass the environment
   protection review. The workflow is **manual only**: no automatic
   PR/merge/push, production or scheduled execution.
7. Review `test-results/education-hosted-readonly.json` only after
   the independent verifier confirms **30/30** correct case labels and
   passing results. The report always sets
   `staged_sql_deployed_by_test=false`,
   `writes_performed=false`, `production_tested=false`, and
   `production_certified=false`. Absence of evidence means **unverified**.

The runner requires `ETERNYX_EDU_STAGING_READ_APPROVAL` to have an exact,
separate read-only approval value, and shares the production-ref/hash,
restricted-client-key, URL and dedicated-account validation of the earlier
two-account RLS workflow. Crucially, the existing staging **write** runner
still requires its distinct `I_APPROVE_STAGING_FIXTURE_WRITES` approval.

## Outstanding release gates

This is genuinely hosted **read-only** evidence once manually executed,
but it **does not prove** denial of forged INSERT/UPDATE requests, secure
grading or review, simultaneous live JWT RPC calls, production schema
compatibility, backups/rollback, browsers or worker scheduling. Those
require explicit isolated synthetic fixture **write** approvals in a later
release gate. No deployed production Education feature flag, RLS policy,
user or subscription is modified by adding this source.

Do not enable `VITE_CBT_ATOMIC_RPC`,
`VITE_EDUCATION_INSTRUCTOR_RPC`, or
`VITE_EDUCATION_PUBLICATION_RPC` for production until all separate
staging-to-production review gates pass.
