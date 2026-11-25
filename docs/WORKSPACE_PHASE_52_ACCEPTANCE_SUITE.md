# Workspace Phase 52 — one-command real acceptance suite

PR #830 merged and CI passed. A fresh read-only staging query found 0 dedicated fixture Auth accounts, 0 team spaces, 0 team tasks and 0 private objects. No live Auth/Storage/WebSocket test is claimed. The Phase 51 provisioning runner must first execute in a trusted local environment.

The new suite requires the completed private receipt, exact staging project, explicit suite confirmation, distinct fixture scopes and all existing runner confirmations. It verifies Auth Admin-created app metadata markers, matching account IDs, exact three-member teams, outsider denial, and fresh synthetic task scope before mutations. It uses only the publishable key and four user sessions; no admin key is needed.

Run on Node 22 from a fresh merged checkout with dependencies installed:
1. Provision using the Phase 51 guide; keep the protected receipt outside the repository.
2. Set WORKSPACE_FIXTURE_SUITE_CONFIRM=RUN_DISPOSABLE_WORKSPACE_STAGING_ACCEPTANCE in the local environment.
3. Run `node --env-file=/absolute/path/workspace-fixtures.env scripts/workspace-staging-acceptance-suite.mjs --config-check`.
4. Run the same command with `--run`. Read, Storage hash/denial, owner/editor concurrency, automatic owner edit after four Realtime subscriptions are armed, then membership revocation. Stops at first failed stage. No browser coordination required for the Realtime edit. Revocation is last because it persists; the read-team task edit and test audit events also persist.
5. Share only sanitized pass/fail output, never receipt, credentials or keys. Do not retry partially mutated fixtures blindly. Authentication rate limits can block a run; no automatic retries or quota changes.

This suite does not verify disconnected-client recovery, browser UI, account recovery, migration provenance or production readiness. All results remain unverified until actually executed. No database or production changes in this PR.
