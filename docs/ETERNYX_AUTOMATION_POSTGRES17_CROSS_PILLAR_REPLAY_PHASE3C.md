# ETERNYX Automation Phase 3C — Actual Cross-Pillar PostgreSQL 17 Replay

## Why this step is different

Phases 3A and 3B identified and preserved the existing 11 SQL version
collisions, then prepared an unlinked, byte-preserving local migration
mirror. A plan can look valid while SQL dependencies fail in a real
database. This phase tests that possibility using a **real PostgreSQL 17
server** in a disposable, network-isolated container on GitHub Actions.

**It does not run against the connected ETERNYX Supabase project.** The
remote migration history is still unknown because database connector
requests timed out. No separate hosted staging project is configured.

## What the workflow actually does

1. Trigger on the changes to migration source, replay scripts, test
   contracts or this workflow, or via explicit manual workflow dispatch.
2. Validate historical Git blob IDs and check that new version collisions
   are not introduced.
3. Create a new, unlinked copy of all repository SQL migration files
   with collision-free, locally reassigned version filenames.
4. Reject any malformed, duplicate, untrusted or changed SQL manifest
   entry; require all discovered Automation and Docker source migrations.
5. Choose **Automation + Docker** migrations as the initial cross-pillar
   replay scope. Services, Workspace, AI, and generic bootstrap
   migrations are **not** being represented as tested in this workflow.
6. Sort selected mirrored migrations by unique 14-digit version and
   filename; preserve each original SQL file's bytes.
7. Start \`postgres:17-alpine\` with \`--network none\` and a synthetic
   local-only password; it has no connection to hosted Supabase.
8. Bootstrap synthetic Auth users and Supabase roles from the existing
   \`tests/sql/ctf-range-db-bootstrap.sql\` test fixture.
9. Execute each selected SQL file with \`psql -v ON_ERROR_STOP=1\`,
   failing on the first real SQL error (and reporting the exact failing
   local filename).
10. Run the existing real PostgreSQL Automation owner-quota/idempotency
    smoke test after the combined migrations.
11. Run the existing Docker isolation, signed permit, receipt and
    incident-hold smoke test in **the same** database.
12. Save an allowlisted, local-only migration count/outcome artifact,
    remove the container even on failure, and keep remote release flags
    unchanged.

## Direct verification

Review the GitHub Actions job **"Actually replay Automation + Docker SQL
together in networkless PG17"**. On failure, use the exact failed file
and PostgreSQL error to fix dependency ordering or propose a reviewed
new migration; do **not** overwrite historical tracked SQL or silently
skip a failing file.

The workflow deliberately fails if the two pillar chains cannot coexist.
A local test's success is evidence about this **particular disposable
PostgreSQL fixture**, not about live Supabase RLS, applied migration
history, actual secrets, publicly deployed Functions, cron, billing or
network access.

To run it manually, use GitHub Actions → "Automation + Docker combined
offline PostgreSQL 17 migration replay" → Run workflow. It has no
remote database credentials or cloud mutation actions.

## Still blocking a real rollout

- Obtain read-only, successful migration history from an independently
  authorized **isolated staging** environment.
- Reconcile the 11 historical duplicate versions against actual applied
  objects and migration journal data, including Services, AI and
  Workspace SQL.
- Complete a full-repository isolated migration rehearsal beyond the
  Automation + Docker scope when the necessary Supabase-specific schema
  bootstrap is available.
- Separately approve a staging project/branch and its compute cost.
- Deploy and verify the missing Automation control, webhook and worker
  functions only after separately approved staging SQL reconciliation.
- Run the two-user staging HTTP acceptance runner before considering
  production release.

**No deployment, migration repair, production write, scheduled execution,
Docker agent activation, paid AI model, or public webhook is enabled here.**
