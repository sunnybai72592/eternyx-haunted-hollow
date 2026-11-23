# Cybersecurity Universe — Wave 2: Private assessment cases

This is an additive **authenticated assessment workflow** built on *existing* owner-RLS pentest engagements and private evidence storage. It does not introduce new database tables, deploy migrations or services, or enable active scans.

## Bundled improvements

1. **Engagement-linked cases**: authenticated selectors load only the signed-in user's engagements, display written authorization attestation and permitted methods, and gate saving to attested scoped lifecycle states.
2. **Declared asset inventory**: only exact saved, non-excluded targets are selectable. Analyst records asset owner, priority/criticality, and context; no discovery or additional targets are inferred.
3. **Owned findings and remediation**: analyst can add up to 100 findings per case, triage severity/owner/due dates, and change remediation status. "Verified" requires original evidence and a retest narrative; "Accepted" requires a risk-owner approval reference. These are user assertions, not server-side independent verification.
4. **Versioned private persistence**: every saved case is a bounded JSON snapshot in the *existing* private \`pentest-evidence\` bucket. Metadata is registered with \`pentest_evidence\` (owner/engagement path checks, RLS), and existing triggers record the evidence-upload event. If registration fails, unregistered storage cleanup is attempted; no success is shown on failure.
5. **Restore and review**: owner-bound snapshots can be downloaded and validated against the current engagement scope before restoration. Previously attached evidence metadata and audit navigation are visible.
6. **Report and safety regressions**: export Markdown, add 8 local unit/contract tests, integrate links in Cybersecurity Hub, Black Hat Pentesting and the local register. No automatic tests are performed against any target.

## Trust limitations

- **Do not call this a server-indexed case database.** The database indexes snapshot evidence metadata, not individual findings/assets. For now findings/asset details are in the private JSON file, and editing creates a new immutable version; we will add queryable structured tables in the next wave after staging schema and policy verification.
- Existing RLS and bucket rules protect ownership. Client checks prevent ordinary UI mistakes but are not an authorization server, and do not verify written testing permission or retest claims.
- A security case can contain sensitive evidence; avoid secrets/personal records unless legitimately authorized and covered by data-handling controls.
- The evidence listing is capped, and older snapshots may not appear until pagination is added. Ownership and scope are verified again during restore.
- Deleting an engagement remains separately controlled by existing evidence FK protections.
- Deployments and production data are unchanged by opening this PR. A repository merge should be followed by staged review before release.

## Release checks

- \`node --test tests/security-case-workspace.test.mjs\`
- \`npm test && npm run build\`
- Staging: sign in with two accounts; test cross-account denied RLS on engagements, \`pentest_evidence\`, and private storage.
- Staging: save case A with a real attested engagement, refresh, restore; verify evidence upload event; deny out-of-scope target; make a finding verified only with retest note.
- Staging: prevent unsuccessful upload/registration from showing a saved success, then confirm the orphan-object cleanup condition.
- Staging: keyboard and mobile accessibility checks, evidence caps, and the already-running release CI.

## Next wave

Build durable, indexed security asset/finding tables with composite owner+engagement foreign keys, restrictive RLS and immutable status-history triggers, after creating a migration with Supabase CLI and validating it against a disposable staging database.
