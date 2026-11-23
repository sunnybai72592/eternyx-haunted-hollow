# Docker hosted staging owner-authentication probe (read-only)

This milestone follows merged PR #474. The prior PR introduced explicit per-function JWT policy and offline operator attestation. This PR adds an **optional LIVE staging probe** that tests actual `docker-control` and `docker-enrollment` endpoints. It never sends any command other than `{ "action": "list" }`. The normal GitHub CI tests a fake HTTP transport and does NOT contact a real Supabase project.

## Ten connected verification checks

1. Reject non-HTTPS, unpinned, unexpected-path, local, redirectable and production-matching staging hosts.
2. Require a Supabase **publishable** key and two distinct staging user access JWTs, with no secret/service_role key.
3. Require two pre-existing, separately owned staging workspace records as positive row-level isolation fixtures.
4. Verify missing JWT cannot list Docker Control information.
5. Verify deliberately invalid JWT cannot list Docker Control information.
6. Verify both test users can each perform read-only Docker Control list actions and the responses are bounded and non-cacheable.
7. Verify missing and invalid JWT cannot list Docker Enrollment workspaces and agents.
8. Verify both test users can list Docker Enrollment and find **only their own pre-seeded workspace ID**, never the other owner's record.
9. Detect overlap between returned agent, request, incident, incident-event, workspace and heartbeat ownership IDs.
10. Reject unsafe/invalid/oversized/redirected responses, missing server provenance, false execution claims, and network outages without printing credentials or marking deployment approved.

## Operator-controlled setup

Provision an isolated staging Supabase project (NOT production) with both read-only Docker Edge routes deployed using the repository's declared `verify_jwt=true` settings. Create two separate staging test accounts and one workspace owned by each account using an independent authorized setup process. Do not use personal or customer accounts. Record their two workspace UUIDs securely for the probe. Obtain two short-lived staging user JWTs with the publishable API key; no service-role key should enter the probe environment.

Set these environment variables privately on the operator's machine:

- `ETERNYX_DOCKER_STAGING_URL`: `https://STAGING_PROJECT_REF.supabase.co` (bare project origin)
- `ETERNYX_DOCKER_STAGING_PINNED_HOST`: the same hostname, verified independently
- `ETERNYX_DOCKER_PRODUCTION_HOST`: the actual production project hostname, MUST be different
- `ETERNYX_DOCKER_STAGING_PUBLISHABLE_KEY`: publishable `sb_publishable_...` key from staging
- `ETERNYX_DOCKER_STAGING_OWNER_A_JWT` / `ETERNYX_DOCKER_STAGING_OWNER_B_JWT`: separate staging user access JWTs
- `ETERNYX_DOCKER_STAGING_OWNER_A_WORKSPACE` / `ETERNYX_DOCKER_STAGING_OWNER_B_WORKSPACE`: separate pre-seeded workspace UUIDs

Do not paste the credentials into chat, issues, PRs, CI variables or command arguments. This tool does not save them, print them, upload response bodies, or generate bearer-token URLs.

## Dry-run configuration validation

    node scripts/docker-hosted-auth-probe.mjs --check-config

This validates the staging/production host pin and credential formats. It makes **no network calls**.

## Explicit real staging probe

After independently verifying that the pinned host really is a dedicated staging project, deliberately opt in:

    ETERNYX_DOCKER_STAGING_PROBE_ENABLED=true node scripts/docker-hosted-auth-probe.mjs --run

The probe sends eight sequential HTTPS requests to two fixed paths with redirects disabled, a strict timeout and bounded response bodies; then it performs two local account-isolation comparisons. Any unexpected 200 for an unauthenticated caller, failed JWT, overlap, missing positive fixture, invalid response or transport error exits nonzero. Output contains check names, sanitized pass/fail, target staging hostname, and always false deployment/host-execution authorization flags.

Successful positive fixture observations are evidence of the tested staging paths, **not a comprehensive RLS audit**. The project may have other private tables and functions. No test grants production deployment approval or independently attests any Docker Engine.

## Link results to the existing operator-signed staging review

Store sanitized JSON output in private operator evidence storage; compute its SHA-256 digest and reference it only for the corresponding authentication, anonymous-rejection and account-isolation check entries in `docs/examples/docker-staging-evidence-template.json`. Independently validate the staging host and evidence before signing. The other checks (agent crypto, replay, permit, host/network isolation, execution flags) still require separate real staging/manual verification.

## CI and remaining limitations

The path-scoped `.github/workflows/docker-hosted-auth-probe.yml` runs only deterministic simulated-response tests (no staging credentials, no `--run`, no outbound staging calls). The live runner is exclusively operator-initiated. These probes do not test a real Docker host, cannot ensure production host values are truthful if the operator supplies false pins, and do not deploy Edge functions or migrate databases.