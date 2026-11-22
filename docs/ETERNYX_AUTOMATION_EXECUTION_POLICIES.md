# ETERNYX Automation Phase 2J — Real Execution Policies and Trigger Readiness

This milestone provides owner-controlled policies that RESTRICT actual saved text workflow executions across manual, signed webhook, and scheduled channels. It also shows factual trigger/scheduler configuration instead of invented readiness scores.

## Ten functional improvements

1. **Per-workflow input and output caps:** max input characters (0–12,000) and output characters (0–30,000) are enforced by the shared PostgreSQL run recording transaction for every channel.
2. **Rolling daily budget:** 1–30 completed run records per workflow per 24h, separate from the pre-existing 30-per-account global run budget and the signed webhook submission budgets; shared owner advisory lock protects concurrent enforcement.
3. **Webhook channel denial:** signed webhook ingress checks policy before execution or approval intake; a database trigger blocks the final webhook run classification if the owner disabled this channel.
4. **Scheduled channel denial:** the scheduler worker checks policy before executing steps; a final database classification trigger rejects denied scheduled runs. Quota-limited scheduled tasks are deferred using the existing transactional defer RPC.
5. **Manual early preflight:** the owner-authenticated manual route checks actual input length and current quota before running the deterministic text engine; PostgreSQL enforces final input/output lengths during recording.
6. **Measured readiness:** owner-scoped DB function reports real workflow active/revision state, completed runs in the last 24h, actual enabled webhooks, approval-required webhooks, enabled schedules and global scheduler switch.
7. **Server configuration checks:** the Edge Function returns only whether required webhook, approval and scheduler secrets appear configured, never the secrets themselves. It does not claim that webhooks were delivered or the worker is currently online.
8. **Zero-execution policy preflight:** test manual/webhook/scheduled readiness against a particular input length without running a workflow, recording a run or executing an external action. Output length is explicitly marked not checked if not supplied.
9. **Owner-isolated policy editor:** saved workflow settings are updated through an authenticated Edge route, strict request parser and service-only PostgreSQL functions. RLS protects policy rows; no client writes directly to privileged tables.
10. **Network-isolated PostgreSQL acceptance and Node regressions:** validate two-owner isolation, real run caps, idempotent retries, denied trigger reclassification, paused workflows, truthful readiness, strict role grants and UI response validation.

## Safety and limitations

Policy defaults preserve the existing execution behavior until an owner tightens them. Allowing webhook/scheduled execution does NOT create, configure or enable a trigger; those remain independently authorized. A denial at the database classification step rolls back the completed run transaction; it does not kill or cancel all existing upstream traffic. These controls apply to deterministic Automation text runs, not paid provider APIs, GitHub issue writes or arbitrary network actions.

The dashboard does not prove webhook ingress connectivity, worker uptime or future availability. Global account and provider limits may still block an allowed policy. Request budgets are not guaranteed monetary spending caps. Do not paste credentials into any workflow input.

## Deployment — NOT performed by merging

1. Require green isolated PostgreSQL 17 acceptance, GitGuardian, Node utility tests, Vite build, release provenance and desktop/mobile browser acceptance.
2. Apply migration: supabase/migrations/20261123060000_automation_workflow_policies.sql after earlier Automation migrations.
3. Redeploy authenticated automation-control, signed automation-webhook, and the existing automation-scheduler-worker functions.
4. Publish the updated AutomationCloudPanel with AutomationWorkflowPolicyPanel.
5. Staging-test a workflow under two different accounts, input/output limits and the 24-hour run cap; verify rejected runs cannot be recorded through manual/webhook/scheduled routes. Test a disabled channel when an old signed trigger still exists.
6. Verify the readiness panel correctly shows disabled global scheduling and missing secrets as not ready. Preflight must not create any run rows. Verify output is still checked at final database commit.
7. Observe Supabase hosting usage and explicitly verify real deliveries separately. No new secret, paid GPU/API, cron worker or automatic GitHub write is introduced.

## Verification

Run node --test tests/automation-workflow-policy.test.mjs, the repository utility suite and npm run build. The dedicated workflow named Automation Workflow Policy and Trigger Readiness SQL Acceptance runs against network-isolated disposable PostgreSQL 17.
