# ETERNYX Automation — Scheduled Runs (Phase 2C)

## Implemented capabilities

- Up to 3 saved scheduled text workflows per account, at hourly / daily / weekly UTC intervals.
- AES-256-GCM encrypted static input at rest, maximum 2,000 UTF-8 bytes; no input plaintext stored in run history.
- Encrypted per-run output available only to the signed-in owner for seven days, maximum 8,000 UTF-8 bytes.
- Trusted scheduler worker can claim at most two due jobs per call and two simultaneous leases globally, with 90-second lease fencing and three retry attempts before disabling a failing schedule.
- Pausing, editing or deleting a schedule fences existing leases. Quota exhaustion defers work without consuming the three retry attempts.
- Server-enforced per-account 30 completed cloud runs per 24h applies equally to manual, signed-webhook and scheduled workflows.
- Timestamped run history identifies scheduled executions; raw output is never saved in the general metadata log.
- Both the private scheduler operator switch and every individual schedule start DISABLED.
- Browser-only Automation and manually initiated cloud runs keep working regardless of scheduler availability.

No automatic cron job, paid AI provider, GPU, arbitrary code, outbound HTTP action or privilege-granting external action is enabled by this PR.

## Deployment — operator authorization needed

Do not activate this in production before reviewing security, performance, and cost.

1. Require green Node tests, application build, and isolated PostgreSQL 17 acceptance job.
2. Apply the scheduled runs migration AFTER the manual Automation and signed webhook migrations.
3. Generate two independent 32-byte random secrets outside Git/ChatGPT and store each as 64 hexadecimal digits in Supabase Edge Function server secrets. Names:
   - AUTOMATION_SCHEDULE_ENCRYPTION_KEY (AES encryption; back up securely, losing it makes data unreadable)
   - AUTOMATION_SCHEDULER_WORKER_KEY (private worker authentication; never expose in frontend VITE variables)
4. Deploy automation-schedule-control with JWT validation enabled; deploy automation-scheduler-worker with verify_jwt=false. The worker authenticates via its own required private header.
5. In staging, save a schedule (initially disabled) and test two separate account identities.
6. Arrange a trusted server-only scheduler to invoke at most once/minute:

       POST https://YOUR_PROJECT.supabase.co/functions/v1/automation-scheduler-worker
       Content-Type: application/json
       x-eternyx-scheduler-key: PRIVATE_64_HEX_KEY

       {"action":"tick"}

   Keep the worker key inside a secrets manager. Do not log the key, body or encrypted contents.
7. After explicit operator approval, the private switch may be enabled in a privileged database session:

       UPDATE public.automation_scheduler_config
         SET enabled = true, updated_at = now()
         WHERE singleton_id = 1;

   This SQL is NOT run by this PR and no recurring job is created automatically. Disable the switch again to stop new claims.
8. Owners can enable individual schedules only when the operator gate and both secrets are configured. Monitor cloud compute/storage quotas.

Cloud function calls and database usage can cost money even without a GPU or third-party AI API. An every-minute tick is not cost-free by definition.

## Security and operational boundaries

- Private tables for scheduler config, schedules and encrypted outputs all have RLS enabled and deny anon/authenticated direct Data API privileges. Only authenticated Edge endpoints or the trusted worker use privileged service access.
- The browser cannot submit an arbitrary cron expression, raw SQL, URL, script, authorization claim, worker command or arbitrary external action.
- Concurrent claims are serialized in the database with advisory locks and SKIP LOCKED. Finished jobs atomically create an idempotent run record and encrypted output; expired leases are reclaimable.
- Pausing, editing or deleting a schedule revokes its outstanding lease. A saved workflow change between claim and completion is blocked by the existing revision check.
- Three repeated execution failures disable the schedule. Daily quota exhaustion merely defers it for one hour.
- UTC elapsed intervals skip missed slots rather than generating a backlog.
- Outputs are inaccessible to owners after seven days and pruned physically by subsequent worker ticks. If workers never tick, expired rows can remain physically stored until housekeeping resumes.
- Avoid placing credentials, API tokens or sensitive personal data in static scheduled inputs or workflow step literals. Only static input and output are encrypted here; existing workflow step definitions are not encrypted.
- Encryption master-key rotation requires an explicit re-encryption plan in a later milestone.

## Verification

Run npm test, npm run build, and the Automation Scheduled Worker SQL Acceptance workflow. Also test invalid worker key, cross-account lookups, two concurrent claim attempts, stale lease, paused schedule, quota deferral, encrypted output retrieval and expired output handling.
