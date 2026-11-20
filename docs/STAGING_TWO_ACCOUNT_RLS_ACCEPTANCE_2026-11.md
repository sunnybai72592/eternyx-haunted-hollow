# ETERNYX — Two-account Supabase RLS verification (staging only)

**Milestone:** November 20, 2026. Production data and payment settings remain unchanged.

## Why this exists

Our public Lovable site passed **34/34** anonymous/mobile/desktop browser journeys in GitHub Actions run [44794176203](https://github.com/sunnybai72592/eternyx-haunted-hollow/actions/runs/44794176203). We also reviewed RLS policies and security advisors read-only. Neither proves server-side ownership isolation after signing in.

This PR adds an **actual two-account, owner-approved staging test**. It cannot run merely because a PR is merged: you must first create a *separate* Supabase staging project, configure a protected GitHub environment, prepare two dedicated testing accounts and explicitly authorize synthetic fixture writes. No production or customer records are read, and no live changes have been run from this PR.

## What the test really checks

The runner uses the installed Supabase JavaScript client and **only the public publishable/anon key**. It never requests or uses service-role or admin keys. Both clients authenticate independently via password with local-only sessions; user identities are compared without logging IDs, emails, passwords or session tokens. Both accounts must return `false` from `is_admin()`.

For each of three private tables, the test creates two **synthetic, tagged rows**—one per staging test user:

| Table | Safe fixture | What is verified |
| --- | --- | --- |
| `conversation_sessions` | Private title only, no document | Own read, two-way cross-user read denial, anon denial, forged owner insert denial, cross-user update and delete denial |
| `chat_history` | Short text and role=user, no documents | Own read, two-way cross-user read denial, anon denial, forged owner insert denial, cross-user delete denial |
| `pentest_engagements` | Inert **draft** with empty targets and false attestation | Own read, two-way cross-user read denial, anon denial, forged owner insert denial, cross-user update and delete denial |

A fake engagement draft does **not** authorize or run any security scan. No AI model, file storage, billing, webhook, or external scanner is called.

The test also verifies that both staging accounts have a **private profile**. This is important: the real profiles policy intentionally allows public profiles to be viewed by other people. Tests must not mistakenly classify legitimate public-profile access as an RLS leak.

The script attempts cleanup using each fixture's own test-user credentials, while the sessions are still active. Cleanup failure marks the run **failed**. It then signs out both clients. An accidental RLS bypass is never reported as a passing test.

## Safe, explicit setup

1. Create a **new Supabase staging project** with a completely different project reference from ETERNYX production. Apply the relevant database schema/migrations in that staging project only. Do **not** clone production customer data.
2. Prepare exactly two dedicated, non-admin staging Auth users with password login and private profiles. Their email local parts must begin `rls-` (such as `rls-a@your-test-domain.example`, `rls-b@your-test-domain.example`) or include `+rls-`. Assign real, unique passwords of at least 12 characters; do not share them in chat or GitHub issues.
3. In GitHub repository **Settings → Environments**, create **`rls-staging`** and require a trusted reviewer before the job can run.
4. Add environment **variables** `ETERNYX_RLS_STAGING_REF` and `ETERNYX_RLS_PRODUCTION_REF`; both must be distinct, lowercase 20-character Supabase project references.
5. Add environment **secrets** `ETERNYX_RLS_STAGING_URL`, `ETERNYX_RLS_STAGING_PUBLISHABLE_KEY`, `ETERNYX_RLS_TEST_A_EMAIL`, `ETERNYX_RLS_TEST_A_PASSWORD`, `ETERNYX_RLS_TEST_B_EMAIL`, and `ETERNYX_RLS_TEST_B_PASSWORD`.
6. The staging URL must equal `https://<staging-ref>.supabase.co` exactly. The key must be a publishable key (`sb_publishable_...`) or a legacy JWT with `role=anon`. **Service role and secret keys are rejected.**
7. GitHub **Actions → ETERNYX staging two-account RLS acceptance → Run workflow**. Check the explicit **staging fixture writes approval** box and let the protected environment reviewer approve it.
8. Inspect the **sanitized** artifact `test-results/staging-rls-isolation.json` and logs. They contain only scenario identifiers, pass/fail, and cleanup result—not user data or secrets. Do not interpret a missing or failed run as verification.

The manual workflow never runs on push, pull request, merge, cron, or normal CI. It is **not wired to the connected production Supabase project**. Configuration rejects missing or identical production/staging refs, malformed HTTPS host, service-role credentials, non-dedicated accounts, and missing owner approval.

## What passes and what remains unverified

Passing the real, manually approved staging run is evidence that the **three tested staging tables** properly isolated two non-admin accounts with synthetic fixtures at that time. It is **not** proof of full production database isolation, real account login durability, server-side edge-function controls, private storage access, authenticated AI generation or billing.

A fail can indicate a missing staging migration, failed login, absent/private-profile setup, access-policy regression, or cleanup issue. Do not weaken RLS merely to make the test green; inspect the specific failing scenario using staging logs and schema first. Unknown failures remain **NOT verified**.

**Next after a green staging audit:** test private AI assets and storage policy ownership, then a separate production deployment acceptance with approved non-customer accounts and exact build/version evidence. Keep the 32-tool registry's production verification labels unchanged until those checks genuinely pass.

## Important operational safety

No production migrations, tables, Auth accounts, policies or secrets were modified to create this PR. The configured `rls-staging` environment and manual approval are prerequisites. Never use an existing customer account, production service role key, or production project in the test runner.
