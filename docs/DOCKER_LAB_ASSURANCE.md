# Docker offline recovery drills, signed evidence and local preflight

This milestone follows incident containment PR #430. All drills use disposable local directories with the existing recovery journal and Docker safety validator. No actual Docker command, cloud request or background task is performed.

## Eleven improvements

1. Eleven behavioral drills exercising the real journal/guard implementations, not fabricated UI numbers.
2. A duplicate claim can never be reserved a second time.
3. Reserved-but-unattempted crashes remain unresolved.
4. Attempted-but-unreported crashes remain unresolved, never successful.
5. Guard-denied means no container mutation was attempted.
6. Completed and failed operations without a receipt remain attention-required.
7. Receipt acknowledgements are terminal and do not permit rewriting outcomes.
8. Exclusive per-agent lock and malformed journal detection.
9. Sandbox guard rejection for privileged, networked, mounted or mismatched test targets.
10. Ed25519 signing plus pinned-key verification of offline reports, including negative tamper tests.
11. Read-only local environment/key preflight, npm scripts, and real subprocess integration tests.

## Run the synthetic drill

    npm run docker:lab:drill

The output is a strict report with eleven scenario results, a timestamp and explicit flags saying executionAuthorized=false and actualDockerContacted=false. A red case means the actual journal/guard behavior did not match expectations. The command exits nonzero if any scenario fails.

## Sign and verify the report

Use a local operator-owned Ed25519 private key, mode 0600 on POSIX. Save evidence in a private location:

    node scripts/docker-lab-assurance.mjs drill --sign-key /ABS/AGENT-PRIVATE.pem > /ABS/DRILL-EVIDENCE.json
    node scripts/docker-lab-assurance.mjs verify /ABS/DRILL-EVIDENCE.json /ABS/PINNED-AGENT-PUBLIC.key

Verification requires an independently trusted public key; never accept a public key from the untrusted report itself. A valid signature proves the reporting key signed these exact offline results. It does not independently establish that a test was run, that the operator controlled a real Docker host, or that an operation was safely executed.

## Conservative preflight

    npm run docker:lab:preflight
    node scripts/docker-lab-assurance.mjs preflight --agent-key /ABS/AGENT-PRIVATE.pem --server-key /ABS/PINNED-SERVER-PUBLIC.key

The preflight examines the local runtime, potentially dangerous Docker environment overrides, explicit local execution flag values and optional key-file syntax and permissions. Missing optional keys are reported not_checked rather than success. It cannot verify remote server opt-in flags, RLS, firewall, database migrations, current Docker context, or host ownership. No preflight result authorizes Docker execution.

## Staging acceptance, separately required

Run full CI, the offline drill, and signature verification. Then separately test actual restricted disposable Docker lab containers, agent enrollment, signed heartbeat freshness, incident escalation and hold release, owner A/B RLS, replay protection, single-use permits, and crash-recovery receipts on a staging deployment. Preserve private operator journals and review unknown outcomes manually. Keep all remote execution flags disabled for shared production customer infrastructure.

No Supabase migrations, Edge Functions, production deployment, paid GPU, external AI API or customer Docker credentials are changed by this PR.
