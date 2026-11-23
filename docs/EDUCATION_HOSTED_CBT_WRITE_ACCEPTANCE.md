# ETERNYX Education — real-JWT student attempt write acceptance

**Status: source only — NOT DEPLOYED. No hosted staging write has been executed or approved by creating this PR. Production remains untouched.**

The Education module already has protected enrollment, manual grading, a final-grade ledger, an isolated integrated PostgreSQL journey, and manual hosted **read-only** checks. This PR adds the missing real hosted Supabase Auth *student write-path* acceptance without silently creating accounts or tests.

## Two independently gated execution modes

The GitHub workflow **ETERNYX Education hosted student CBT write acceptance** uses the protected **rls-staging** environment. Only a manual workflow dispatch can launch it.

**Preflight (default):** signs in two synthetic student accounts through real Supabase Auth, independently verifies their identities, checks an approved exam and its questions, verifies Student A is enrolled while Student B is not, confirms neither student has attempted the target exam, tests safe option text and correct-answer column denial, then signs both accounts out. This makes **no Education attempt or answer writes**, although Auth sign-in/sign-out can update session records.

**Write (explicit dual approval):** after rerunning every preflight check, consumes **one fresh synthetic staging exam attempt** through three already-protected, authenticated RPCs: start_cbt_attempt, save_cbt_answer and submit_cbt_attempt. It saves one MCQ option and one fixed synthetic written response, verifies owner-only reads, cross-account save/submit denial, idempotent starts/submission, late-write rejection, no retake and pending review results with NULL grades. This is an **irreversible single-use fixture transition through ordinary student APIs**: the runner does not delete or reset it. Write mode also runs nine direct Data API negative probes against synthetic attempt and answer records, including forged grade fields/status, bogus attempt INSERT, cross-student updates and anonymous update. It rejects constraint failures as proof of permission boundaries and re-reads owner records to ensure no mutation persisted. **These intentional rejected-write tests may mutate synthetic staging data if grants/RLS are broken**, so their isolated staging scope and explicit write approval are mandatory.

Write mode requires selecting **write** rather than the default preflight and explicitly checking **both** workflow approvals: **approve_cbt_attempt_write** and **acknowledge_no_retake**. Separate exact approval tokens are validated inside Node. Merely checking a box without selecting write mode cannot activate writes.

The existing production-project fingerprint, distinct project refs, exact HTTPS staging hostname, public/anon-only key and two dedicated staging-account names/password constraints are reused. No service-role key or admin API is required.

## Prerequisites, in order

1. Provision an **independent, separate Supabase staging project** and apply the reviewed Education scripts, including owned verified-result reads, in a separate authorized change procedure. This PR does not create infrastructure, deploy SQL, import customers, activate flags or change the production environment. Independently audit its current roles, RLS, grants and function owners.

2. Protect the GitHub **rls-staging** environment with a required reviewer and configure the existing HTTPS staging URL, staging/production project references, publishable-key secret and **two pre-created, dedicated non-admin, non-instructor test accounts**. Their credentials belong only in GitHub environment secrets.

3. **Pre-provision** a fresh, published, approved synthetic exam with an active duration of **at least 30 minutes**, an MCQ and a short-answer question. Student A must be enrolled; Student B must not. Neither student may have started this new exam. Do not use production, customer exams or real students. Set no exam access password unless that flow has independently passed authorized staging verification.

4. Configure four protected environment variables with independently inspected, **distinct synthetic UUIDs**: ETERNYX_EDU_WRITE_TEST_ID, ETERNYX_EDU_WRITE_MCQ_ID, ETERNYX_EDU_WRITE_MCQ_OPTION_ID, ETERNYX_EDU_WRITE_ESSAY_ID. The MCQ option must belong to the MCQ question, and both questions must belong to this exam. The checker neither reads answer correctness nor assumes a right/wrong answer.

5. Manually run the workflow from the repository's default branch in **preflight** mode, with both write checkboxes unchecked. The evidence verifier requires all **17** fixed cases, sanitized results and both Auth sessions signed out. No CBT state is created.

6. Only after reviewing a successful preflight and confirming that the new fixture is still fresh, optionally run **write** mode and explicitly check both acknowledgements. The workflow repeats preflight and then runs 29 controlled student write/denial cases, including nine explicit direct-mutation/unchanged-record checks. All **46** cases must pass.

7. The resulting submitted staging attempt remains available for independent teacher review and trusted grading. **Manual cleanup / fixture rotation is required** before another write rehearsal. Do not silently mutate or erase a submitted attempt, marks or accounts to reset the suite. If a run fails or loses network after starting an attempt, a write **may already have committed**; manually inspect staging before retrying.

## Evidence, limitations and costs

The independent report validator rejects partial/fabricated successes, incorrect mode-specific case lists, extra private fields, inaccurate write-attempt claims, missing session cleanup, production-verified claims and unauthorized reports. Artifacts reveal only fixed case labels and pass/fail—not user IDs, UUIDs, emails, passwords, tokens, raw answers, project URLs, key material or scores. A preflight pass **cannot** be used as evidence that hosted writes passed.

This does **not** invoke service-role APIs, production databases, grading workers, payments, billing, GPUs, infrastructure provisioning, privileged table writes or automatic cleanup. It does intentionally send synthetic direct-table mutation attempts that **must be denied** in write mode; failure stops the rehearsal. Staging may have normal Supabase plan quotas or charges when an operator elects to use a project, but committing this PR does not create such a project or initiate hosted calls.

**Production is not verified.** Even a successful write rehearsal tests only this one synthetic student path. Teacher review, trusted grading, end-to-end live frontend, rollback and production migration remain separate controlled release gates. Keep production Education feature flags OFF.
