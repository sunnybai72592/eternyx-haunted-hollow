# Docker staging release source parity and evidence binding

This PR follows merged #482. It consolidates the repository Docker security audit, the optional read-only hosted staging authentication probe, and the signed operator-review statement into **one offline review workflow**. Nothing here automatically deploys Supabase functions, turns on Docker access, verifies an actual remote binary, or visits production.

## Eleven improvements

1. Capture a deterministic source SHA-256 for **13 security-relevant Docker files**, including Supabase JWT configuration, owner authorization, Ed25519 dispatch, host agent, staging probe and evidence verifier.
2. Require a full 40-character Git commit SHA, with all required files present; reject a checkout that fails the existing repository release audit.
3. Create a single domain-separated release snapshot fingerprint; require the operator to independently pin that fingerprint instead of trusting a replacement JSON file.
4. Compare every file in the current checkout to the exact pinned baseline and reject code/configuration drift.
5. Bind the separately Ed25519-signed operator staging statement to the same Git commit SHA.
6. Require every one of the ten operator checks to be asserted passed and signed by the independently trusted operator key.
7. Validate the read-only hosted staging probe's exact ten check IDs, ordered positive outcomes, false execution flags and restrictive schema.
8. Bind the three real owner-authentication findings in the signed statement to the **SHA-256 of the same raw hosted probe evidence file**.
9. Bind seven additional operator security checks to seven private local evidence files, verifying exact raw SHA-256 bytes against the signed statement.
10. Reject stale/future observations, mismatched staging vs production hosts, wrong operator keys, wrong commit, tampered files, symlinks and unsafe evidence permissions.
11. Supply an offline CLI and real subprocess tests; no success result can ever mark deployed source parity or live Docker execution independently verified.

## Step 1: create a source release snapshot

From a trusted checkout of the exact source commit reviewed for staging, run:

    node scripts/docker-staging-parity.mjs snapshot FULL_40_CHARACTER_COMMIT_SHA > /ABS/operator-release-snapshot.json

The command runs the repository's existing Docker security audit before fingerprinting and never queries GitHub or Supabase. Verify that the checkout matches the provided Git commit using your separately trusted source-control process. **Store the returned `sourceSnapshotSha256` outside the checkout as an independent pinned value.** A snapshot stored with untrusted source changes is not a trusted baseline.

## Step 2: collect independent staging evidence

Run the operator-controlled read-only hosted authentication probe introduced in #482 on an explicitly verified isolated staging project. Never use production project credentials, customer accounts or service-role keys. Save its sanitized output to `/ABS/staging-auth.json` with owner-only permissions.

The operator-signed statement uses all ten fixed check IDs from `src/lib/dockerStagingEvidence.mjs`. Set the `evidenceSha256` for `real_owner_jwt_authenticated`, `anonymous_owner_rejected` and `cross_owner_access_denied` to the **raw file SHA-256** of staging-auth.json. The remaining seven checks need separately reviewed, private local JSON evidence files in a directory named by each exact check ID (for example `nonce_replay_denied.json`), each matching its signed SHA-256.

Record actual checks and artifacts; never set status passed merely to satisfy this validator. The probe itself cannot verify every RLS policy or the physical host. Avoid storing private keys, session tokens, full Docker inspect dumps or customer data in evidence files. If real staging checks have not been performed, keep them `not_run` and do not proceed.

## Step 3: sign with an operator-owned key

Use the existing `scripts/docker-staging-release-gate.mjs sign` command to sign the completed statement with an Ed25519 operator private key. The statement commit SHA must be identical to the source snapshot, and its observation timestamp must be within ten minutes of the hosted authentication report.

## Step 4: offline review (never deploys or authorizes execution)

Set the following local environment variables after verifying all values independently:

- `ETERNYX_DOCKER_STAGING_PARITY_REVIEW=true` — explicit opt-in for the offline review only
- `ETERNYX_DOCKER_PINNED_SOURCE_SNAPSHOT_SHA256` — independent trusted release snapshot digest
- `ETERNYX_DOCKER_STAGING_PINNED_HOST` — actual reviewed staging `*.supabase.co` host
- `ETERNYX_DOCKER_PRODUCTION_HOST` — independently known, different production host

Then run:

    node scripts/docker-staging-parity.mjs review /ABS/operator-release-snapshot.json /ABS/operator-signed-statement.json /ABS/pinned-operator.pub /ABS/staging-auth.json /ABS/private-artifact-dir

The operator public key is a canonical 32-byte raw Ed25519 key encoded as 43 Base64URL characters and must be independently trusted. All statement and artifact inputs should be locally owned, absolute-path, bounded and protected from group/world access. The CLI never prints secrets or raw evidence.

## Accurate scope

A passing offline result means *the reviewed checkout matches the independently pinned manifest*, the operator signature is valid, the user-provided staging probe has expected shape and recent timestamps, and each provided evidence file's bytes match the operator-signed digest. It **cannot** establish that the hosted probe truly ran, that reported results are honest, that deployed Edge binaries match the checkout, that the actual Docker host is safe, or that production deployment should proceed.

The result always has `actualDeployedSourceParityVerified=false`, `stagingEvidenceIndependentlyVerified=false`, `productionDeploymentAuthorized=false`, `dockerExecutionAuthorized=false`, and `humanSecurityApprovalRequired=true`. Only independent staging review and explicit human authorization can justify any separate infrastructure operation.

No migrations, Edge deployments, network calls, Docker commands, privileged tokens, paid compute or background workers are introduced.
