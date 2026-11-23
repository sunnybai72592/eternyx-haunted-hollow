# Cybersecurity Universe Wave 7 — Unified Private Cases

This release unifies REAL saved private assessment and investigation records. It does not invent a new backend, automatically detect incidents or claim that same-target records are legally or operationally related.

## Bundled improvements

1. Owned, attested engagement selector and existing private-evidence server RLS.
2. Bounded owner+engagement-scoped metadata pagination, stable ordering, refresh and stale-result cancellation.
3. Exact-marker separation of assessment, investigation, and other private evidence.
4. On-demand private JSON download and strict metadata path/size, schema, owner, engagement, current authorization and allowed-target validation.
5. Investigation linked-evidence reference verification via a second exact owner+engagement+ID database query; failing validations are not shown as confirmed records.
6. Same-target grouping with an explicit disclaimer that matching target strings do NOT prove formal incident linkage.
7. Newest VALIDATED case version per target and type powers aggregated triage; historical versions never double-count issues or response tasks.
8. Analyst overdue/unresolved findings, investigation actions, review coverage, version chronology and read-only existing audit events.
9. Export a metadata-only Markdown dossier without raw observation content, credentials or private storage paths.
10. Authenticated route, links from Cybersecurity Hub, regression tests and staging verification guide.

## Security and operational limits

- No new migration, secrets, paid GPU, paid AI API, alerting, scanning, outbound notification or production database changes.
- All case contents are private existing evidence objects; no created cross-case associations or new server tables.
- Only current-session validated records contribute to counts. Unreviewed records cannot be interpreted as clean/security-complete.
- Private storage RLS remains the authoritative access control. Client checks supplement it, not replace it.
- Downloaded investigation evidence IDs are reverified with an owner+engagement-scoped Supabase query before showing a validated case. No signed or public URLs are exposed.
- Prior Wave 4 schema remains staging-gated. This page can operate independently using existing evidence tables.

## Staging validation

Use two separate accounts with different engagements. Save assessment and investigation snapshots in one authorized target and a separate assessment in another target. Verify owner B cannot read A metadata or download A objects, including direct API attempts. Change the active engagement during a slow page fetch and confirm old results do not appear. Revoke attestation/remove target and verify old content cannot be reviewed. Link unavailable or foreign evidence metadata to an investigation and verify review denial. Review two assessment versions and one investigation version and ensure one newest assessment and one newest investigation drive the aggregates. Check report for any raw observation, storage path, secret or unauthorized data. Test mobile and keyboard navigation.

## Next blocker

A genuine isolated Supabase staging migration and separate-account API/storage checks are still required before indexed, multi-user relational case management may be enabled.
