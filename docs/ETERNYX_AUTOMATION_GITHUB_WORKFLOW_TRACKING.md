# ETERNYX Automation Phase 2H — Saved Workflow → GitHub Issue Draft + Live Tracking

## Purpose: real workflows that finish real work

This release connects the **existing deterministic, server-executed text workflow engine** to GitHub's previously implemented, owner-approved issue creation. It also lets the owner query GitHub for the **real, current open/closed state** of an issue that ETERNYX already confirmed creating.

**No automatic GitHub issue creation is introduced.** Running a text workflow saves an encrypted draft; the same owner must separately preview its actual output and explicitly approve the outbound issue write, exactly as in Phase 2G.

## Implemented, production-oriented improvements

1. **Saved-workflow source selector**: list only the signed-in owner's active workflows, with actual names and revisions returned from the database.
2. **Real execution in the Edge Function**: run the selected saved steps using ETERNYX's existing deterministic text transformation engine. The input limit is 2,000 UTF-8 bytes; resulting issue text must fit 1,000 UTF-8 bytes. There are no arbitrary scripts or network actions inside the workflow engine.
3. **Atomic workflow lineage and stale revisions**: a single private SQL operation checks owner, active workflow and exact current revision, then prepares the encrypted draft. Records source workflow UUID, revision and a server-keyed HMAC of the input; raw inputs and transformed text are NOT persisted in the run-history database. The existing 10 drafts/account/day and 3 pending approval limits continue to apply.
4. **Secret-pattern guard**: common pasted GitHub tokens, AWS-style access keys, bearer credentials, OpenAI-style keys and PEM private-key headers are blocked before saving a draft and rechecked at preview/approval. This is a defense-in-depth heuristic, **not a guarantee** that every secret or sensitive datum is recognized. The user must still review issue content and public/private repository access.
5. **No new auto-write permission**: approving a workflow-derived draft still requires a recent server-stamped owner preview, the same bound repository, an enabled fine-grained PAT connection with GitHub Issues: write, and the existing at-most-three write attempts per rolling 24 hours. The external POST remains one-way and cannot auto-retry an uncertain network result.
6. **Authenticated read-only live issue status**: for an already confirmed GitHub issue, an owner can click Fetch actual GitHub issue status. ETERNYX makes a fixed-host GET to GitHub's single-issue REST endpoint, verifies the issue number and URL, rejects PR responses, and records only the verified open/closed state and check timestamp.
7. **Independent 12-call/day readback budget**: Postgres issues a read receipt BEFORE every external GET, with a one-in-flight guard and idempotent retries. Failures count against the quota. This is in addition to the existing issue creation and public-repository inspection quotas, not a monetary spending cap.
8. **Private inspection receipt trail**: successful/failed status checks are recorded in a service-role-only RLS-protected table. The owner gets verified counts, not decorative dashboards. Read receipts older than seven days are eligible for opportunistic pruning when the owner loads status. There is no background cleanup daemon.
9. **Separate permission and audit boundaries**: only the connected repo can be tracked. A disabled write connection may still be used for an explicitly requested read-only status GET, but disconnection or changing repositories denies tracking of historical issues for the old repo. No GitHub token is returned to the client.
10. **Isolated security acceptance**: a dedicated network-isolated PostgreSQL 17 CI job covers two independent accounts, workflow-revision drift, encrypted draft provenance, preview-only behavior, readback idempotency, 12-call daily exhaustion, no cross-user status writes, and seven-day receipt cleanup; Node tests cover the actual transform engine, strict payload parser and fixed-destination GitHub adapter.

## What ETERNYX does NOT do

- This does not automatically issue GitHub writes when a workflow runs. The user explicitly approves after reviewing the generated draft.
- This is not a GitHub App OAuth installation workflow. Phase 2G fine-grained PATs remain the current mechanism; these must be scoped to exactly one authorized repository with Issues:write.
- No issue editing, closing, labeling, PR merge, code push, external script execution, paid AI, or cron job has been enabled.
- GitHub rate limits and Supabase hosting resources still apply. API-count limits do **not** guarantee a dollar-cost cap.
- The current issue status is only current **as of the last successful GitHub check**, not live-pushed events.

## Safe rollout

1. Review green checks: Node tests/build, browser acceptance, GitGuardian and isolated PostgreSQL database acceptance.
2. Apply migration 20261123040000_automation_github_workflow_tracking.sql **after** the previous Automation migrations, especially 20261122220000_automation_manual_control_plane.sql and 20261123030000_automation_github_issue_approvals.sql.
3. Redeploy JWT-protected automation-github-issues Edge Function and the new frontend. The previous dedicated AUTOMATION_GITHUB_WRITE_ENCRYPTION_KEY must remain configured securely.
4. In staging, save an active deterministic text workflow with known output, connect a fine-grained PAT for a disposable test repository, and enable issue writes. Create a workflow-derived draft; confirm no GitHub issue exists yet.
5. Preview the exact transformed output and destination; approve it once. Confirm GitHub's issue number and URL. A second approval must not create a duplicate issue.
6. Revisit the successful issue's audit card and click Fetch actual GitHub issue status; confirm open/closed and time come from GitHub. Repeat until 12 calls in a 24-hour window and verify a 429 quota response.
7. Try an old workflow revision, a different user, an expired draft and a changed repository. All must fail closed. Verify obvious secret-pattern rejection and stale-status display.
8. Monitor GitHub and Supabase usage. Do not deploy or configure production PATs or secrets via a chat.

CI command: node --test tests/automation-github-workflow-tracking.test.mjs and the repository's standard npm test/build pipeline.

**Source and tests are not production deployment.** No third-party write is performed merely by merging this PR.
