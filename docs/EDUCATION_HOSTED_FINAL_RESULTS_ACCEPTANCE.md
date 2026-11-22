# ETERNYX Education — real-JWT verified results staging acceptance

**Status: source ready for review. Hosted staging execution is NOT verified. Production is NOT verified and remains unchanged.**

This is a manual, independent follow-up to the repository's local PostgreSQL
Education grading tests and the older 30-case hosted **exam-read-only**
acceptance workflow. Passing PostgreSQL tests proves SQL behavior in disposable
Postgres but **does not prove** real Supabase Auth and PostgREST integration.
This new suite is designed to close that gap for **final grade reads**.

## Scope — 26 independent checks

The runner uses the official Supabase JavaScript client with only the
project's publishable/anon key and two separately authenticated dedicated
staging students. Both Auth identities are independently verified with
`getUser`. It exercises the deployed
`education_student_verified_result(p_attempt_id)` RPC directly and:
- Confirms both students are non-admin and each can read only their own
  **immutable-ledger-backed** final score, with exact expected point totals
  and exactly the five approved receipt fields.
- Confirms each account cannot access the other's final attempts; a fully
  anonymous client cannot access either account's receipt.
- Checks a submitted-but-unreviewed attempt, a still-running attempt,
  and a legacy partially scored attempt belonging to Student A return
  appropriate **pending/in-progress** states with NULL numeric grades
  and NULL final timestamps, never purported official scores.
- Rejects cross-user probes for all three nonfinal attempts and absent IDs.
- Requires direct `education_final_grades` table SELECT to fail with a
  permission error for Student A, Student B and an anonymous client;
  empty rows alone never count as a successful access-denial test.
- Signs out the two staging test accounts, and independently validates
  a sanitized JSON artifact with all **26 fixed, passing case IDs**.

No answer keys, student IDs, emails, access tokens, passwords, raw scores or
project references are written to output or artifacts. Case labels and
pass/fail are the only per-test output. The workflow does **not** call
the grading worker, create attempts, submit exams, mutate education tables,
upload files, charge subscriptions, or deploy schema. Signing out may
invalidate the temporary Auth sessions; the `writes_performed:false`
evidence field means **no Education fixture writes**, not that the Auth
service performed no session updates.

## Mandatory setup before manually running it

1. An authorized operator creates a **separate Supabase staging project**
   and applies the complete reviewed Education schema and coordinated
   scripts through `staging-education-owned-verified-results.sql`.
   The script itself neither creates staging infrastructure nor deploys
   any SQL. Never reuse the known production project or copy customers.
2. Reuse the repository's **protected `rls-staging` GitHub environment**
   with required reviewer, distinct production/staging project refs, exact
   `https://<staging-ref>.supabase.co` endpoint, and a publishable/anon
   key. No service role/secret key is accepted by the client config.
3. Reuse two non-admin, dedicated `rls-...` Auth student accounts; keep
   distinct passwords of at least 12 characters in **environment secrets**,
   not chat messages, logs or repository files.
4. **Pre-provision** five *different*, synthetic staging attempts using
   an independent **authorized staging setup procedure**. The reader will
   never create or modify them:
   - `FINAL_A`: Student A's submitted, **atomically finalized** exam
     with authentic matching ledger and known official score/max score.
   - `FINAL_B`: Student B's own independently finalized exam with
     authentic matching ledger, and a different attempt UUID.
   - `PENDING_A`: Student A's submitted attempt with **no final ledger**
     and no official score (e.g. written answer awaiting instructor review).
   - `RUNNING_A`: Student A's actual in-progress attempt (may need
     planned timing to remain in-progress during verification).
   - `LEGACY_A`: Student A's deliberately synthetic, completed attempt
     with numeric legacy `score/max_score` values but **no final ledger**.
     Do not create such an inconsistent record outside disposable staging.
   No account may use the zero UUID reserved for an absent-attempt probe.
5. Under **GitHub environment variables** (not secrets because these are
   only synthetic staging IDs and expected point counts) define:
   `ETERNYX_EDU_RESULT_FINAL_A_ATTEMPT`,
   `ETERNYX_EDU_RESULT_FINAL_B_ATTEMPT`,
   `ETERNYX_EDU_RESULT_PENDING_A_ATTEMPT`,
   `ETERNYX_EDU_RESULT_RUNNING_A_ATTEMPT`,
   `ETERNYX_EDU_RESULT_LEGACY_A_ATTEMPT`,
   `ETERNYX_EDU_RESULT_A_SCORE`,
   `ETERNYX_EDU_RESULT_A_MAX`,
   `ETERNYX_EDU_RESULT_B_SCORE`,
   `ETERNYX_EDU_RESULT_B_MAX`.
   Points are decimal nonnegative integers; maxima must be positive and
   each score must not exceed its own maximum. Fixture UUIDs are distinct.
6. Under GitHub **Actions**, manually run
   **ETERNYX Education hosted final results read-only acceptance**, check
   `approve_education_final_results_reads`, and pass the trusted reviewer
   of `rls-staging`. This cannot run on PR/push/merge or a schedule.
   The approval token is distinct from approval for the RLS fixture-writing
   workflow and from earlier hosted exam-read-only acceptance.
7. Inspect the exact
   `test-results/education-hosted-final-results.json` acceptance artifact.
   All 26 cases, exact names, no extra private fields, no fixture writes,
   and both sessions signed out are required. An absent or failed run
   remains **NOT VERIFIED**, even if offline source CI passes.

## Safety, costs and release boundary

The runner reuses the earlier audited known-production SHA-256 ref guard,
distinct project references, exact HTTPS hostname, dedicated account names
and public-key role checking. It is non-destructive to Education tables.
Staging hosting and Auth requests may incur ordinary project quotas or
charges if you choose to provision hosting separately; this PR itself
does not start cloud services or use GPUs/third-party AI.

A successful run verifies **only these specific staging read-access and
result-integrity cases at that moment**. It does not prove authenticated
write denial, trusted worker scheduling, cross-region consistency,
production RLS, the frontend deployment, email delivery, subscriptions
or backup recovery. Those require independent approved checks.
Keep all production Education feature flags OFF until the complete
release gates and reviewed rollout have passed.
