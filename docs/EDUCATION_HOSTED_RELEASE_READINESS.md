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

### Fail-closed requirements
Use an independently provisioned staging project with deployed, audited Education SQL/RPCs and a recent staging backup. Set the \`rls-staging\` GitHub environment secrets/vars already used by the five existing Education hosted workflows. The staging URL must exactly match its project ref; the ref must differ from production (including the repo's known production fingerprint). All accounts must use the dedicated synthetic \`rls-\` naming convention. Review A attempt must equal result A final attempt; expected grade marks must match. Keep separate in-progress, fresh CBT and finalized-result fixtures.

The runner strips service-role credentials from *every subprocess except trusted finalization*, removes stale evidence first, validates each suite's own independent evidence checker, stops immediately on failure and emits only a sanitized source-SHA/run-bound verdict. A failed/restarted run is **not** reusable proof. The GitHub environment should enforce reviewer approval; synthetic attempts cannot be reset automatically.

### Release decision
\`read_only_preflight_passed\` and \`staging_rehearsal_passed\` both explicitly set \`production_release_approved=false\`. Production stays **NO-GO** until a reviewer separately verifies staging migrations/grants, the actual deployed backend and Edge Function versions, negative student/teacher authorization tests, the complete same-attempt exam/grade UX, CI/browser coverage, recovery/rollback and backup, and approves gradual rollout. Never turn on the CBT flag from this workflow or infer that a green source build establishes backend security.
