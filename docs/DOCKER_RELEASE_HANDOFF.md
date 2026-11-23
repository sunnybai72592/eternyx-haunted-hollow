# ETERNYX Docker: two-party signed release evidence handoff

This milestone follows merged PR #497 and connects the read-only Supabase deployed Edge Function inventory with the earlier source/evidence-parity verification. All steps are offline and require **two separately pinned Ed25519 keys**: one release evidence author and a different reviewer. The protocol never deploys code, changes flags, contacts Docker, or authorizes production.

## Eleven integrated safeguards

1. Validate the existing #489 source/evidence parity report against the same intended Git commit, source snapshot, and staging hostname.
2. Validate the #497 deployed-metadata report against the independently pinned release expectations manifest, including four exact function names, versions and `verify_jwt` flags.
3. Require all four expected bundle SHA-256 digests to be pinned and reported matching by the Management API. Missing reported digests block this higher-assurance handoff.
4. Recompute the Management API metadata digest from the reported function fields; refuse contradictory or fabricated status summaries.
5. Require report timestamps within the one-day evidence window, reject future observations, and refuse reuse after expiration.
6. Bind **exact raw report-file bytes** and manifest-file bytes to the candidate fingerprint, not merely normalized reserialized JSON.
7. Use a domain-separated SHA-256 release candidate digest that binds the staging/production project refs, Git commit, source snapshot, manifest pin, reported function metadata and evidence hashes.
8. Require the evidence author to sign the candidate with Ed25519, verifying the signature before any reviewer countersignature.
9. Require a second independently pinned reviewer Ed25519 key; identical author/reviewer keys are rejected.
10. Make the reviewer countersign the digest and original author signature, preventing signature substitution or independent approval of a different candidate.
11. Add a four-command offline CLI, real subprocess tests, security-negative regressions and dedicated GitHub CI. All outputs retain manual-approval-required and deployment-authorized=false.

## Inputs

The `parity.json` file must be the output of `scripts/docker-staging-parity.mjs review` from the prior milestone, backed by a separately pinned source snapshot and independent operator evidence. The `inventory.json` file must come from the separately authorized staging Management API read-only inspection in `scripts/docker-staging-management-inventory.mjs inspect`. The `manifest.json` is the exact independently reviewed version/JWT/bundle expectations for all four Docker functions. Never substitute sample data or assume the report itself proves it was collected from a real backend.

Every input must be a regular operator-owned private file (mode 0600 recommended), passed using an absolute path. The author and reviewer public key files contain raw 32-byte Ed25519 keys in canonical Base64URL form. Keep private keys in owner-private files; never commit them.

## Explicit offline opt-in and independent project pins

Set these variables in the *operator's local shell*, not GitHub CI secrets:

- `ETERNYX_DOCKER_RELEASE_REVIEW_ENABLED=true`
- `ETERNYX_DOCKER_PINNED_DEPLOY_MANIFEST_SHA256` — SHA-256 pinned separately from the manifest
- `ETERNYX_DOCKER_STAGING_REF` — actual staging project ref (not production)
- `ETERNYX_DOCKER_PRODUCTION_REF` — actual separate production project ref
- `ETERNYX_DOCKER_APPROVED_COMMIT_SHA` — separately approved Git commit SHA

## Four-stage handoff

Prepare a candidate after both earlier independent review artifacts have genuinely been collected:

    node scripts/docker-release-handoff.mjs prepare /ABS/parity.json /ABS/inventory.json /ABS/manifest.json > /ABS/candidate.json

Have the evidence author sign:

    node scripts/docker-release-handoff.mjs author /ABS/candidate.json /ABS/author-private.pem > /ABS/authored.json

Have an independent reviewer verify the author identity and countersign exactly that package:

    node scripts/docker-release-handoff.mjs countersign /ABS/authored.json /ABS/reviewer-private.pem /ABS/pinned-author.pub > /ABS/dual-attestation.json

Finally, a verifier uses independently pinned public keys and the original evidence:

    node scripts/docker-release-handoff.mjs verify /ABS/dual-attestation.json /ABS/pinned-author.pub /ABS/pinned-reviewer.pub /ABS/parity.json /ABS/inventory.json /ABS/manifest.json

The verification output contains only commit/project identifiers, evidence digests, and clear limitations. It never prints keys, bearer tokens or raw evidence. A valid dual signature establishes only that **two distinct keys signed the supplied evidence package**. It cannot verify that both keys belong to independent people, that the reported live data is genuine, that the deployed code bytes match a specific local source tree, or that a Docker host is isolated.

**Never treat this as deployment approval:** `productionDeploymentAuthorized=false`, `stagingDockerExecutionAuthorized=false`, `deployedCodeBytesIndependentlyVerified=false`, and `independentHumanSecurityApprovalRequired=true` remain explicit even when all checks pass. A separate controlled change-management process, independent environment verification and physical Docker lab inspection are still required.

## Test

    node --test tests/docker-release-handoff.test.mjs

The dedicated GitHub Actions job runs only synthetic evidence and real ephemeral Ed25519 keys. It never queries staging Supabase or production, nor does it start a Docker container.