# ETERNYX Automation Phase 3A — Cross-pillar SQL Migration Collision Forensics

**Status: repository source baseline pinned; hosted staging migration history NOT verified.**
No database, hosted project, schedule, webhook, billing provider, AI API or
production environment was changed by this PR.

## Evidence identified on November 23, 2026

After PR #527 merged, a direct GitHub repository migration-directory
inventory revealed **11 duplicate 14-digit Supabase migration versions
covering 25 SQL files** among at least 108 SQL files in the repository.
These are **source version collisions**, not proof that any corresponding
SQL is applied remotely. They affect multiple teams and cannot safely be
"fixed" with automated renaming.

| Duplicate version | Colliding source filenames |
| --- | --- |
| 20261115060000 | ai_generation_input_asset_registry; bind_ai_job_idempotency_to_request |
| 20261123030000 | automation_github_issue_approvals; docker_workspace_enrollment |
| 20261123040000 | automation_github_workflow_tracking; docker_agent_signed_reports; service_brief_amendments |
| 20261123050000 | automation_template_gallery; docker_operation_review; service_request_journal; workspace_owner_projects_tasks_items |
| 20261123070000 | automation_operations; docker_signed_command_dispatch |
| 20261123080000 | automation_observability_recovery; docker_dispatch_receipt_recovery |
| 20261123090000 | automation_incident_management; docker_lab_incident_triage |
| 20261123100000 | automation_incident_evidence_reporting; docker_incident_containment |
| 20261123110000 | automation_investigation_plans; docker_release_review_history |
| 20261123120000 | automation_governed_incident_closure; docker_reviewer_accountability_and_event_chain |
| 20261123130000 | automation_governed_reopen_trace; docker_full_release_audit_export |

Every entry above is under \`supabase/migrations/\`, with the stated
version prefix and \`.sql\` suffix. The machine-readable baseline pins the
**exact 25 filenames** and their existing Git blob IDs rather than
trusting prose or a hardcoded version-only count.

## Twelve improvements in this PR

1. Record all 11 reviewed duplicate timestamp groups and all 25 source
   filenames in an immutable-by-review JSON baseline.
2. Pin each collided SQL file's actual Git blob hash, preserving the
   existing bytes without renaming, reformatting or rewriting migration SQL.
3. Scan **every migration filename**, including older UUID-suffixed ones,
   to discover new version collisions; hash only collided SQL for speed.
4. Detect a newly introduced duplicate version anywhere in the repository,
   not just in the Automation pillar.
5. Detect new/removed members of existing duplicate-version groups, including
   stealth replacement of one migration filename.
6. Detect edits to historically collided SQL via hash drift, even when
   the filename and timestamp remain unchanged.
7. Distinguish clean **source-baseline agreement** from actual remote
   deployment: the report always says staging and production are blocked.
8. Classify affected files by their owning pillar (Automation, Docker,
   Services, Workspace, AI) to make the cross-team scope visible.
9. Provide a bounded read-only \`SELECT version\` statement for the
   Supabase migration-history table, but **never execute it**.
10. Accept an optional recent, strictly validated, staging-project-bound
    *operator-supplied complete migration-history snapshot*; even this
    self-reported snapshot is **not independently verified**.
11. Distinguish "applied version — cannot tell which SQL executed" from
    "version not listed in submitted history"; neither allows silent
    renaming, migration repair, push or deployment.
12. Add Node regression tests and a CI gate that fails on new collision
    groups or historical SQL drift, while leaving existing collisions
    explicitly documented as **release blockers**.

## Commands (no credentials or network access)

\`\`\`sh
npm run automation:migrations:audit
node scripts/automation-staging-deployment-plan.mjs
\`\`\`

The new source checker outputs structured JSON with
\`collisionVersionCount\`, \`collisionFileCount\`, exact names,
\`sourceDefects\`, \`sourceBaselineValid\`, and
\`stagingDeploymentBlocked:true\`.

A **successful exit code means only that the historical reviewed
source snapshot is unchanged**. It does **not** mean duplicate migrations
are resolved or that Supabase staging is ready for migration.

The project CI calls the scanner without secrets and prints a brief count.
A new duplicate, unexpected removal, changed member or changed Git blob
makes the scanner fail. Updating the pinned baseline requires code review
and evidence: do not refresh the hashes just to hide an unexpected edit.

## Separately verified read-only staging evidence

The connected ETERNYX Supabase read-only SQL query previously timed out.
As a result, neither an applied version list nor authoritative object
provenance has been established. The only safe first action is to obtain
**successful read-only access** to an *isolated, verified staging project*.

The tool outputs a read-only migration-history query equivalent to:

\`\`\`sql
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261115060000', '20261123030000', '20261123040000',
  '20261123050000', '20261123070000', '20261123080000',
  '20261123090000', '20261123100000', '20261123110000',
  '20261123120000', '20261123130000'
)
ORDER BY version;
\`\`\`

Alternatively, use a version-compatible, read-only Supabase CLI history
listing after verifying \`supabase migration list --help\` in the installed
CLI. If the database cannot be reached, stop; do not guess.

For exploratory classification **only**, an operator may privately
normalize a successful *complete* staging history into a JSON file:

\`\`\`json
{
  "projectRef": "abcdefghijklmnopqrst",
  "source": "operator_supplied_complete_read_only_history",
  "complete": true,
  "capturedAt": "2026-11-23T16:00:00Z",
  "appliedVersions": ["20261115060000"]
}
\`\`\`

The reference and version values above are **illustrative**, not actual
live staging evidence. A private operator-only command can read it:

\`\`\`sh
node scripts/automation-migration-collision-forensics.mjs \
  --staging-ref YOUR_REAL_STAGING_PROJECT_REF \
  --production-ref YOUR_DIFFERENT_REAL_PRODUCTION_PROJECT_REF \
  --applied-evidence /private/path/verified-operator-history.json
\`\`\`

No file paths, bearer tokens, passwords, raw SQL records or user data
should be committed into Git. The script prints the operator-supplied
classification without sending it anywhere. The output remains
\`stagingDeploymentBlocked:true\` and
\`verifiedAppliedMigrationHistory:false\`, even with a matching receipt.

## Safe reconciliation decision tree

**A. A duplicated version is shown as applied in remote migration history.**
This is *ambiguous*: the same version cannot identify which of its two,
three or four different SQL files was executed. Collect read-only object
definition evidence and independently review actual tables, functions,
policies and constraints against each competing source. Review the
Supabase migration journal representation and any available deployment
records. Never assume the first alphabetical filename won.

**B. A duplicated version is absent from the verified, complete history.**
That alone does **not** give permission to modify production. In a
separate remediation PR, assign new *unique and valid* migration versions
to the verified unapplied sources, preserving dependency order and updating
only explicit references where necessary. Rerun all PostgreSQL 17
migration and schema acceptance tests against a fresh staging database.
Reconcile all 108+ migrations rather than just Automation files.

**C. The database connection times out or evidence is incomplete.**
Neither file may be removed, renamed or marked applied. Keep
\`stagingDeploymentBlocked\` true.

**D. A historical SQL blob changes during another pillar's development.**
The new CI guard fails. Review both the migration's content and the
already-applied history before approving *any* change to the baseline.

After the history is reconciled, run a reviewed, explicit *staging-only*
migration dry-run with the installed Supabase CLI. Applying migrations,
running \`migration repair\`, deploying Edge functions, enabling
schedulers/webhooks, executing real test workflows, or production
go/no-go remain **separately authorized operations**.

The objective is to remove a real rollout blocker, not to accumulate PR
counts or manufacture a green deployment status.
