# Cybersecurity Universe — Wave 16: Candidate integrity and isolated recovery acceptance

**This change does not deploy a Supabase migration, connect to a live database, restore a backup, or approve production.** It creates reusable offline evidence validation to make the next *real* staging/recovery rehearsal safer and easier to review.

## Delivered improvements

1. Validate a locally generated Supabase indexed-ledger candidate against the exact bytes of the reviewed Wave 4 staged source.
2. Pin the CLI-generated migration filename, version chronology, fixed header and the two prerequisite migrations.
3. Refuse any candidate with altered statements, a different filename/version, or unreviewed content; return only a local SHA-256 fingerprint.
4. Require three distinct project refs: original staging, isolated restore target and production.
5. Validate eight named restore/recovery evidence categories, with no fabricated green statuses.
6. Refuse self-declared independent approval: operator evidence cannot mark the independent-approval category as complete.
7. Require chronological UTC incident/backup/restore/data-recovery timestamps, or uniformly null timestamps when no real drill has been conducted.
8. Calculate RTO and RPO from the submitted timestamps, rejecting negative, contradictory, fractional-second and implausible intervals.
9. Validate Wave 15 source-pinned migration observations only from the selected staging project, with report time no older than seven days.
10. Validate all 60 Wave 11 read-only PostgreSQL catalog invariants from an optional after-restore result file.
11. Create an unsigned recovery packet that fingerprints received files while never exposing original evidence bytes or database credentials.
12. Add a protected Security Release Readiness UI import with operator-claimed RTO/RPO, per-gate missing/unsigned statuses and a permanent production block.
13. Negative regression tests for tampering, cross-project reports, altered candidate bytes, bad timelines and false release claims.

## Step 1 — review a locally generated migration candidate

Use the existing *explicit staging opt-in* local CLI generator only after source review. Its output is not applied automatically:

    ETERNYX_MIGRATION_ENV=staging node scripts/security-case-ledger-generate-migration.mjs --generate --staging-only-acknowledged

Supply that generated SQL file to the Wave 16 checker:

    node scripts/security-recovery-acceptance.mjs --check-candidate supabase/migrations/YOUR_TIMESTAMP_security_case_indexed_ledger.sql

The checker compares the complete candidate file to the immutable combination of the existing CLI-generated header and scripts/sql/staged-security-case-ledger.sql. If any byte differs, **review is blocked**. A successful match does not mean a migration exists on any Supabase server. It must undergo independent review, versioned submission, real isolated staging migration execution and migration-history verification before production consideration.

## Step 2 — gather real isolated restore evidence

Under an approved change window, an authorized operator must identify a real backup/snapshot and perform a restore **into a third, isolated project**, never in production. Protect raw credentials, backup material and private evidence separately. Verify migration state, real restored data checksums, 60 catalog security invariants, two real-account access and private Storage boundaries, alerting, and incident response. Capture observed timestamps, a measured RTO/RPO and independent reviewer approval through an authenticated channel.

Wave 16 does **not** perform these external actions or claim they occurred.

Create a private folder containing the following files as available:

| Filename | Type | Meaning |
| --- | --- | --- |
| wave16-operator-plan.json | Required | Operator's unsigned recovery plan and reported drill observations |
| wave15-migration-history.json | Optional | Output of the read-only Wave 15 staging migration observer |
| wave16-after-restore-catalog.txt | Optional | Complete 60-line raw output of Wave 11 catalog gate, obtained separately from isolated recovery database |

Operator plan JSON fields: schema must equal `eternyx.cybersecurity.recovery-operator-plan.v1`; provide `stagingRef`, `recoveryRef`, `productionRef`, `observedAt` (ISO UTC), `timeline`, `artifactDigests`, and `limitations` (two meaningful strings). All three refs must be distinct.

Timeline keys, in UTC: `backupCompletedAt`, `incidentDeclaredAt`, `restoreStartedAt`, `serviceRestoredAt`, `newestRecoveredDataAt`. If no drill occurred, **all five must be null**. For a reported drill all five are required and must be chronologically consistent; RTO is service-restored minus incident-declared, and RPO is incident-declared minus newest recovered data. These are calculations on operator-supplied data, not authenticated performance measurements.

ArtifactDigests must have exactly these eight named keys with values null (missing) or a valid lowercase SHA-256 digest referring to a separately protected artifact:

- isolated-restore-target
- recoverable-backup-reference
- restore-execution
- restore-integrity
- restored-authorization
- recovery-metrics
- monitoring-and-alerts
- independent-approval

The last value **must always be null**. This unsigned review cannot establish independent approval. If a drill's timeline is supplied, backup and restore artifacts must be referenced. The packet's statuses are **missing** or **operator-supplied-unsigned**, never independently verified.

## Step 3 — build the offline packet

Set project labels only (not credentials) in a secured local shell:

    ETERNYX_STAGING_PROJECT_REF=YOUR_STAGING_REF
    ETERNYX_RECOVERY_PROJECT_REF=YOUR_ISOLATED_RESTORE_REF
    ETERNYX_PRODUCTION_PROJECT_REF=YOUR_DIFFERENT_PRODUCTION_REF

Run:

    node scripts/security-recovery-acceptance.mjs --explain
    node scripts/security-recovery-acceptance.mjs --assess /private/wave16-evidence > /private/wave16-evidence/recovery-packet.json

Only local files are read; there are **no network requests, SQL commands, restores, file uploads, schema writes, deployment buttons or privileged Supabase calls**. The tool compares the Wave 15 report's project identity and source hash, checks the optional 60 catalog lines, and emits a small, privacy-conscious packet. Input reports are still unsigned and may be fabricated; their SHA-256 hashes only prove internal consistency of the files supplied.

Import the resulting recovery packet on the protected `/cybersecurity/release-readiness` page under **Isolated restore and recovery evidence**. Reported RTO/RPO and evidence counts are clearly distinguished from verified recovery, and the page continues to display **Production BLOCKED**.

## Local tests

    node --test tests/security-recovery-acceptance.test.mjs
    npm test
    npm run build

## Production gate

Even when all local checks pass, **migration deployment, backup restoration, security permissions and independently authenticated approval remain unverified until operators perform and attest the real staging work**. Never promote to production from this packet.

Supabase official guidance: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore and https://supabase.com/docs/guides/local-development/cli-workflows.
