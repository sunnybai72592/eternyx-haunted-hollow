# ETERNYX Services Phase 20 — Production Readiness Gate

## Goal

Stop mistaking successful GitHub CI or a Supabase project health label
for verified live service workflows. This release creates a deliberate,
auditable acceptance path for Services without adding new UI features,
mock work, paid AI APIs, new migrations, or service-table writes.

**This phase is not production-ready until both the schema audit and
real-account acceptance succeed on a correctly configured environment.**

## Real observed blocker (November 23, 2026)

The linked ETERNYX production project management API returned
ACTIVE_HEALTHY. Both the project SQL endpoint (even SELECT 1) and
migration history failed with **database connection timeout**.
Read-only aggregated logging (available through Supabase's logs API)
showed hundreds of statement-timeout messages in recent PostgreSQL
and PostgREST logs. That is a diagnostic clue, NOT proof of what caused
the management connection timeout or which query is responsible.

No Phase 13 or Phase 14 migration was applied in this release, nor was
their production presence verified. Avoid reapplying their DDL until
the managed migration history and actual catalog can be inspected.

## Nine connected improvements

1. **Manual staging release gate** via the GitHub Actions
   "Services staging acceptance (manual, real accounts)" workflow.
   It cannot execute on push/PR and requires explicit acknowledgment.
2. **Staging-only project targeting** with exact HTTPS host/project
   reference matching; the known ETERNYX production project is
   explicitly blocked from this fixture test.
3. **Safe credentials**: the script accepts only publishable/anonymous
   API keys. Secret/service-role tokens are rejected; password inputs
   are taken from a protected GitHub staging environment, never code.
4. **Actual authenticated identities**: two distinct customer
   accounts and one verified administrator use real Supabase Auth
   sessions, which can create Auth sessions as a side effect. No
   Service business records are created, updated, deleted or paid for.
5. **Meaningful owner/admin/anonymous boundary tests**: each customer
   must read their own known request and fail to read the other's;
   the verified admin must see both; anonymous access must reveal
   no request or journal records.
6. **Complete existing-workflow fixture tests**: actual persisted
   messages, scope memo and owner response, clarification and reply,
   owner brief amendment, admin-only triage, Phase 13 owner/admin
   queues, and Phase 14 activity journal are checked. Missing views,
   absent fixture history and API failures FAIL the gate.
7. **Bounded request lifetimes and secure reporting**: a 12-second
   per-request deadline, no raw SDK errors or record content printed,
   no contact emails, secrets, request IDs or downloaded DB exports.
8. **Independent read-only SQL catalog audit**: verifies actual table
   existence, RLS flags, invoker views, authenticated/anon grants,
   enabled amendment and clarification triggers, policy presence,
   and aggregated connection states.
9. **Offline regression coverage and documented rollout order**:
   config rejection, cross-owner leakage, missing journal, revoked
   admin, source-level no-write guarantees and CI contracts are
   covered without needing any real project credentials during PR CI.

## Required staging environment setup

Use a **separate nonproduction Supabase project** with reviewed
Services migrations installed. Do not create a paid staging project
without agreeing to the project costs. No additional project was
created or modified by this PR.

In GitHub Settings → Environments, create and protect an environment
named services-staging. Restrict who may approve deployments to it.

Environment variables (GitHub Actions vars):
- SERVICES_PREFLIGHT_URL: exact staging project HTTPS origin
- SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF: exact staging project ref
- SERVICES_PREFLIGHT_CUSTOMER_A_REQUEST_ID: existing A fixture UUID
- SERVICES_PREFLIGHT_CUSTOMER_B_REQUEST_ID: existing B fixture UUID

Environment secrets (GitHub Actions secrets):
- SERVICES_PREFLIGHT_PUBLISHABLE_KEY: staging public key only,
  never service_role or sb_secret
- SERVICES_PREFLIGHT_CUSTOMER_A_EMAIL / _PASSWORD
- SERVICES_PREFLIGHT_CUSTOMER_B_EMAIL / _PASSWORD
- SERVICES_PREFLIGHT_ADMIN_EMAIL / _PASSWORD

The three dedicated staging identities must be distinct and own/have
access to REAL saved records. Seed these **through normal authorized
staging UI workflows**, never by disabling RLS:

- Customer A owns request A; customer B owns request B; each has a
  recorded request-created event.
- Request A has a published scope memo AND a nonbinding customer
  response to some revision.
- Request A has a published clarification question and a saved owner
  answer to some question.
- Request A has a real brief amendment saved using the Phase 13 flow.
- Administrator has a private triage record for request A and can see
  requests A and B.
- Both requests have real entries visible in the Phase 14 unified
  journal. Fixture accounts must have no unintended extra privileges.

The script is intentionally strict: it does not invent fixtures,
write service data, auto-create new staging accounts, or silently
accept missing work as zero results.

## How to execute

1. Merge the Phase 20 PR after green ordinary CI.
2. Restore DB access and verify which migrations already exist.
   For missing reviewed changes, apply **Phase 13 before Phase 14**
   using the supported migration procedure, then verify every grant,
   RLS rule, and server-owned trigger.
3. On the staging database, execute the SELECT-only SQL file:
   docs/sql/eternyx/services-phase20-readonly-schema-check.sql
   through the Supabase SQL Editor. Check each returned field,
   not merely whether the SQL command ran successfully.
4. Configure the protected GitHub services-staging environment
   with the separate project ref and three dedicated test accounts.
5. GitHub → Actions → Services staging acceptance (manual, real accounts)
   → Run workflow → select READ_ONLY_STAGING_ACCEPTANCE.
6. Inspect named PASS/FAIL checks. Do not force a green result by
   loosening roles or changing customer identities.
7. Repeat key workflows manually on desktop and mobile, with
   customer A, customer B and the administrator. Recheck after any
   migration/grant/role changes.
8. Inspect the production database separately via catalog and
   migration history before production release. A passing staging
   gate does NOT deploy Phase 13 or Phase 14 to production.

## Fail-closed / operational rules

- A missing query, connection timeout, incorrect owner, anonymous
  visibility, absent real event, missing invoker view, disabled
  trigger or unverified administrator role **blocks release**.
- There is no skip-on-failure flag, no automatic DB mutation,
  no privileged service key, no sweeping data export, and no
  background monitoring or recurring execution.
- The preflight logs named assertions only. Auth sessions are
  created by sign-in; that is not a mutation of Services business
  data. Use isolated test credentials and rotate if needed.
- PostgreSQL performance and connection metrics should be
  investigated by operators using Supabase's Database/Logs dashboard
  and supported tooling. Never terminate arbitrary sessions or
  change connection pool settings without confirming the root cause.
- The new Data API grants behavior introduced by Supabase in 2026
  must be checked against actual table GRANTs and exposed schemas.
  Exposed read-only views must be security_invoker=true and deny
  anonymous access to private customer history.

## Definition of done

A release candidate passes only when all these hold:

- Correct environment and real app version verified.
- Phase 13/14 catalog, migration history, and trigger checks verified.
- A/B/Admin staging workflow succeeds on real existing records.
- Anonymous cannot read personal requests or journal history.
- Customer A and B cannot access each other's data via direct URLs
  or underlying Data API requests.
- Administrator can read authorized records, but ordinary customers
  cannot read private triage.
- Desktop/mobile signed-in journeys, client errors and state cleanup
  are verified manually.
- CI passes without suppressing failures, and migration/incident
  observations are documented in the release notes.

This is a service enquiry and feasibility-review product.
**No read receipts**, paid checkout, contract acceptance, delivery
guarantees, automatic work execution or security-testing authority
is granted by a successful test.
