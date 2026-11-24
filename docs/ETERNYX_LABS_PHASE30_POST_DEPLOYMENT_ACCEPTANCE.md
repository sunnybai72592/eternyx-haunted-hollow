# LABS Phase 30 — post-deployment acceptance

Actual management inventory re-observed on 2026-11-24 in Eternyx Staging
(mhodwvypfbxafamkrgsk): all five LABS functions ACTIVE. ctf-verified and
ctf-range-control version 6, JWT true; ctf-range-access version 1, JWT
true; ctf-range-worker and ctf-range-access-check version 1, JWT false.
The Phase 29 deployment read back 15/15 matching local source file copies.
The prior Phase 27 report is a historical observation, not current inventory.

Read-only database observation: zero Auth users, verified solves, sessions,
access grants and spend reservations; provider and spend settings disabled.
No changes to any live database, function, environment flag or production.
Direct HTTP attempt failed DNS resolution before reaching staging.

After merge, use Actions > LABS dormant staging HTTP acceptance > Run
workflow on main and select I_APPROVE_LABS_DORMANT_HTTP_CHECK. No credentials
are necessary. This sends five fixed requests, with only empty JSON
objects on POST. It requires exact worker/proxy method and dormant
responses, no-store headers, bounded JSON, no redirects. The issuance
endpoint must reject unauthenticated requests; this is not authenticated
lock proof. No retries or mutations are intended. Manual workflow
execution is separate from PR CI, which uses injected responses only.

## Remaining critical path

Create two dedicated confirmed test accounts in staging Auth (not production).
Configure CTF_FLAG_SECRET (32+ random bytes, do not rotate an existing valid
secret unnecessarily). Configure the protected GitHub environment
eternyx-staging and these variables: ETERNYX_LABS_STAGING_REF and
ETERNYX_LABS_PRODUCTION_REF. Store ETERNYX_LABS_STAGING_PUBLIC_KEY,
ETERNYX_LABS_TEST_EMAIL_A/B and ETERNYX_LABS_TEST_PASSWORD_A/B as environment
secrets. Never use a service-role key for sign-in. Then run existing Phase 20
fresh Auth acceptance, separately approve Phase 21 solve lifecycle and
Phase 22 terminal fixtures. No real hardware or public hosted lab activation
is established by this phase. No paid infrastructure.
