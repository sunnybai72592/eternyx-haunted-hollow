# ETERNYX Docker: staging evidence review and configuration drift

This milestone follows merged PR #437. It adds **read-only review of real stored claim metadata against a trusted operator's local audit journal**, and structural drift checks of captured container inspection data. It does not deploy Supabase, execute Docker, independently attest a machine, or enable hosted customer access.

## One bundled safety milestone

- Export up to 30 recent account-owned claim records from the signed-in Docker governance page, excluding tokens, keys, notes and raw logs.
- Explicitly mark that export as unverified browser-origin JSON, never an authenticated signed server receipt.
- Validate schema, bounded rows, unique request/claim IDs, complete container IDs and recognized operations/statuses. Reject malformed or injected fields.
- Correlate the selected claim ID to the operator's private local journal, agent identity, operation, exact container ID and reported outcome.
- Treat missing journals, mismatched outcomes, missing acknowledgements and old claims as requiring manual investigation.
- Optionally require cryptographic proof of the *same local journal* using an Ed25519 signature and independently pinned enrolled agent public key.
- Even when all available assertions match, report remoteOperationVerified=false and serverExportVerified=false; no independent Docker success attestation.
- Fingerprint allowlisted security fields from operator-supplied Docker inspect JSON without reprinting environment variables, secrets or commands.
- Demand a separately retained baseline SHA-256 when comparing newer captured inspection data; refuse altered baseline and detect resource/profile drift.
- Reject unsafe current captures (privileged, networked, writable root, bind mounts, wrong labels or wrong container ID) using the established lab guard.
- Run the combined offline acceptance summary, regressions and read-only CLI without any remote calls or hidden Docker mutations.

## 1. Export owner claim data

Sign in to ETERNYX → Cloud & Integrations → Docker Operation Review. Use **Export owner claim snapshot** to save the latest bounded request metadata. This JSON remains sensitive operational metadata. Store it in an operator-private location. Its presence, origin label and filenames are NOT cryptographic server authentication; users with write access can alter the exported snapshot.

## 2. Reconcile against the operator's journal

Run on the machine possessing the legitimate private journals. The claim ID must be a full UUID. The journal path must be absolute.

    node scripts/docker-lab-review.mjs reconcile /ABS/owner-claims.json CLAIM_UUID --journal-dir /ABS/.eternyx/docker-lab-journal

This returns attention-required unless a matching signed local audit proof is also verified against a previously pinned agent public key. A signed local audit can be produced using the existing offline Docker lab audit CLI:

    node scripts/docker-lab-audit.mjs sign CLAIM_UUID /ABS/AGENT-PRIVATE.pem > /ABS/claim-audit.json
    node scripts/docker-lab-review.mjs reconcile /ABS/owner-claims.json CLAIM_UUID --journal-dir /ABS/.eternyx/docker-lab-journal --audit-proof /ABS/claim-audit.json --pinned-agent-key /ABS/AGENT-PUBLIC.key

The signed claim proof authenticates the local key and exact journal bytes. It **does not authenticate the browser export or independently verify Docker execution**. The command never retries Docker actions. A process exit status 0 means no mismatch was found among the supplied assertions and valid pinned local audit—not staging deployment approval.

## 3. Detect lab security configuration drift

On an operator-controlled host, save the outputs of `docker inspect` for the exact disposable, hardened lab container to private JSON files at two different review points. Full inspect can contain secrets: **never upload it to GitHub, attach it to issues or share it with ETERNYX**. This CLI reads it locally and outputs only approved metadata/hash fields.

    node scripts/docker-lab-review.mjs fingerprint /ABS/baseline-inspect.json FULL_64_CHARACTER_ID

Retain the returned policySha256 separately in a trusted change record. Later, after collecting a fresh current inspect snapshot:

    node scripts/docker-lab-review.mjs drift /ABS/baseline-inspect.json /ABS/current-inspect.json FULL_64_CHARACTER_ID PINNED_BASELINE_SHA256

The tool first verifies the baseline still matches the independently pinned fingerprint. It then re-runs hardening validation on the current captured state and reports changed field names, digest and whether manual attention is needed. It cannot prove that any snapshot came from a genuine Docker host; capture authenticity, timing and environment isolation must be independently tested. Changes outside the allowlisted security fields may go undetected, so this is not a comprehensive Docker configuration auditor.

## 4. Offline local acceptance

    node scripts/docker-lab-review.mjs acceptance

This combines synthetic recovery drills and a conservative local preflight. It always reports stagedDatabaseTested=false, realDockerInspected=false, hostOwnershipAttested=false and executionAuthorized=false, because no live staging service is contacted.

## Independent staging validation still required

Before enabling even restricted lab dispatch, separately verify Supabase migrations and owner A/B RLS, actual Ed25519 agent enrollment and revocation, fresh signed heartbeats, permit expiry and claim replay, incident holds, lost receipts, real disposable Docker sandbox configuration, host identity and physical Docker socket exposure. Review real GitHub CI and the independent signoff. Do not deploy to customer production or enable the server/agent execution flags based on this offline review.

Test: node --test tests/docker-lab-staging-review.test.mjs. No new database migration, Edge Function, cron, public Docker API, GPU, paid cloud or external AI service is introduced.
