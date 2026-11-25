# Workspace Phase 49 — staging deployment receipt

Date: 2026-11-25. Operator explicitly approved all 14 reviewed Workspace migrations, Eternyx Staging only, preserving existing workloads and prohibiting production changes and paid infrastructure.

Target: Eternyx Staging (mhodwvypfbxafamkrgsk). Deployment source commit: f9cfe7aa1e7b7092536ebbc04855b18167a7b3c0. All 14 source SQL files compared byte-for-byte with the successful PostgreSQL 17 acceptance run (commit 931c91eb0f944f0fbfa0645c05542c809f3b5905, run 45211396714, job 137820890002). All 14 SQL drills passed there. Preflight confirmed no existing Workspace relations/functions/bucket/policies, required Auth/Storage/Realtime dependencies present; reviewed existing Storage policies scoped to pentest-evidence.

## Actual migration history mapping

All 14 original SQL payloads applied in dependency order; each management API response was successful. Staging migration count rose from 60 to 74. The migration API assigned new timestamps; source history versions have NOT been rewritten. Do not replay these SQL files or mark source-version history as reconciled without independently reviewing the mapping and migration provenance.

| Source file | Actual staging history version |
|---|---|
| `20261123050000_workspace_owner_projects_tasks_items.sql` | `20261125150110` |
| `20261123180000_workspace_revision_history_and_archive_guards.sql` | `20261125150117` |
| `20261124010000_workspace_owner_quotas_and_pinned.sql` | `20261125150121` |
| `20261124030000_workspace_task_priorities_and_safe_purge.sql` | `20261125150126` |
| `20261124050000_workspace_task_details_checklists.sql` | `20261125150131` |
| `20261124070000_workspace_checklist_restore_batches.sql` | `20261125150136` |
| `20261124090000_workspace_import_sessions.sql` | `20261125150140` |
| `20261124110000_workspace_import_recovery_review_and_discard.sql` | `20261125150143` |
| `20261124130000_workspace_import_protection_and_integrity.sql` | `20261125150146` |
| `20261124150000_workspace_reconciliation_receipts.sql` | `20261125150149` |
| `20261124170000_workspace_team_spaces.sql` | `20261125150157` |
| `20261124190000_workspace_team_discussions_checklists.sql` | `20261125150201` |
| `20261124210000_workspace_team_realtime_notifications.sql` | `20261125150208` |
| `20261124230000_workspace_team_notification_snapshot.sql` | `20261125150211` |

## Post-deployment live metadata observations

- All 18 expected tables present, RLS enabled, at least one policy present, no direct anon SELECT/INSERT/UPDATE/DELETE privileges.
- All 17 expected team RPC signatures present without overloads, SECURITY DEFINER, authenticated EXECUTE, no anon EXECUTE. PostgreSQL reports the empty search path as search_path=""; a corrected read-only query confirmed 17/17. The internal assignment-event trigger function is not callable by authenticated or anon roles.
- Private workspace-private bucket exists, 5 MiB limit, seven reviewed allowed MIME types; three named Workspace Storage policies present.
- Team event table in supabase_realtime publication.
- All subsequent verification queries were read-only. No application fixtures, real-user accounts, production changes or paid infrastructure created.

The original source-version audit remains strict and will report source version mismatches for the API-generated history. This is intentional; do not treat the timestamp mapping as proof of live SQL body equivalence or bypass migration provenance review. This PR corrects only the exact empty-search-path catalog representation.

## Remaining release gates

Authenticated four-account Data API acceptance, real write/revocation/Storage/Realtime drills with approved isolated fixtures, browser acceptance and migration provenance reconciliation. Metadata evidence does not certify runtime RLS, Storage bytes, delivery, existing workload health or production. No production certification.
