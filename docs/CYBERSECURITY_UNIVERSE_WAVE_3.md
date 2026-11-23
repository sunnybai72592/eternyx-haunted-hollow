# Cybersecurity Universe — Wave 3: Case Intelligence and Evidence History

Scope: an additional, authenticated security-case analysis workspace using existing private Supabase engagement/evidence infrastructure. No new schema, migrations or target scans.

## Eight functional improvements in one PR

1. Owner-scoped engagement selector using authenticated reads and existing RLS.
2. Bounded private evidence browsing with deterministic created_at/id ordering, pagination beyond 100 records, de-duplication and stale-request guards.
3. Private case snapshot loading with schema, size, ownership, current-scope and storage-path validation before analysis.
4. Analyst-only priority summary: unresolved, overdue, critical/high attention, blocked, unassigned and recorded verified/accepted statuses. Weights 8/5/3/1 are **internal queue points, not CVSS**.
5. Search, remediation status and severity filtering of recorded findings.
6. Version comparison for the same account, engagement and asset, including added, removed and edited findings, status transitions, and asset metadata changes.
7. Markdown export for analyst triage and change logs. Change-log exports exclude full evidence bodies; they report only changed field names and status changes.
8. Browser-accessible route, Cybersecurity Hub navigation and security regression tests.

## Security/operational limitations

- No queryable asset/finding tables. Metadata is indexed by the existing pentest_evidence table; case bodies stay immutable JSON in the private bucket.
- Existing database RLS and storage policies enforce access. Client checks do not independently verify authorization or create permission to assess a target.
- Review/diff output is based on user-supplied content. "Verified" is only an analyst-entered remediation state.
- Offset pagination can yield duplicates if rows are concurrently inserted; the client deduplicates by record ID. Large history/search use cases need relational indexed tables and cursor pagination.
- Older historical snapshots not in the loaded pages remain discoverable with "Load older evidence".
- No paid API, active scan, real-time SOC, background notification, production database deployment or new secrets.

## Validation

- Run \`node --test tests/security-case-workspace.test.mjs tests/security-case-intelligence.test.mjs\` and \`npm test && npm run build\`.
- In staging, confirm two separate accounts cannot read each other's engagements or storage objects.
- Confirm 60+ evidence rows paginate correctly; switching engagements during a slow request never cross-populates results.
- Save two versions for the same asset, compare statuses/evidence edits, and export the diff. Cross-asset comparisons must reject.
- Verify that a withdrawn authorized scope prevents restoration or comparison.

## Wave 4 / properly indexed database work

A separate, staged migration is required for relational security assets, findings, immutable status history and owner-composite foreign keys. Generate the migration using the Supabase CLI, validate against an isolated Postgres instance, run security advisors, and only then consider deployment. This PR intentionally changes no production schema.
