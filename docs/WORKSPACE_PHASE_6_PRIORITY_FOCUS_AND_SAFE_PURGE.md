# ETERNYX Workspace Phase 6 — Priorities, My Work, and safe archived-project deletion

**State:** Proposed code/migration. Merging a PR does not deploy SQL or grant access to the production database.

## User-facing capabilities

1. **Persistent task priority**: `low / normal / high / urgent`, database-enforced enum-like CHECK, column-scoped INSERT/UPDATE grants. A task can be created with a priority or edited later with the existing owner and `updated_at` stale-tab protections.
2. **Real cross-project “My Work” queue**: shows unfinished tasks across the currently loaded private account library, grouped into overdue, today, upcoming and unscheduled. Group counts reflect real tasks; a capped list discloses unshown tasks, and archived projects are visibly read-only.
3. **Quick task actions**: open the real target project/task and mark an active-project task complete from the cross-project queue; archived projects are not editable.
4. **Task sorting and filtering**: filter by priority, status, due-date window and text; sort by due date, priority, recent changes, or open-first. Sorting does not alter database ordering, task state or timestamps.
5. **Cross-project search navigation**: clicking a global search result now scrolls to the matched task or saved-item section and applies the title filter, rather than dropping users on the project overview.
6. **Portable backup compatibility**: both v1 metadata-only and v2 binary-inclusive project backup formats include task priorities. Older backups without the field restore as `normal`; unsupported/forged values fail validation before importing.
7. **Safe project capacity recovery**: a database RPC `workspace_delete_archived_project` allows an authenticated owner to **permanently remove an archived project containing no registered or unregistered private Storage objects**. The UI requires typing `DELETE`; existing files force a hard error. The owner must first restore the project, delete files through Supabase Storage API, then archive again. Within one DB transaction, the RPC removes tasks, notes/links, their revisions, activity and the archived project. This frees a genuine project quota slot without silently orphaning file bytes.
8. **Real acceptance**: PostgreSQL 17 workflow tests priority CHECK values, two-account RLS, active-project rejection, orphan Storage-object guard, revision cleanup and account isolation. Node tests exercise focus grouping/sorting and both backup formats.

## Security & limitations

- **Irreversible deletion**: Deleted project tasks, notes, links, revisions and recorded activity cannot be recovered without a previously downloaded project backup. Neither metadata-only nor v2 project backups include historical revisions or audit history.
- **Private files are never removed by raw SQL**. This RPC refuses to delete when any file is present, including unregistered Storage objects. Existing Storage policy already blocks uploads to archived projects, reducing races. Operators should test concurrent upload/archive sequences in staging.
- A project still containing private files **cannot** be permanently deleted. To delete it, restore and remove the private files using the authenticated Storage flow, then rearchive.
- Cross-project focus results derive from actual authenticated RLS queries, limited by the existing 5,000-row library cap. No fake priority scores, reminders, pushes, calendars, AI service or paid API are added.
- Priority does not retroactively alter existing due dates. Unset historical task priority is the server default `normal`.
- Account-global activity history stays on the separate limited feed (not a complete audit export).

## Review and deployment gates

1. Confirm Phase 1, Phase 2 and Phase 5 migrations have been reviewed and applied to the intended staging project.
2. Apply `supabase/migrations/20261124030000_workspace_task_priorities_and_safe_purge.sql` in staging, *after* those migrations. Inspect function owner, GRANTs, RLS behavior and Storage policy assumptions before production rollout.
3. Run `npm test`, `npm run build`, browser CI and the network-isolated PostgreSQL acceptance workflow.
4. Test with two real accounts: create/edit tasks at each priority, v1/v2 export-import, sorting, global focus actions, and archived-project read-only controls.
5. Add an unregistered file to a project, archive it, attempt deletion: should be refused. Restore, remove the object via Storage API, archive, then delete; verify byte cleanup and no cross-owner data loss.
6. Confirm project quota slot becomes available after successful purge and that the user cannot bypass ownership by invoking the RPC with someone else's UUID.
7. Test long task names, accessibility, keyboard controls, responsive layouts and slow network retries.

**Not included:** automatic recurring backups, deleting projects containing files, full historical revision export, collaboration, webhook notifications and distributed reminders.
