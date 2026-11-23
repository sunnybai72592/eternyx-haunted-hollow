# Cybersecurity Universe — Wave 14: Unified Staging Evidence Dossier

Wave 14 unifies the previously independent Wave 10–13 staging acceptance artifacts in one **offline, strictly fail-closed, unsigned** report. **No actual staging account tests, migrations or production data changes are run by this PR.**

## Improvements bundled

1. Bounded local staging evidence assembly (five fixed artifact filenames, 48 KiB per submitted report).
2. Strict Wave 10 two-account read-only report validation and selected project reference matching.
3. Strict Wave 13 JWT HTTP baseline report validation, including proper deferred checks.
4. Strict Wave 13 revoked-phase report validation and comparison with the same HMAC-bound users, engagement fixtures, and project.
5. Reject a revoked-phase report without its original baseline, backwards timestamps or a phase gap over 24 hours.
6. Reject stale reports older than seven days and future-dated reports beyond five minutes.
7. Verify all 60 Wave 11 PostgreSQL catalog check lines and reject missing/duplicate/failing checks.
8. Generate an optional structured Wave 12 transactional write/rollback receipt (`--run-json`), only after successful staging-only psql execution.
9. Validate Wave 12 receipt project binding and SHA-256 of the reviewed staged write-test SQL.
10. Bind every accepted artifact to its SHA-256 file digest and emit only summary metadata—no raw JWTs, evidence objects or submitted report bodies.
11. Include SHA-256 source fingerprints for the indexed ledger proposal, the catalog inspection SQL, and the prerequisite migrations.
12. Deterministic canonical JSON dossier hashing, local browser verification and tamper detection.
13. Keep three independently controlled production release gates explicitly missing: verified staging migration history, real backup/restore and authenticated independent approval.
14. Display the eight-category checklist and checksum in the authenticated Security Release Readiness UI, never a fabricated readiness percentage.
15. Negative security regression tests, fully offline CLI, no service-role API or database connection during assembly.

## Gathering the real files

Use a **separate approved Supabase staging project** and two real staging accounts with synthetic fixtures (not real customer evidence). Store all files in a protected local directory. The expected names are:

| Filename | How obtained |
| --- | --- |
| `wave10-readonly.json` | Wave 10 `node scripts/security-case-staging-readonly.mjs --run` output |
| `wave13-baseline.json` | Wave 13 `node scripts/security-staging-http-revocation.mjs --baseline` output |
| `wave13-revoked.json` | Wave 13 `node scripts/security-staging-http-revocation.mjs --revoked` output |
| `wave11-catalog.txt` | Wave 11 read-only 60-line SQL catalog output **before** piping through its fail-closed parser |
| `wave12-transactional.json` | Wave 12 `node scripts/security-ledger-staging-writes.mjs --run-json` output |

Review each command's own staging-only operator runbook BEFORE running it. This consolidator **does not** invoke those runners and will not fill in missing artifacts. Its current catalog artifact does not itself carry a trusted project reference or server timestamp; the report explicitly labels it as operator-provided, **not** proof it came from staging.

Wave 13 real JWT checks must run with the SAME account tokens, engagement IDs, and ephemeral run secret in both phases. An authorized operator must independently revoke only the synthetic A engagement between phases. Attestation revocation is NOT JWT/session revocation and does not remove an owner's historical evidence reads.

## Create a local evidence dossier

Without any credentials or network activity:

    node scripts/security-staging-dossier.mjs --explain

Set only the desired project labels in the local shell:

    ETERNYX_STAGING_PROJECT_REF=YOUR_STAGING_REF
    ETERNYX_PRODUCTION_PROJECT_REF=DIFFERENT_PRODUCTION_REF

After placing locally obtained artifacts in one protected folder:

    node scripts/security-staging-dossier.mjs --assess /private/staging-evidence > /private/staging-evidence/dossier.json

The two environment variables distinguish projects for local report comparison. The assembler does not authenticate the supplied project labels. Every included file is schema-validated and fingerprinted; a malformed, stale or cross-project report causes failure and **does not** emit a dossier. An empty directory generates an honest all-missing checklist.

The JSON contains no raw source file bodies, tokens, database connection strings, personal account IDs, private Storage object names, or evidence bytes. It retains the operator-claimed staging/production refs, SHA-256 file digests and local observation timestamps.

Open the protected route `/cybersecurity/release-readiness`, select the combined dossier JSON under **Consolidated staging evidence dossier**, and review the category statuses. Browser-side WebCrypto recomputes the canonical dossier digest and rejects alteration. It does not access the server or release anything.

## Trust, completeness and production safeguards

- **Unsigned source**: every report and the dossier are local operator documents, not independently authenticated testimony. A dishonest editor can fabricate files and recompute SHA-256.
- **Catalog limitation**: a 60-line PASS file cannot independently establish which PostgreSQL server executed the SQL, or that a reviewed migration was deployed.
- **Staging transactional limitation**: the Wave 12 write receipt proves only a local runner reported a successful **database-role emulation** on the named target; it is not an HTTP JWT acceptance or full database recovery test.
- **Data protection**: users must protect the local staging evidence folder. The assembled dossier is metadata-only but may still be confidential.
- **Time bounds**: Wave 10/12/13 report timestamps must be within seven days, Wave 13 baseline must precede revoked by no more than 24 hours.
- **Missing gates**: migration history verification, a real backup/restore rehearsal and a named independent authenticated approval are always shown as missing. This CLI cannot manufacture them.
- **Production**: release status remains **BLOCKED** regardless of the dossier contents. No database schema mutation, RLS change, service-role token, payment flow or production deployment is performed.

## Local tests

    node --test tests/security-staging-dossier.test.mjs
    npm test
    npm run build

Next legitimate milestone: independently verify a real isolated staging project's migration history, perform/observe each authorized staging probe, and evidence a recovery drill and named security approval. Do not substitute CI or self-authored JSON for those steps.

Related files: docs/CYBERSECURITY_UNIVERSE_WAVE_10.md, docs/CYBERSECURITY_UNIVERSE_WAVE_11.md, docs/CYBERSECURITY_UNIVERSE_WAVE_12.md, docs/CYBERSECURITY_UNIVERSE_WAVE_13.md.
