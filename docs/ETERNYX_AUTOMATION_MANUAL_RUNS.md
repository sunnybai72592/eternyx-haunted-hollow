# ETERNYX Automation — authenticated manual control plane (Phase 2A)

This milestone adds an **optional** signed-in control plane to the existing working browser-only workflow builder.

## What works after deployment

- Save up to 20 owned deterministic workflows and load them across devices.
- Update, pause, resume, or delete saved workflows. Paused workflows cannot start new runs.
- Execute a saved workflow **on demand** in a Supabase Edge Function; the server reads the owner's current definition and recomputes results. The browser cannot forge the step trace or workflow identity.
- Show the latest 20 verified completed runs, counts, revision and step summary.
- Up to 30 completed manual runs per user per rolling 24 hours, transactionally enforced by PostgreSQL. A request UUID and SHA-256 fingerprint prevent changed-content idempotency replay.
- RLS + read-only grants for authenticated users; write/RPC access only to the privileged Edge Function after access token validation.
- Store counts and operation trace only. Raw input and output remain in the immediate response, not in durable run records. Account deletion cascades owned records; deleting a saved workflow retains ownership of the run metadata.
- The **offline browser workflow** still works if the backend is unavailable.

## Deliberately not enabled

**No recurring schedules, cron, inbound webhooks, outbound HTTP actions, provider credentials, arbitrary JavaScript, autonomous agents, payments, or billable AI.** The trigger_kind database field is constrained to manual. No background tasks exist in this PR.

A future release must implement a vetted allowlist, webhook signature verification, event retention, queue leases, replay defense, explicit approval gates, and cost controls before enabling external triggers.

## Deployment and verification

This PR does not apply migrations or deploy functions automatically to production. After review and green CI, deploy the committed migration and the **automation-control** Edge Function to the authorized project using the normal deployment flow. The UI reports unavailability when these are missing.

CI verification:
- node --test tests/automation-control.test.mjs tests/automation-workflow.test.mjs
- npm run build
- .github/workflows/automation-control-sql.yml runs the checked-in migration and SQL smoke test in network-isolated PostgreSQL 17.

Acceptance: two independent authenticated test accounts. Verify that a user can see and run only their own saved workflows, cannot write directly with the published browser key, cannot create an external action or schedule, and that history does not expose raw input/output. Test transport-failure retries with the same request key, a pause between UI load and execution, and the 30-per-day limit. Avoid entering credentials in workflow step literals.

Costs: Edge Function invocations and database reads/writes count toward hosting/plan quotas. This is not guaranteed zero cost even without a GPU or third-party AI API. Cloud calls are user-initiated only.
