# Cybersecurity Universe — Wave 5: Deployment Readiness & Two-Account RLS Acceptance

**Status: staging readiness only. No database was modified in Supabase, no migration was applied, and no active security scans were introduced.**

Wave 4's relational ledger exists as a staged SQL proposal, not a verified production migration. This wave adds executable, isolated evidence for its database security properties, and a safe path to a real CLI-generated migration file.

## Improvements bundled

1. **Real PostgreSQL 17 acceptance CI:** run the exact Wave 4 SQL on a disposable Docker container with **no network** and **no host port mapping**.
2. **Real owner isolation tests:** switch PostgreSQL roles and JWT-sub claims between two synthetic authenticated users, verifying row visibility and denial of cross-tenant assets, foreign keys, writes, and evidence links.
3. **Authorization lifecycle tests:** in-scope assets work; excluded and unknown targets fail; revoking an engagement attestation immediately blocks existing asset finding updates.
4. **Evidence/approval requirements:** verified and accepted statuses cannot be saved without documented retesting or risk-owner approval; cross-owner evidence references are rejected by composite FKs.
5. **Trigger-written immutable history:** validate create, update, evidence-link audit events, preserved actor IDs, lack of browser write/delete grants, and prohibition on reassignment of owner/relationship columns.
6. **CLI migration candidate generator:** a CLI-generated filename produced with \`supabase migration new\`, only after explicit staging opt-in. No migration file is generated or applied automatically by PR merge.
7. **Backend readiness gate:** all four relational tables and owned engagements must be readable before the ledger enables writes; partial schema deployment cannot falsely show a functioning ledger.
8. **Regression tests** covering the CI shell workflow, staged artifacts, synthetic fixture identities, explicit rollback, role changes, and fail-closed behavior.

## How to generate a canonical migration candidate

From a fully checked-out repository with Supabase CLI installed:

\`\`\`bash
supabase --version
supabase migration --help
ETERNYX_MIGRATION_ENV=staging node scripts/security-case-ledger-generate-migration.mjs --generate --staging-only-acknowledged
\`\`\`

The generator invokes Supabase CLI's \`migration new\` command, inspects the created file and copies the staged SQL. It **does not** connect to, modify, or deploy to any database. Review the generated file in a separate PR before using it in staging.

## Acceptance boundaries

- Green CI proves SQL can execute on a **synthetic PostgreSQL 17 fixture** and validates its specified data-access checks. It does **not** prove compatibility with the connected Supabase project's full schema, extensions, roles, Data API, private bucket behaviors, or actual account lifecycle.
- Staging acceptance requires two genuine separate user accounts, API-level cross-user tests, storage path and signed URL tests, fresh migration history, and Supabase security advisor review.
- Production must remain untouched until DB connectivity is recovered and those staging gates pass.
- CI uses \`docker run --network none\`, no forwarded ports, random per-run bootstrap password, synthetic UUIDs, role simulation and test-row rollback.
- Existing Wave 2/3 snapshots remain the production-safe fallback.

## Next wave

After genuine staged migration and account acceptance: unified investigation case management, indexed finding search and remediation collaboration. Avoid activating unverified backend features merely because source code merged.
