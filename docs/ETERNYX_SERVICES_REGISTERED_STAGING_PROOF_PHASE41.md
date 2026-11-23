# ETERNYX Services Phase 41 — independently registered staging project identity

**No staging project is created. No new migration, SQL write, Auth login, paid resource, or production deployment.** This change prepares the Services release gate to verify a project actually exists and belongs to the expected Supabase organization, **before** the database audit and customer-account tests.

## Why this step matters

The existing Phase 31/36–40 release gate checks an operator-supplied `SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF` and URL, prohibits the known production project ref, connects through a dedicated least-privilege auditor, and inspects real history, 64 schema checks and defensive routine permissions.

An operator could still accidentally paste a project reference belonging to a different organization or region, or a paused/unknown project. A string shape and a read-only database connection do not independently prove an **actual Management API registration**.

**Phase 41 calls Supabase's official `GET /v1/projects/{ref}`** using the protected GitHub Environment credential, and requires a fresh response from `https://api.supabase.com`. Official API: https://supabase.com/docs/reference/api/v1-get-project (OAuth scope `projects:read`).

## Protect these four additional settings in GitHub

Under the **protected `services-staging` GitHub Environment**, configure these *after an authorized operator provisions a genuinely separate staging Supabase project*:

- Environment secret `SERVICES_STAGING_MANAGEMENT_API_TOKEN`: a Management API/OAuth access token with **only `projects:read` where supported**. A personal access token might have broader capabilities—store it as an environment secret and limit access to trusted operators. Never commit, print, log or forward it.
- Environment variable `SERVICES_STAGING_EXPECTED_ORG_SLUG`: exact Supabase organization slug containing the approved staging project (returned as `organization_slug` by the Management API).
- Environment variable `SERVICES_STAGING_EXPECTED_PROJECT_NAME`: exact expected human-readable staging project name, matched case-sensitively.
- Existing variable `SERVICES_STAGING_AUDIT_POOLER_HOST`: the region-specific Supavisor session-pooler host, e.g. `aws-0-us-east-1.pooler.supabase.com`. Its region code must match the Management API's `region`.

Existing protected settings are still required: explicit `READ_ONLY_STAGING_ACCEPTANCE` dispatch approval, `SERVICES_PREFLIGHT_EXPECTED_PROJECT_REF`, `SERVICES_PREFLIGHT_URL`, fresh operator evidence, and later the separate SQL auditor and A/B/Admin test accounts.

## Exact identity and security checks

1. The dispatch is explicitly approved and the project ref is a strict 20-character value **different from the existing linked production ref**; its Supabase URL matches the ref exactly.
2. The request URL is assembled internally and fixed to `https://api.supabase.com/v1/projects/{ref}`, with a single **GET** and no body, no redirects, no caching and an 8-second timeout. Neither environment variables nor API responses can override the API origin.
3. The Management API must respond **HTTP 200, JSON**, with a bounded payload. 401/403, 404, 429, unhealthy or unavailable projects, redirects, invalid JSON and oversize responses fail closed.
4. The API's `ref` must equal the configured staging ref; its `organization_slug` and `name` must equal the separately pinned values.
5. The project must be `ACTIVE_HEALTHY`, and the API's `region` must match the separately pinned session-pooler region.
6. The API-reported database host must be exactly `db.<staging-ref>.supabase.co`, preventing a mismatched managed project and database identity.
7. No token, raw project response, project ref, region, organization, HTTP diagnostic, or connection string is printed; the workflow receives only fixed pass/block codes and non-identifying booleans.

**Run order:** existing reviewed operator/collision evidence → **Phase 41 GET-only project registration proof** → PostgreSQL client setup → Phase 36–40 real read-only database proofs → `npm ci` → real-account Services A/B/admin/anonymous acceptance.

The entire gate runs only on a manually approved GitHub Actions environment. Pull-request CI tests use stubbed responses; they **do not** contact the Management API or require its credentials.

## What this does not establish

A matching project name does not prove the intended business purpose of a project or prove that a human-operated staging project is safe to use. Management API registration does not authenticate historically collided migration SQL contents. Project grants or metadata could change after the point-in-time check. The separate Phase 36 proof still reports `stagingProjectIndependentlyRegisteredByManagementApi:false` for **its individual database-only result**; Phase 41 is a separate preceding read-only Management API check, not a claim that the SQL-only proof itself performed one.

No staging project has been provisioned through this PR. The linked Supabase account previously surfaced only the current production-linked Eternyx project. The existing project's observed managed Services history had the first 11 named migrations but was missing Phase 13 amendments and Phase 14 journal. **Do not deploy those changes to production**. An authorized operator must provision and approve an independent staging project and reconcile overlapping historic versions and source SQL, then deploy reviewed staging schema in dependency order (**Phase 13 before Phase 14**). Finally perform protected **real-account staging** checks for customer A, customer B, admin and anonymous access.

Services is **not production-ready** because this new gate or its offline tests pass. Operators must separately approve actual staging and release signoff.
