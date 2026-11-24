# Wave 26 — release evidence and concurrent replay acceptance

## Actual staging state
PR #776 merged at 4d02ba81d5ae2e30ffa8359e28ef2b1e4a1d4447; all three reported workflows passed. A read-only staging catalog snapshot returned 4 protected control tables, 2 service-only reservation RPCs, 8 restrictive session fences, 1 private evidence bucket, 0 confirmed email accounts, 0 mediated Storage fences, 0 evidence records and 0 unsealed records. Gateway version 7 has JWT verification and a hard-disabled entrypoint. No activation, migration, or production change was made in Wave 26. Zero unsealed records in an empty dataset does not prove integrity of real files.

## Acceptance upgrades
The Wave 25 runner now races two uploads with the same request ID and requires exactly one registered result and one replay rejection; a third sequential replay must also fail and only one metadata row may exist. Post-cutover checks include direct listing denial, absent-object denial, and positive mediated read after the denied operations. No registered object deletion is attempted.

The updated runner emits v2 observations. The offline release assessor checks the exact expected phase-specific labels, rejects missing/duplicate/unknown labels, enforces staging identity, timestamp freshness (24 hours) and pre-before-post order. It accepts only reports that explicitly do not authorize production and are not independently attested. Reports are unsigned and may be fabricated; the assessor validates structure, not provenance or truth. A complete report pair does not certify release.

## Unblock and run
Create two confirmed disposable accounts in https://supabase.com/dashboard/project/mhodwvypfbxafamkrgsk/auth/users and retain credentials privately. Follow Wave 25's staging-only allowlist and rehearsal instructions after approval; do not apply cutover before successful pre-cutover and browser acceptance. Use Wave 25 configuration and record distinct pre/post-cutover reports with the updated runner. Then:
    node scripts/security-wave26-release-assessment.mjs wave26-pre.json wave26-post.json
Run scripts/sql/audit-security-gateway-release.sql and scripts/sql/audit-security-evidence-reconciliation.sql in staging using authorized operator access. Review actual catalog, object integrity, browser flow, real quota exhaustion/load, malware policy, legacy seals, backup restore, advisor triage, and independently review evidence. Direct deletion and unrelated-bucket compatibility remain separate live checks. No automatic cutover or production authorization is implemented.

No more source-only reports can substitute for the two real accounts and authorized rehearsal. CI runs offline regression tests only.
