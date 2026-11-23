# Education: hosted staging release readiness after PR #510

**State: release gate SOURCE PREPARED; real staging acceptance NOT EXECUTED; production launch BLOCKED.**

## Purpose
This is a manual, single-run release rehearsal for the protected backend. It does not create a Supabase project, change RLS/grants, deploy SQL/functions, enable \`VITE_CBT_ATOMIC_RPC\`, or touch production. Existing source-only SQL acceptance and PR #510's 59 CBT lifecycle regressions are prerequisites, **not substitutes for hosted JWT proof**.

The new \`education-hosted-release-readiness.yml\` workflow runs on **workflow_dispatch only**, against GitHub's \`rls-staging\` protected environment. It uses existing hosted staging suites with real student A, student B and approved instructor credentials, not mock identities. All reports are recreated in **one ordered workflow run**. The shared concurrency key serializes these workflows with existing Education hosted checks.

### Safe mode — \`preflight\`
With the read-only approval selected, it executes:
1. Two-account enrollment/RLS/answer-key/private response denial checks against an already existing in-progress synthetic fixture.
2. No-write CBT preflight on a distinct, not-yet-started synthetic exam.
3. Read-only final-grade, pending, in-progress, legacy, cross-user and ledger checks on separate prepared result fixtures.

**A green preflight only proves these read-only checks.** It cannot certify any write path or production readiness.

### One-time mode — \`rehearsal\`
Requires *every* separate opt-in: CBT write/no-retake acknowledgment; instructor review/persistent-mark acknowledgment; trusted final grade/immutable acknowledgment; and the full-rehearsal irreversible-action acknowledgment. It runs the read-only suite first, then:
1. Start, save MCQ + written response, and submit **one fresh synthetic exam**, with cross-account/late-write/idempotency checks and nine direct-table forgery/denial probes. These are destructive **attempts** if staging permissions are broken; the run halts immediately and does not reset evidence.
2. Record **one synthetic instructor's actual written-answer review** on a separately prepared, already submitted attempt.
3. Finalize that **same reviewed attempt** with the staging-only trusted key; verify immutable ledger, idempotency, and owner-only results.
4. Re-verify the finalized attempt via the separate result-reader suite (the result A fixture **must match** the reviewed/finalized attempt and its expected score/max).

The CBT write fixture is **different** from the instructor-review fixture, so this is a coordinated multi-fixture integration rehearsal, **not yet proof of a single newly created attempt passing through all stages automatically**. Never claim otherwise.

### Single fresh-attempt journey — `journey` (new manual opt-in)

The manually dispatched workflow now also supports `journey`. This requires the independent `approve_single_attempt_journey` checkbox **and every rehearsal approval**, including one-time CBT submission, persistent written-answer review and immutable final-grade acceptance. This is staging-only, never a production permission.

Unlike the multi-fixture `rehearsal`, journey mode creates a new synthetic attempt, writes one MCQ plus one fixed written response, verifies direct-table forgery resistance, submits the exam, and passes the **actual attempt ID and written-answer ID** to the instructor-review stage. The finalizer and verified-result stage operate on that same submitted attempt. This tests the complete protected **backend** lifecycle, not the browser UI.

The runner validates the handoff against the preapproved synthetic exam and exact GitHub SHA/run/attempt, passes the IDs only to its child processes, and removes the private local JSON handoff after use or failure. The workflow never uploads it. All existing sanitized evidence and the 31-check live database audit remain mandatory.

**Operator prerequisites:** Student A must be enrolled in a *fresh* synthetic published exam owned by the dedicated approved instructor, with a valid MCQ and written-response question; Student B must be excluded. Expected final score and maximum must be independently reviewed in the protected staging variables. The instructor must own the new exam's review queue. Old read-only, grade-B, pending, running and legacy fixtures must remain available. The review-A/final-A fixtures supplied before the run are validated as existing references and overridden **only in-memory** once the new attempt is submitted. Failed runs can consume the single-use exam: do not reset or silently retry it.

Even a complete `staging_single_attempt_journey_passed` report only confirms one controlled staging backend route. Production remains NO-GO until staging is independently provisioned, actually exercised, reviewed, browser tested, and formally approved.

### Pre-write journey fixture validation (next release protection)

Before `journey` can create an exam attempt, the manually approved GitHub workflow now executes **15 read-only SQL checks** in the independent staging database. It rejects any inconsistency in approved published exam state, verified instructor ownership, exactly one MCQ and one short-answer question, legitimate selected option, question point bounds, fixed synthetic exam score and maximum, Student A/B enrollment, or whether the one-time exam was already attempted. This is particularly important because an invalid irreversible rehearsal cannot safely be reset automatically.

The SQL checks derive the expected MCQ credit using the **server-side correct answer**, comparing only the resulting fixed boolean to the reviewer-approved expected mark. Student clients never receive the answer key. Instructor/student email addresses are read from protected environment secrets, not shown in report output. The SQL performs no writes; only a signed-off isolated staging PostgreSQL connection can execute it.

On success, `test-results/education-journey-fixture-readiness.json` contains only fixed check names, pass status, and the exact GitHub commit/run/attempt. Both the release runner and final release verdict **independently require** this same-run evidence before permitting any stage to mutate. Old reports, a score mismatch, exhausted exam, or a missing instructor grant fail closed. `preflight` and the existing multi-fixture `rehearsal` remain unchanged.

**This code has not been exercised against a real separate staging project.** It cannot create synthetic accounts/exams, provide staging credentials, validate browser UX, or authorize a production deployment. Those are still explicit human-controlled release prerequisites.

### Fail-closed requirements
Use an independently provisioned staging project with deployed, audited Education SQL/RPCs and a recent staging backup. Set the \`rls-staging\` GitHub environment secrets/vars already used by the five existing Education hosted workflows. The staging URL must exactly match its project ref; the ref must differ from production (including the repo's known production fingerprint). All accounts must use the dedicated synthetic \`rls-\` naming convention. Review A attempt must equal result A final attempt; expected grade marks must match. Keep separate in-progress, fresh CBT and finalized-result fixtures.

The runner strips service-role credentials from *every subprocess except trusted finalization*, removes stale evidence first, validates each suite's own independent evidence checker, stops immediately on failure and emits only a sanitized source-SHA/run-bound verdict. A failed/restarted run is **not** reusable proof. The GitHub environment should enforce reviewer approval; synthetic attempts cannot be reset automatically.

### Release decision
\`read_only_preflight_passed\` and \`staging_rehearsal_passed\` both explicitly set \`production_release_approved=false\`. Production stays **NO-GO** until a reviewer separately verifies staging migrations/grants, the actual deployed backend and Edge Function versions, negative student/teacher authorization tests, the complete same-attempt exam/grade UX, CI/browser coverage, recovery/rollback and backup, and approves gradual rollout. Never turn on the CBT flag from this workflow or infer that a green source build establishes backend security.

### Mandatory live metadata evidence in combined verdict

The release orchestrator now **requires** the staging PostgreSQL metadata result from this exact SHA/run/attempt before executing its first hosted student/instructor check. The final summarized report has a `database_metadata_gate` with a pass count; an unverified or stale report cannot be translated into a green release verdict. The SQL audit's database password is supplied only to its GitHub Actions step and is stripped from all child processes. A total of **31** fixed permission/RLS/function/trigger checks are required. This remains a staging-only source gate until it runs against a separately approved backend.
