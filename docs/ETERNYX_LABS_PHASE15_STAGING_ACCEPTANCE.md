# ETERNYX LABS Phase 15 — Isolated staging read-only acceptance

This is an opt-in real staging acceptance workflow, not live deployment.
It uses two distinct authenticated test accounts in a non-production Supabase
project. It makes zero database writes, session reservations or flag submissions.

## Operator configuration

Create GitHub Environment eternyx-staging, add required reviewers, and set
variables ETERNYX_LABS_STAGING_REF and ETERNYX_LABS_PRODUCTION_REF.
Set protected secrets ETERNYX_LABS_STAGING_PUBLIC_KEY,
ETERNYX_LABS_STAGING_JWT_A, ETERNYX_LABS_STAGING_JWT_B.
JWTs must be fresh, unexpired access tokens from two different staging
accounts; never use production, service-role or customer credentials.
Manually dispatch the workflow with I_APPROVE_LABS_READONLY_STAGING.
No scheduled, push or pull_request event starts staging probes.

## Seven real-readonly checks

1. Enforce pinned staging/production separation and explicit approval.
2. Authenticate two distinct accounts through Auth /user.
3. Verify the real deployed CTF catalog and server-scoped progress for both.
4. Check provider readiness and session lists using production client parsers.
5. Demand 401/403 for unauthenticated Edge read-only requests.
6. If each test account has at least one solved CTF fixture, cross-query
   its row with the other user and require zero results. Otherwise isolation
   is reported NOT TESTED and is never claimed proven.
7. Require TLS, no redirects, bounded response streams, JSON MIME,
   no-store Edge responses and strict fixed action allowlists.

Use node scripts/labs-staging-readonly.mjs --explain for offline guidance.
Use --check-config to inspect approval/project/tokens without network.
Use --run only against operator-approved isolated staging.
All successful reports omit JWTs, account IDs, raw payloads, private rows,
flag material and provider targets. Failed checks print sanitized codes.

Pre-existing staging migrations, functions and test fixtures must be
separately deployed. This workflow neither deploys nor repairs them.
Even a green report does not authorize production release or prove
isolated hosted cyber range/cloud ingress/microVM runtime safety.
