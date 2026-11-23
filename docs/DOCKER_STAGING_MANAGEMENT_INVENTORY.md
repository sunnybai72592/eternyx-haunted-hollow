# ETERNYX Docker — actual staging deployment metadata verification

After merged PR #489, the prior offline release checks validate source hashes and operator-signed evidence. This milestone adds **real read-only Supabase Management API inspection** of staging Edge Function deployment metadata.

Supabase's official Management API documents `GET /v1/projects/{ref}/functions` with `edge_functions:read` (fine-grained permission `edge_functions_read`). Response metadata includes function slug, status, version, `verify_jwt`, and sometimes `ezbr_sha256`. See https://supabase.com/docs/reference/api/v1-list-all-functions.

## Eleven connected improvements

1. Hardcode HTTPS Management API origin and GET-only function list endpoint. No user-provided remote URL, HTTP redirect, or production project request.
2. Require independently known 20-character staging and distinct production project refs, a full Git commit SHA, and the pinned source snapshot digest from the previous milestone.
3. Validate a strictly bounded release expectations manifest with four ordered Docker function names and canonical expected JWT settings.
4. Require four explicit deployment version numbers. Invalid zero/unknown versions block review.
5. Require an independently retained SHA-256 digest of the release expectations manifest. Changing expected versions or project identity cannot silently pass.
6. Check **actual deployed** Edge Function ACTIVE status, deployment version and `verify_jwt` against expected values.
7. Refuse duplicate/missing Docker functions and any unreviewed additional `docker-*` function, while ignoring unrelated application functions.
8. If expected function bundle SHA-256 is separately pinned, compare the `ezbr_sha256` value returned by the API. An absent or differing value fails closed. Without a pin, report that bundle digest was not pinned rather than pretending it matched.
9. Use one time-bounded, read-only GET with no-store, disabled redirects, strict JSON media type and size limits; errors, missing metadata and mismatched origins fail closed.
10. Accept least-privilege `edge_functions:read` Management API credentials only from operator environment variables, never PR/CI, command-line args or logs. A running probe requires independent staging/production ref pins and an explicit opt-in flag.
11. Add deterministic security regressions, a standalone CLI, an intentionally incomplete manifest template and a path-scoped offline-only CI workflow.

## Prepare a release expectations manifest

Copy `docs/examples/docker-staging-deployment-expectations.json` to a private operator-controlled directory. It intentionally uses zero versions and invalid all-zero placeholders so **it is not approval-ready**. Fill in the exact independently verified staging and production Supabase project refs, the intended Git commit, and the independently pinned source snapshot SHA-256 from `scripts/docker-staging-parity.mjs`.

Record the expected deployment versions for Docker Control, Enrollment, Heartbeat, and Command Dispatch. They must be based on an independently reviewed staging deployment record. If available, retain independent `ezbr_sha256` bundle digests in the manifest; otherwise use `null` and accept the reduced confidence explicitly.

Store the manifest mode 0600 on POSIX. Then run:

    node scripts/docker-staging-management-inventory.mjs pin /ABS/docker-expected.json

Store the printed `manifestSha256` in a separate trusted release record. A local manifest and its self-generated pin are NOT sufficient proof of approval unless that pin is independently retained and reviewed.

## Optional, operator-initiated live read-only staging query

Obtain a **fine-grained Supabase Management API credential limited to `edge_functions_read`** for the approved staging project. Never use a service-role key or production secret. Do not commit the token, paste it into chat, or put it in workflow secrets for this PR.

Set privately in the operator's environment:

- `ETERNYX_DOCKER_MANAGEMENT_READ_ONLY_ENABLED=true`
- `ETERNYX_DOCKER_STAGING_REF` — independently verified 20-character staging project ref
- `ETERNYX_DOCKER_PRODUCTION_REF` — independently verified and different production project ref
- `ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256` — separately retained release expectations digest
- `ETERNYX_DOCKER_MANAGEMENT_READ_TOKEN` — fine-grained read-only Management API credential

Then run:

    node scripts/docker-staging-management-inventory.mjs inspect /ABS/docker-expected.json

The tool sends exactly **one GET** to the staging project functions endpoint, parses only the four Docker functions, emits sanitized version/JWT/bundle-pin findings, and never outputs the token or full Management API response. On any mismatch the CLI exits nonzero. Save its sanitized result as an independently collected, restricted release-evidence artifact.

## Boundaries

This is a **deployed metadata parity** check, not byte-for-byte proof of deployed function source. Supabase version numbers and JWT settings can match even when the deployed code differs. A pinned management bundle digest improves the metadata comparison, but this CLI does not independently download or hash remote function bodies. It cannot verify physical Docker host identity, actual operation outcomes, secret safety, all project RLS, or staging business approval. It always reports `deployedSourceParityVerified=false`, `productionDeploymentAuthorized=false`, and `stagingDockerExecutionAuthorized=false`.

The dedicated GitHub CI runs only simulated read-only response tests with synthetic records; it does NOT receive a Management API token or call staging. Production deployment and remote Docker execution remain disabled by this PR.
