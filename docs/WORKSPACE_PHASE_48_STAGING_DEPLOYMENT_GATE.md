# Workspace Phase 48 — Staging audit and deployment approval gate

## Live observation — 2026-11-24

Target: Eternyx Staging (mhodwvypfbxafamkrgsk), distinct from production. Repository baseline 2f96514569282a1d757de738145e7605b4c45009.
Read-only catalog queries reported database postgres, transaction_read_only=on, migration history present.
- 0/14 exact Workspace source migration versions recorded.
- 0/18 expected Workspace tables present.
- 0/17 reviewed team RPC signatures present.
- Zero public functions with workspace_ prefix, no workspace-private bucket, no workspace_-prefixed Storage policies.
- Auth users, Storage objects and supabase_realtime publication exist.

No production SQL, user records, migration application, fixture creation, or paid infrastructure. These observations are not a release certification. The new reusable preflight is a stricter catalog gate and must be executed again before any approved rollout (including checking all prefixed relations, not only tables). Existing broad Storage policies and SQL runtime behavior require review; absence of named collisions alone does not establish isolation.

## Exact reviewed source order

1. `supabase/migrations/20261123050000_workspace_owner_projects_tasks_items.sql`
2. `supabase/migrations/20261123180000_workspace_revision_history_and_archive_guards.sql`
3. `supabase/migrations/20261124010000_workspace_owner_quotas_and_pinned.sql`
4. `supabase/migrations/20261124030000_workspace_task_priorities_and_safe_purge.sql`
5. `supabase/migrations/20261124050000_workspace_task_details_checklists.sql`
6. `supabase/migrations/20261124070000_workspace_checklist_restore_batches.sql`
7. `supabase/migrations/20261124090000_workspace_import_sessions.sql`
8. `supabase/migrations/20261124110000_workspace_import_recovery_review_and_discard.sql`
9. `supabase/migrations/20261124130000_workspace_import_protection_and_integrity.sql`
10. `supabase/migrations/20261124150000_workspace_reconciliation_receipts.sql`
11. `supabase/migrations/20261124170000_workspace_team_spaces.sql`
12. `supabase/migrations/20261124190000_workspace_team_discussions_checklists.sql`
13. `supabase/migrations/20261124210000_workspace_team_realtime_notifications.sql`
14. `supabase/migrations/20261124230000_workspace_team_notification_snapshot.sql`

All 14 source files were retrieved from the baseline. The initial migration creates the private 5 MiB Storage bucket and its scoped policies; the penultimate migration adds only the team event table to the existing Realtime publication. No source file is authorized for deployment by this document. The existing disposable PostgreSQL workflow references the migration chain and 14 SQL drills; fresh CI success has not been verified.

## Deployment gate

1. Require explicit staging-only approval for all 14 migrations. Confirm staging ref, recheck source revision and current catalog with the read-only preflight; stop if any collision, partial deployment, unexpected dependency or source change is found.
2. Verify successful disposable PostgreSQL migration replay and review Storage policies and existing workloads. Use original SQL in dependency order, preserve all unrelated data, record exact applied versions and stop on first error. Do not invent migration history or blindly retry partial installs.
3. Requery 14 migration versions, 18 table security checks and 17 RPC signatures/ACLs; verify bucket privacy and Realtime publication membership. Version presence does not prove body equivalence.
4. Create only explicitly approved isolated test fixtures; run four-account read-only acceptance plus separately approved write/revocation/Storage/Realtime tests.
5. Browser acceptance and manual release review; no production changes without separate authorization.

Current release gate: BLOCKED — staging schema missing. No migrations applied.
