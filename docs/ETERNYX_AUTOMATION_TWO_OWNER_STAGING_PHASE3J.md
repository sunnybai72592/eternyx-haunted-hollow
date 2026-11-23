# ETERNYX Automation Phase 3J — two real staging accounts, owner isolation and bounded cleanup

**No remote account tests, database writes, deployments, or paid project
creation were triggered by this PR.** PR #615 is merged. At inspection,
Supabase still lists **only the ETERNYX production project**
\`wcncuarekaofmfurbtbh\` and no independent staging branch. The live
production migration-history listing has continued to time out. This
PR prepares the **next genuinely meaningful gate** once isolated
staging is separately approved.

## What the new protected workflow actually tests

The workflow
**Automation isolated staging two-real-account HTTP acceptance**
provides two independently selected modes:

**INSPECT_ONLY (default)** checks two real nonanonymous Supabase Auth
users by \`GET /auth/v1/user\`, then calls the real staging
\`automation-control\` function to list workflows and read execution
history for both users. It verifies neither owner's workflow/run IDs
are visible to the other. It performs **zero workflow mutations**.

**ONE_TEMPORARY_WORKFLOW** additionally requires the separate exact
write acknowledgment
\`I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN\`. Only after an independently
confirmed project and a successful inspect-only pass, it:

1. Saves **one synthetic local-text workflow** as test owner A,
   with a uniquely named temporary workflow record.
2. Proves owner A can see that workflow while owner B cannot.
3. Runs one entirely local string-processing workflow manually.
4. Confirms output matches the same deterministic local workflow engine,
   without any arbitrary URL, remote provider or external action.
5. Replays the **same** idempotency request and proves the original run
   ID is returned without creating a second run.
6. Attempts owner B's run of A's workflow and requires a 404.
7. Verifies owner-scoped, private persisted run history without
   raw-input/output leakage.
8. Deletes the temporary workflow and confirms it is no longer listed.

**Important:** deleting the workflow does **not** necessarily erase
the retained run/audit history. The approval prompt and sanitized
receipt explicitly disclose this. A failed run also triggers
best-effort cleanup; if a save was committed but its HTTP response
was lost, the test looks for **one exact, newly created, owner-A
workflow matching the synthetic name**, then deletes only that record.
If more than one new record matches, it stops and requests human
investigation rather than deleting ambiguous data.

## Safety and validation improvements

- Real **main-branch-only**, \`workflow_dispatch\`-only and protected
  \`automation-staging\` environment, with two distinct selections
  for account review and write authorization.
- The known production Supabase ref is hard-denied in both the
  staging-gate script and acceptance client, even if someone tries to
  spoof a different declared production ref.
- The Management API performs read-only GET checks of the target's
  **organization**, exact project identity, \`ACTIVE_HEALTHY\` status,
  and all three active core function versions/JWT policies **before
  staging Auth JWTs are exposed to an execution step**.
- Both real staging JWTs must identify two **different, nonanonymous**
  users through Supabase Auth. The checks cannot silently substitute
  fabricated owner metadata or a service-role key.
- The staging Auth token and public API key enter only the inspection
  and explicitly write-authorized workflow steps. They must never
  appear in the final evidence, PR body or logs.
- The JSON response parser is now **stream-bounded by bytes** (120 KiB
  maximum), rejects malformed Content-Length, invalid UTF-8 and
  oversized chunked responses, and cancels a remaining stream.
- The client uses fixed staging HTTPS Auth and function paths,
  12-second request timeouts, no redirects, and \`no-store\`.
- No webhook signatures, scheduler ticks, paid APIs, cross-project
  writes, production credentials, CI-triggered hosted tests, migration
  repair or function deployment is allowed by this acceptance.
- Two separate offline test tracks exercise adversarial save/cleanup
  outcomes and the actual inspector against a **local HTTP server**.
- Only a sanitized mode/result record is published. A green
  read-only inspection is **not** evidence of manual workflow execution;
  neither mode authorizes production release.

## Prerequisites before manually dispatching

1. Obtain separate authorization (including any Supabase staging
   project/branch cost), create or connect an **isolated** Supabase
   staging project owned by the ETERNYX organization, and keep the
   production project entirely separate.
2. Verify isolated staging migration history and all required RLS/RPC
   contracts, then use the separately protected Phase 3H release to
   deploy the missing three core Automation Edge Functions **only to
   staging**. Its Phase 3I negative authorization checks must pass.
3. Configure GitHub Settings → Environments →
   \`automation-staging\`, including **required reviewers** and
   restricting branch access to \`main\`. These settings must be
   manually configured; the PR cannot create them.
4. Configure environment **variables**:
   \`ETERNYX_AUTOMATION_STAGING_REF\` and
   \`ETERNYX_AUTOMATION_STAGING_PUBLISHABLE_KEY\` (the staging-only
   public key, not a service role or secret key).
5. Configure environment **secrets**:
   \`ETERNYX_AUTOMATION_STAGING_MANAGEMENT_TOKEN\`,
   \`ETERNYX_AUTOMATION_STAGING_OWNER_A_JWT\`, and
   \`ETERNYX_AUTOMATION_STAGING_OWNER_B_JWT\`.
   The JWTs must be short-lived access tokens from two **dedicated
   separate test accounts in staging**, not production users.
   Never paste their values into chat, a PR, a comment or logs.

The same protected environment also holds the stage-specific DB
credentials and CA from Phase 3H; this workflow does **not** use
those credentials or perform SQL directly.

## Execution

GitHub → Actions → **Automation isolated staging two-real-account HTTP
acceptance** → Run workflow on **main**.

To inspect only, choose \`INSPECT_ONLY\` and mark staging test accounts
reviewed; leave write approval \`NOT_APPROVED\`.

For the bounded temporary workflow, choose \`ONE_TEMPORARY_WORKFLOW\`,
mark the test accounts reviewed, and separately select
\`I_AUTHORIZE_ONE_ISOLATED_STAGING_RUN\`. Approval of workflow code
merging does **not** authorize this staging write.

Review only the
\`eternyx-automation-two-owner-<run>-<attempt>\` artifact. It has
outcome booleans, never raw personal records or credentials. If a
cleanup or isolation test fails, halt and investigate the synthetic
staging records. Do not blindly retry an ambiguous save.

The release still remains staging-only. Real signed webhook
execution and worker schedule ticks are **not** executed by this
workflow, and production readiness remains false even after it passes.
