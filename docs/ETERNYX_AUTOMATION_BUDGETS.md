# ETERNYX Automation Phase 2E — Webhook Budgets and Approval Privacy

## Implemented controls

Signed webhook owners can set real rolling 24-hour execution limits (1–30) and signed approval intake limits (1–40) per trigger, view measured server usage and clear resolved/expired approval audit records.

The only permitted integration scope is text_transform. This is enforced with a database CHECK constraint, not an advertised future capability. Existing webhooks can transform text through previously saved steps; no arbitrary scripts, external URLs, purchases, paid AI, or writes to third-party applications are enabled.

Default limits for existing triggers are 30 completed executions and 40 accepted signed approval submissions in a rolling 24-hour period. Stricter per-trigger settings are opt-in. Existing global limits remain: 30 completed cloud runs per account/24h, 40 accepted approval events per account/24h, and maximum 10 pending approvals.

The budget checks run under the same PostgreSQL per-owner advisory lock used for execution and approval, so concurrent requests cannot bypass the configured limits. Identical completed request-key replays do not consume another quota slot.

**These are resource/usage limits, not a monetary spending cap.** Additional infrastructure billing controls and gateway WAF protections remain necessary for expensive integrations. Malformed or invalid-signature traffic does not reach the authenticated usage quota: rate-limit that at the gateway.

## Privacy retention

- Encrypted approval input and nonce exist only while pending, up to 24 hours.
- Approving, rejecting or processing expiry irreversibly erases the encrypted payload and IV in the same SQL transaction as the decision.
- This migration scrubs earlier decided approvals from the previous version too.
- Resolved/expired metadata is eligible for deletion after seven days. Cleanup is **opportunistic**: owner inbox loading and new signed approved-mode intake trigger pruning; no background cron is installed, and physical deletion after exactly seven days is not guaranteed when the service is idle.
- An owner can explicitly clear all resolved/expired approval audit records now without deleting pending decisions or completed run history.
- The original run metadata stays separate in the private, owner-scoped execution history.
- A signed request has a five-minute timestamp validity window. Reused IDs remain deduplicated while their approval audit records are retained; after records are pruned, expired HMAC timestamps prevent an old request from re-entering.

## Deployment (not executed automatically)

1. Require successful GitHub build, Node tests, PostgreSQL acceptance and GitGuardian.
2. Apply the two migrations in order: 20261123010000_automation_budget_and_retention.sql followed by 20261123010100_automation_budgeted_rpcs.sql. Apply these only after the previous Automation migration sequence.
3. Deploy the updated automation-control and automation-webhook Edge Functions and frontend.
4. In staging, set execution limit to 1 and send two different signed requests. One executes and the other receives HTTP 429. Retrying the completed original event must be replay-safe.
5. Enable approval mode, limit intake to 1, and send two different signed events. One queues and the other gets 429. Approve or reject the first and check that its encrypted input columns are NULL in the trusted database.
6. Verify cross-account access failures, owner-only usage reporting, expired data cleanup and manual Clear resolved approval history.
7. Review hosting usage and external WAF traffic budgets before enabling any public rollout.

## Verification

- Run npm test and npm run build.
- Run the network-isolated PostgreSQL 17 workflow Automation Webhook Budgets and Retention SQL Acceptance.
- Verify owner isolation, replay behavior, per-trigger 24-hour budgets, payload erasure, seven-day opportunistic pruning, and that clearing approval history does not delete completed run metadata.

All scheduled workers remain disabled by default. This PR neither configures secrets nor deploys changes to production.
