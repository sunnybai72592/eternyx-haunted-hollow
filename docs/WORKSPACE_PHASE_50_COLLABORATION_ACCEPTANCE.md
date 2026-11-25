# Workspace Phase 50 — real collaboration acceptance prerequisites

November 25, 2026: PRs #793 and #823 confirmed merged. The 14 deployed migrations and previous catalog receipt are recorded in Phase 49. A fresh read-only staging aggregate query found zero Workspace team spaces, members, tasks, personal projects and private objects. No live user acceptance was possible yet. No fixture creation or database mutation was performed in this phase.

## Runner improvements
- Correct negative membership/read-cursor probes to use actual composite-key columns.
- Realtime delivery requires all four control channels to remain healthy throughout the observation; a disconnected outsider cannot create false evidence of denial.
- Existing approved disposable write-role runner now races owner and editor edits on the same version, requires exactly one UUID success and the exact stale-version conflict from the other request, checks persisted convergence for owner/editor/viewer and the unique server-authored event. Cleanup recognizes only the test's original and two candidate titles for its known UUID.
- Regression tests cover failure receipts and source wiring. No simulated test is treated as live evidence.

## Dedicated staging fixture setup
Use four new, nonproduction email/password accounts, no production identities or credentials. Through the staging UI or approved Auth provisioning, create the read-only acceptance team with owner/editor/viewer and an uninvited outsider, one task, comment and checklist. Add an owner-private project/task/note and a harmless private text file via the normal Storage upload flow (record its SHA-256). Create separate empty three-member teams with the exact names from WRITE_PROBE_SPACE_NAME and REVOCATION_TEAM_NAME; the revocation runner deliberately removes the editor from its own disposable team. Keep credentials in a local protected environment, never in Git or chat. No deletion of real users, no account recovery operation on existing accounts.

Run the existing config and acceptance commands in package.json: workspace:staging:acceptance, workspace:staging:write, workspace:staging:realtime, workspace:staging:storage, workspace:staging:revoke, with their explicit required consent and fixture settings. Real Realtime reconnection, upload negative paths, deletion/recovery, hosted desktop/mobile acceptance, cross-pillar artifact integration and migration version reconciliation remain separate gates. No production signoff.
