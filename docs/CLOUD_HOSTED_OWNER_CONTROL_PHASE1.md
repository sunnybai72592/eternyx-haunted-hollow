# Cloud & Integrations — Phase 1: real authenticated hosted owner governance

**Audit baseline:** Cloud & Integrations was ~35% complete, primarily static UI and local Docker/Kubernetes inventory. The authenticated Docker Edge Function backend already has a bounded account-owned enrollment list and operation/incident/dispatch-review list, but the primary `/integrations` Cloud page did not use them.

This PR connects a **real Cloud control center** to those existing owner-scoped authenticated records. It does **not** create real hosted compute resources, provision a cluster, deploy additional Edge Functions, supply cloud credentials, change access rules, enable live Docker execution, or contact production.

## Delivered in this PR

1. **Hosted account records instead of placeholders:** `/integrations` now calls the deployed `docker-enrollment` and `docker-control` Edge Functions' exact `{"action":"list"}` requests, using the existing authenticated Supabase browser session. Both endpoints already enforce `verifiedDockerOwnerId` and `owner_id`-scoped database reads, and issue no Docker execution calls.
2. **Real cloud governance visibility:** account workspaces and enrolled identities, recent agent-reported engine availability and container counts, operation review requests, incident counts and escalations, reconciliation/receipt-pending counts, owner policy state and the review-plan daily limit. The daily limit is explicitly labelled **review plans**, **not** a cloud-compute quota, wallet, subscription or bill.
3. **Fail-closed account separation:** no requests for signed-out visitors; validate the current authenticated account before and after both backend calls; cancel/ignore out-of-order results with a request serial; never render a result associated with a previous signed-in owner after switching accounts. The dashboard never combines unknown tenant IDs or accepts cross-owner agent references.
4. **No fake live connection:** invalid, missing, stale or contradictory owner data produces a clear unavailable state, not demo counts. Data is a bounded server snapshot; a recent signed agent observation is not a live Engine proof. The UI distinguishes hosted governance from the existing **browser-only** local Docker/Kubernetes import.
5. **Operationally useful UX:** responsive account-specific status cards; manually refreshable recent records; return-to-tab revalidation after two minutes; incident hold and reconciliation warnings; direct paths to existing protected Docker enrollment/operation-review pages. No cloud secrets, raw Docker sockets, SSH connection strings or provider credentials are sent.
6. **Truthful cloud tooling:** the separate Cloud Solutions simulation no longer announces successful live deployments or manufactures fake resource URLs. Its hard-coded cost table is explicitly labelled illustrative rather than real, region-specific or billable provider pricing.
7. **Reproducible offline tests:** independent synthetic owner A/owner B records, malformed payloads, cross-tenant joins, stale/revoked signed reports, out-of-bounds/contradictory counts, identity-switch and source wiring checks. Tests assert the Cloud page's requests are **list-only** and that both existing backend handlers require the original authenticated owner guard. All existing repository tests and browser acceptance remain CI merge gates.

## Hosted staging acceptance — NOT yet carried out by code merge

Cloud UI is functional only when the corresponding owner-authenticated Docker Edge Functions and database migrations are deployed and reachable in the target environment. **CI alone does not prove this is already true on your hosted site.** In independently approved ETERNYX Staging (never production), complete:

- Confirm `docker-control` and `docker-enrollment` are deployed to the **correct staging project** with the intended migrations and RLS. Production remains unchanged.
- Sign in to two **distinct pre-existing disposable staging users** (owner A, owner B); use independently seeded workspace/agent/operation/incident fixtures.
- Run the existing read-only `scripts/docker-hosted-auth-probe.mjs` against the **pinned staging origin** with two distinct user access JWTs and the **publishable** project key. It must reject anonymous and invalid credentials, observe no overlapping owner-bound workspace/agent/incident/operation IDs, and never contact production. Follow `docs/DOCKER_HOSTED_STAGING_AUTH_PROBE.md`; no secrets go to chat or GitHub.
- Open `/integrations` for owner A, inspect real owner records, sign out, then sign in as owner B without reloading the page: A's data must disappear immediately. Test an expired token, denied backend, mobile viewport, tab return and transient network outage. Invalid or stale data must never show green, and no Docker mutations should occur.
- Independently verify owner A/B RLS at DB and Edge Function levels, then manually approve staged frontend promotion. None of these checks are automatically accomplished by a passing PR.

## Actual remaining release gates

**Not delivered:** real hosted Docker/Kubernetes controller, trusted isolated worker/daemon, automatic provisioning, per-user resource quotas and independent resource-metered billing, approved cloud provider credentials and token rotation, remote lifecycle execution/monitoring/teardown, Kubernetes namespace/account isolation, real-host crash/receipt/permit-revocation tests, physical-host acceptance and production approvals.

This is a **working hosted governance view over existing real backend records, not an operational cloud provider**. It is a meaningful step beyond the original local-only Cloud page, but does not justify claiming the pillar is already launch-ready. Any movement toward live container execution requires *separate* authorization for the isolated staging host, nonproduction credentials, cost ceilings, real fault drills and independent security signoff.
