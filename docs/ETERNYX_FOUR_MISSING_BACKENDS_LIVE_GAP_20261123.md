# ETERNYX — Four missing cloud backends and actual live schema blockers

**Observed 23 November 2026.** This audit used authenticated, read-only
Supabase Management and PostgreSQL catalog queries on project
\`wcncuarekaofmfurbtbh\` ("Eternyx", active/healthy). No live writes or
hosted deployments were executed.

## Verified deployment state

Four Edge Function directories exist in the main repository but not in the
**ACTIVE** live function inventory:

| Function | Expected gateway JWT | Backing contract |
|---|---|---|
| \`automation-control\` | true | Owner-scoped workflows/runs and control-plane RPCs |
| \`automation-webhook\` | false | Signed webhook triggers, secure signing/encryption secrets, transactional run RPCs |
| \`automation-scheduler-worker\` | false | Leased scheduled runs, service-only key, AES-GCM encrypted schedule input/output, daily quotas |
| \`ctf-verified\` | true | User-specific verified flag artifact, RLS-protected solves, protected attempt quota and CTF_FLAG_SECRET |

The current live inventory still contains other functions such as
\`automation-schedule-control\`, \`automation-github-public\`, and
\`automation-github-issues\`. Their existence does **not** prove that
the corresponding schemas are present or that cloud workflows execute.

Read-only SQL returned:

- \`public.automation_workflows\`: absent
- \`public.automation_runs\`: absent
- \`public.automation_schedules\`: absent
- \`public.automation_webhook_triggers\`: absent
- \`public.ctf_verified_solves\`: absent
- \`public.ctf_claim_verification_attempt(uuid,text)\`: absent
- all \`public.automation_%\` and \`public.ctf_%\` user tables/RPCs
  counted in this inspection: **zero**

The migration journal is **accessible again** and contains version
entries through \`20261122213215\` (Services clarification
followthrough). It contains **no Automation or verified CTF
foundation migrations**. Earlier connection errors should not be
assumed resolved permanently without ongoing diagnostics.

This is a genuine production **database migration gap**, not simply
four Edge Function uploads. Deploying all four functions into the
present production state cannot make their services operational.

## What this PR implements

1. Add \`ctf-verified\` as the fourth member of the controlled
   missing-backend release manifest, alongside the three Automation
   functions, with SHA-256 source fingerprints.
2. Pin and assert the exact gateway JWT policies: \`true,false,false,true\`.
   Public webhook/worker routes are protected by independent
   application-level signed request/secret checks; never accept a
   browser JWT as permission to run a worker tick.
3. Inspect the actual CTF source for the user authentication gate and
   \`CTF_FLAG_SECRET\` dependency. **No flag secret is generated, read or
   uploaded by this PR.**
4. Add read-only PostgreSQL 17 catalog SQL to validate both required
   CTF tables, enabled tenant RLS on both, the rate-limit RPC and
   server-only RPC execution grants.
5. Prove verified solves can be selected by authenticated users only
   under a tenant-bound RLS policy and cannot be written by browser
   roles.
6. Reuse strict TLS \`verify-full\`, explicit staging project hostname
   binding, fresh temporary CA file, no inherited libpq host overrides,
   short timeouts and redacted error output for the CTF catalog.
7. Extend the **existing protected, main-only, manual-only** staging
   release to require a **third CTF secret review** before any deployment.
8. Require real read-only Automation **and** verified CTF schema
   catalogs and full staging migration-journal presence before uploads.
9. Deploy only the four named functions with explicit remote staging
   target. \`automation-control\` and \`ctf-verified\` retain JWT
   verification; \`automation-webhook\` and
   \`automation-scheduler-worker\` retain their independently signed
   request/secret authorization scheme.
10. Verify all **four** staged functions are ACTIVE with positive
    versions and the expected JWT modes after deployment.
11. Extend the offline network-isolated PostgreSQL 17 test to apply
    the real verified CTF migration and execute the actual catalog
    assertions against PostgreSQL; deliberately disable the CTF owner
    RLS bit and ensure the gate rejects it.
12. Add adversarial tests for missing/false RLS or RPCs, wrong auth
    policies, wrong project ownership, missing functions, malformed
    database evidence, and production-ref spoofing.

### What is NOT included

The connected Supabase account has **no approved, separate staging
project/branch**. No staging project was created, no production
migration applied, and **none of the four functions was deployed to
the production project** by this PR.

An Edge Function inventory entry alone is not production readiness.
The CTF signing secret and Automation encryption/worker keys must be
confirmed on the actual target by the authorized operator. Secret
values must never be pasted into GitHub PRs, chat, logs, or reports.

## Required next operational steps

1. Obtain cost and owner approval for a **separate, isolated Supabase
   staging project/branch**. Do not assume an existing healthy
   production project is safe to use as staging.
2. Review the 11 historical **duplicate migration version groups**
   from separate pillar branches. Version history alone cannot
   identify which file ran for a collided timestamp. Reconcile
   objects, ownership/RLS/grants and dependencies before migrations.
3. Apply the required CTF and Automation SQL foundations to the
   isolated staging schema with migration history review. The full
   Automation pillar includes far more than three SQL migrations;
   source completeness must match the runtime control RPCs.
4. Independently verify staged secrets and two real nonanonymous
   test accounts. The protected staging release workflow now includes
   four functions and distinct secret reviews.
5. Run negative-auth HTTP acceptance, then bounded two-owner
   authenticated acceptance and controlled scheduler/webhook tests on
   staging. Do not activate cron or public provider callbacks
   automatically.
6. Only after all staging evidence is green, prepare a separately
   reviewed production migration and function release. Include a
   tested rollback/cancellation strategy and monitor lease outcomes.
   Re-run a live read-only catalog and function inventory audit
   **before and after** any approved production change.

**Current status:** production lacks four Edge Functions **and**
the required database schema. This PR prepares guarded release
machinery and offline proof; it does not claim to have fixed live
production services. The live production schema must not be
modified merely to make a dashboard indicator green.
