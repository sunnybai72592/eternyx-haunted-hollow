# Docker isolated staging release review — fail closed

This milestone follows merged PR #468. It does not deploy Supabase functions or modify Docker execution flags. It creates verifiable repository-policy tests and an optional operator-signed evidence review process.

## Improvements in this PR

1. Explicit JWT verification for the Docker enrollment endpoint in supabase/config.toml; Docker control remains JWT-protected.
2. Docker heartbeat and signed dispatch remain JWT-exempt ONLY because both verify enrolled Ed25519 signatures and reject browser Origin.
3. Owner-facing Docker control and enrollment share a strict UUID/non-anonymous owner guard applied after Supabase Auth getUser, preventing client-supplied owner IDs.
4. A deterministic source-level audit rejects missing, malformed or repeated Docker verify_jwt settings and unexpected Docker Edge routes.
5. The audit checks getUser auth, owner-binding, signed heartbeat, dispatch signing key, nonce verification, server-only execution flag, local agent double opt-in and no Docker execution in Edge.
6. Signed staging-evidence schema requires ten fixed security-check IDs with SHA-256 artifact digests; missing, extra, duplicate, malformed or secret-bearing fields are rejected.
7. Optional operator Ed25519 signing authenticates evidence statements; offline verification requires a separately pinned public key.
8. Tampered statements, substituted keys and invalid signatures fail closed.
9. More than 24-hour-old or future-dated evidence is not eligible even for manual review; incomplete security checks are flagged rather than silently passed.
10. Read-only CLI and dedicated CI run genuine offline tests, without credentials, network access, backend mutations or Docker execution.
11. A passing repo audit or signed operator statement ALWAYS keeps productionDeploymentAuthorized=false and requires a separate human security decision.

## Inspect the committed repository

    node scripts/docker-staging-release-gate.mjs inspect

The output confirms only repository configuration and code boundaries. It is NOT proof that Supabase's deployed JWT settings, live authorization, service-role project secrets or actual host firewall match this repository.

## Gather real staging evidence before any live lab enablement

On an independently controlled, isolated staging deployment, a responsible operator must perform ten real checks: authenticated owner JWT, anonymous rejection, cross-owner isolation, Ed25519 agent authentication and revocation, nonce replay denial, permit expiry, receipt conflicts, incident hold/no automatic re-enable, physical Docker host/socket isolation, and confirmation production execution flags remain OFF.

Store the results in private evidence files and compute their SHA-256 digests. Fill the provided docs/examples/docker-staging-evidence-template.json with the real staging commit SHA, fresh observedAt, and each actual check status plus its artifact digest. The example deliberately starts with all checks not_run and a stale timestamp.

To sign a reviewed statement with an operator-owned Ed25519 private key (0600 on Linux/macOS):

    node scripts/docker-staging-release-gate.mjs sign /ABS/operator-statement.json /ABS/operator-private.pem > /ABS/operator-attestation.json

On the reviewing machine with a public key pinned from a separately verified source:

    node scripts/docker-staging-release-gate.mjs verify /ABS/operator-attestation.json /ABS/independently-pinned-operator.pub

The public key file contains a canonical 43-character Base64URL encoding of the raw 32-byte Ed25519 key. Use no production secrets, bearer tokens or private logs in the statement. Signing confirms the operator signed the statement, NOT that the check was truthfully performed, nor that Docker host access is safe.

A result of operator_attested_review_candidate means all ten statuses were asserted passed and the statement is fresh. It is not independently verified staging evidence, and never automatically authorizes deployment or execution. Manually compare each referenced artifact digest with real evidence, confirm environment identity, complete security and business approval, and separately decide whether isolated lab flags may be enabled.

## Remaining unverified integration

No actual staging Supabase URL or credentials were provided, so live JWT acceptance, real RLS deployment parity, firewall isolation and operator hardware control have NOT been tested here. This PR must not claim that production is ready. Keep DOCKER_REMOTE_LAB_ENABLED and ETERNYX_REMOTE_LAB_ENABLED unset in shared production.

CI runs node --test tests/docker-staging-release-gate.test.mjs and the repo audit, in addition to existing full build, Ed25519, HTTP/Postgres and GitGuardian checks.