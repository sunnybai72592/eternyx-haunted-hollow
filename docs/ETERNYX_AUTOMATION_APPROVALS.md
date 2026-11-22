# ETERNYX Automation Phase 2D — Signed Webhook Approval Inbox

## What is implemented

This release adds a **real optional owner-review gate** to the existing signed webhook runner. A registered trigger can be switched between:
- **Direct signed execution (existing default)** — a valid HMAC-signed request immediately executes the saved deterministic text workflow, as in Phase 2B.
- **Owner review required (opt-in)** — a valid HMAC-signed request is encrypted and queued, not executed. The authenticated account owner reviews the input and explicitly Approves & runs or Rejects it. No outbound system is contacted.

When Require owner review is enabled, a sender gets a 202 Accepted response with an approval ID, status and 24-hour expiry, instead of transformed output. The sender does not receive the encrypted input or output. The owner may later see the output in the authenticated approval response. A rejection records the decision but never executes the workflow.

## Safeguards

- Each request must still pass the Phase 2B timestamp, request UUID and HMAC-SHA256 exact-body signature verification before being stored.
- Inputs are encrypted using AES-256-GCM with a **separate server-only secret**; random nonce per request; no plaintext user payload in Postgres. Max 2,000 UTF-8 bytes for owner-review requests. The existing 12,000-character limit still applies to direct signed mode.
- The signed-in owner is identified by verified Supabase access token. Clients cannot supply userId, execution result, decision timestamps or arbitrary steps.
- Maximum 10 pending approvals per user at a time and 40 accepted approval submissions/user in a rolling 24-hour period. This protects the queue independently of the existing **30 completed cloud runs per account per 24 hours**.
- Approved execution uses the **saved** version of the text workflow. A workflow changed or paused after submission cannot execute the old request.
- The SQL approval transaction locks the owner's account, validates current trigger mode, key version, owner ID, approval state and expiry, then uses existing quota/replay-protected run recording. Parallel approvals cannot double-run the event.
- Rotated/deleted/disabled triggers cannot have old requests approved. Old request UUIDs with changed content return idempotency conflict.
- Requests expire after 24 hours. Their encrypted bytes and decisions remain in the private approval-audit table until later retention cleanup (not included here); the user can no longer preview or approve an expired request.
- The user interface requires viewing the original decrypted input before enabling its Approve & run button. This preview happens only for the verified owner.
- No arbitrary code, paid AI requests, outbound HTTP, external-write actions, privileged integration, cron registration or subscription enforcement is introduced. This is a real approval gate for deterministic text processing only.

## Production deployment is NOT automatic

1. Require successful GitHub CI, Node regressions, isolated PostgreSQL 17 acceptance, and review the trust boundaries before any production activation.
2. Ensure all Phase 2A–2C migrations and the existing signed webhook Edge Functions have already been applied/deployed to the intended environment.
3. Apply migration 20261123000000_automation_webhook_approvals.sql through the project's approved migration deployment procedure.
4. Generate **an independent random 32-byte key** outside code or chat, hex-encode it into 64 characters, and store it **only in Supabase Edge Function secrets** as AUTOMATION_APPROVAL_ENCRYPTION_KEY. Do not reuse the webhook signing master key or the scheduled-run encryption key. Back it up securely; losing it makes pending requests unreadable.
5. Deploy the updated automation-control (user JWT required) and automation-webhook (HMAC required; platform verify_jwt=false, verified inside the handler).
6. As an authenticated user, select Signed inbound webhook triggers, load triggers, then explicitly click Require owner review for an existing trigger. Approval policy remains **OFF by default** on all triggers for backward compatibility.
7. In staging, POST a signed event and verify that the 202 response reports executed=false and **no completed automation run** exists. Sign in as the owner, Load approval inbox, Review input and Approve & run. Confirm a single completed run is recorded and its output appears only in the authenticated result. Check Reject and 24-hour expiry paths.
8. Before public rollout, add or verify upstream rate limits for invalid HMAC floods and review Supabase Edge/database hosting quotas. This PR caps accepted authenticated submissions, but does not add a general public WAF.

## Tests

Run:
- npm test (includes tests/automation-webhook-approvals.test.mjs)
- npm run build
- Automation Signed Webhook Approvals SQL Acceptance on disposable PostgreSQL 17.

Adversarial scenarios: cross-account preview/approve/reject and policy toggles, forged/expired HMAC, repeat request key with changed body, old signing key after rotation, workflow change or pause between submission and review, concurrent approve clicks, 10-pending and 40/day intake caps, daily execution quota exhaustion, missing encryption key, and expired approval preview.

## Costs and boundaries

All approval operations are explicitly user-triggered, except incoming signed events submitted by an external service. Storage and Edge calls still count toward the hosting provider's usage quotas even though this milestone requires no GPU, paid AI or general-purpose job worker. In review mode, no text workflow runs before owner approval. No money is automatically charged or third-party purchase made by these approvals.

ETERNYX Automation remains a quality-first deterministic text engine. Future approval-gated external integrations must implement destination allowlists, authorization scopes, SSRF protections, provider billing caps and redacted audit trails separately; this PR **does not** imply those external actions already exist.
