# ETERNYX Automation Phase 3B — Fresh Local Staging Migration Mirror

**The first executable rehearsal preparation for resolving historical version collisions — still zero production writes.**

## What this actually fixes

The ETERNYX source tree contains 11 collision groups involving 25 SQL files.
A normal migration tool identifies migrations by their 14-digit version.
Duplicate versions make it ambiguous which SQL content belongs to an
"applied" history entry and may block fresh databases from receiving the
complete set of migrations.

This phase builds a **separate, unlinked local copy** of the complete SQL
migration tree with **unique versions for every file**, keeping the
original SQL bytes identical. It makes it possible to prepare a fresh local
database replay without altering or silently reclassifying a migration
in the original Git repository or in any existing database.

As of this phase, the source contains **11 duplicate version groups**:
the mirror keeps one original timestamp for each and assigns distinct
later seconds to the remaining 14 colliding files. The complete number
of SQL files is discovered dynamically.

## Included improvements

1. Scan every tracked SQL migration, including UUID-suffixed legacy
   migration names.
2. Compare original collided SQL contents against the Git blob-hash
   baseline pinned in Phase 3A; abort on any drift.
3. Generate a deterministic, sortable version mapping without guesswork
   or overwriting timestamp identifiers already occupied by other
   migrations.
4. Keep all 25 collided SQL file bytes unchanged. The only change inside
   the fresh mirror is the *filename timestamp* for 14 copies.
5. Include **all migration files**, not just Automation, because services,
   Docker, Workspace and AI migrations may be prerequisites.
6. Reject a proposed reversion if it would cross the minute boundary,
   collide with an existing timestamp or produce duplicate output.
7. Require explicit local-only intent and an absolute destination
   **outside the original repository**; never overwrite existing
   destination paths.
8. Produce a detailed manifest with original and mirrored names,
   SHA-256 content hash and original Git blob hash, plus a conspicuous
   \`DO_NOT_DEPLOY.txt\` safeguard.
9. Preserve ordering for each collision group using stable alphabetical
   names. This does **not** prove SQL dependency ordering and must be
   checked by an independent staging operator before any SQL execution.
10. Add real-file byte-for-byte replay-copy tests and negative tests for
    path overlaps, changed historical SQL, timestamp conflicts, and
    missing explicit consent.
11. Validate the version mapping in CI without performing a network
    request, migration, CLI subprocess or database write.
12. Keep **both staging and production deployment explicitly blocked**
    pending a real read-only migration history and full database review.

## Fast commands

Validate the checked-in source without creating anything:

\`\`\`sh
npm run automation:migrations:audit
npm run automation:migrations:rehearsal
\`\`\`

Generate an **unlinked local** rehearsal migration directory in a fresh
path outside the checkout. The destination parent must already exist;
the destination itself must NOT exist:

\`\`\`sh
node scripts/automation-fresh-staging-mirror.mjs \
  --create-fresh-local-mirror --output /tmp/eternyx-staging-sql-rehearsal-01
\`\`\`

Result:

\`\`\`text
/tmp/eternyx-staging-sql-rehearsal-01/
  DO_NOT_DEPLOY.txt
  REHEARSAL_ONLY.json
  supabase/
    migrations/
      <all original SQL files, 14 with unique local-only version labels>
\`\`\`

This creates a **source-mirror on disk only**; it DOES NOT initialize a
database, invoke Supabase CLI, execute a single migration or deploy
anything. It is **not** a replacement for \`supabase db reset\` in a
properly isolated and bootstrapped test environment. An operator must
still verify the installed Supabase CLI's own command syntax and
dependencies before running migrations against a fresh disposable
local database.

**Never** run \`supabase db push\`, \`migration repair\`, \`functions deploy\`
or any database command targeting a linked, existing or production
Supabase project from this copied folder. These copied timestamps are
NOT an authoritative migration history.

## Remaining release blockers

- The connected ETERNYX Supabase project reports ACTIVE_HEALTHY, but
  read-only migration history and SQL calls still return connection
  timeouts. That remote project has **not** been proven safe to alter.
- No isolated staging Supabase branch/project is currently present in
  the connected organization, so a real two-account staging execution
  test cannot yet be run on a separate environment.
- The mirror provides no guarantee of SQL dependency correctness,
  table/function/policy compatibility, applied-history provenance,
  security or transaction behavior until a properly isolated Postgres
  test actually exercises the full migration sequence.
- The core Automation Edge Functions \`automation-control\`,
  \`automation-webhook\` and \`automation-scheduler-worker\` were absent
  from the last connected deployment inventory.

## Gate after this PR

The next concrete milestone is an **independently approved isolated
staging environment** with verified database connectivity, checked SQL
migration dependencies and a controlled *fresh* migration replay. Only
then can we reconcile existing deployment history and perform the
two-account manual workflow acceptance in Phase 2X.

**No production change, billable project creation, cloud execution,
cron activation, secret inspection, historical tracked migration rename,
or automatic promotion happens in this PR.**
