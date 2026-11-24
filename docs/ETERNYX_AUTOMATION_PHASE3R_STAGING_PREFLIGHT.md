# Automation Phase 3R — Staging snapshot preflight (read-only)

**Do not apply a fresh migration mirror to the current staging project.**

On 23 November 2026 an authenticated Supabase migration-journal query returned **three** migrations on staging `mhodwvypfbxafamkrgsk`: `20261123215132` (`pentest_engagement_management_staging_baseline`), `20261123215141` (`pentest_evidence_and_audit_staging_baseline`), `20261123215211` (`security_case_indexed_ledger_staging_v1`). This differs from the previously observed empty database. The stage is shared with pentesting/security work and must not be reset or blindly re-migrated.

## Preflight interface

`scripts/automation-stage-snapshot-preflight.mjs` takes a **local JSON file** produced by independently verified, read-only management and database inspection. It does not itself query Supabase or read credentials.

Expected JSON shape (values shown are examples of the observed resource identity, **not** automatically trusted evidence):

```json
{
  "schema": "eternyx-staging-snapshot-v1",
  "project": {
    "id": "mhodwvypfbxafamkrgsk",
    "ref": "mhodwvypfbxafamkrgsk",
    "organization_id": "xnhopzufalyhswuwvqmo",
    "status": "ACTIVE_HEALTHY",
    "region": "us-east-1"
  },
  "migrations": [
    {"version": "20261123215132", "name": "pentest_engagement_management_staging_baseline"},
    {"version": "20261123215141", "name": "pentest_evidence_and_audit_staging_baseline"},
    {"version": "20261123215211", "name": "security_case_indexed_ledger_staging_v1"}
  ],
  "functions": []
}
```

`node scripts/automation-stage-snapshot-preflight.mjs --snapshot /absolute/path/to/verified-stage.json` exits **2** if the project is nonempty; exits **1** on invalid input, wrong project, duplicate migration version or malformed catalog. Empty-only success is not permission to deploy.

After independently reviewing the **exact** existing migration journal and underlying SQL, use:

`node scripts/automation-stage-snapshot-preflight.mjs --snapshot /absolute/path/to/verified-stage.json --expected-versions 20261123215132,20261123215141,20261123215211 --allow-nonempty`

This acknowledgement only permits a read-only reconciled **snapshot**, never a fresh migration mirror, DDL, reset, deploy, or schedule activation. Existing core backend functions or any extra/missing migration version block the result. Capture actual migration names and source hashes separately before any SQL write. Avoid sensitive data in JSON snapshots and CI artifacts.

## Five safeguards

1. Bind exact stage ID, organization, region, and healthy status; reject production and wrong targets.
2. Reject duplicate, invalid and unexpectedly changed migration journals.
3. Distinguish a *genuinely empty* stage from an existing shared stage.
4. Detect already deployed protected function names before changing deployment state.
5. Keep the checker offline, with bounded inputs, no credential access and no write/deploy capability. Automated negative tests cover these rules.

## Next operator milestone

Construct a reviewed **additive** migration plan that preserves the three existing pentesting migrations. Replay it first against disposable PostgreSQL 17, verify all 4-backend SQL RPCs, physical tables and RLS, then plan protected staging deployment. Keep production and active staging features intact.
