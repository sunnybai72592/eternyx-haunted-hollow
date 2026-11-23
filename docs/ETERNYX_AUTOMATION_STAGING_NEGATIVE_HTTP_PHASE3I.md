# ETERNYX Automation Phase 3I — Real staging HTTP authorization denials

**This PR performs no hosted deployment or network calls to Supabase.**
The connected account still has no isolated staging branch or separate
staging project. A protected, owner-approved workflow is prepared for
later execution only after an independently authorized staging project
exists and the Phase 3H core Edge Functions are deployed there.

## The actual gap addressed

PR #605 added a protected release path for three absent Automation
functions and real PostgreSQL schema/RLS gates. A green Management API
function record does not prove the deployed HTTP endpoint rejects
unauthorized users, unsigned webhook traffic or worker requests.

This PR adds **five real HTTP negative authorization tests** and makes
them a required post-deploy stage of the existing protected release
workflow, plus a separately dispatchable staging security test.

## Five requests, no valid credentials and no execution

| Check | Method and resource | Safe request | Required response |
|---|---|---|---|
| 1 | POST \`automation-control\` | \`{"action":"list"}\` without an Auth JWT or API key | 401/403 |
| 2 | GET \`automation-webhook\` | No signed request or body | 405 |
| 3 | POST \`automation-webhook\` | \`{}\` without signature, trigger or timestamp | 400 |
| 4 | GET \`automation-scheduler-worker\` | No key or body | 405 |
| 5 | POST \`automation-scheduler-worker\` | \`{"action":"invalid_without_key"}\` with no worker key | 401 |

These requests cannot intentionally initiate a valid webhook execution,
save a workflow, approve a queued event or make a scheduler tick.
Unexpected 2xx success, 3xx redirect, 429, 5xx, an unavailable
webhook encryption key, malformed response or connection failure
**fails the release**. The protocol checks are purposefully strict:
a 503 from an unconfigured webhook function is not treated as a
passing unauthorized response.

## Ten substantive improvements

1. Strict known-production-ref denial with an explicit
   \`I_APPROVE_STAGING_NEGATIVE_HTTP\` consent token.
2. URLs constructed exclusively from the independently checked
   20-letter staging project ref; no arbitrary URL, path, IP, port
   or forwarded URL parameter can reach the client.
3. Only five fixed safe payloads: never any Authorization header,
   publishable/secret API key, webhook signature, scheduler key,
   cookie or client-supplied identity.
4. No redirects (\`redirect="error"\`), no credential forwarding,
   no caching, sequential bounded calls and a 6-second timeout.
5. Fail-closed expectations for each concrete HTTP method, response
   status, network/TLS exception, oversized body and redirect.
6. Response bodies are discarded after an enforced 2 KiB cap;
   never print a server response, confidential diagnostic or raw
   network error.
7. Strict allowlisted result artifact: function test IDs, HTTP status,
   pass flags, isolated staging ref and explicit \`productionReady=false\`.
   Successful negative tests do not prove valid authenticated flows.
8. Add the negative checks to the protected Phase 3H staging
   release workflow **after** the fresh deployed function/JWT inventory
   check; unexpected denial makes the release workflow fail.
9. Add a separate, *manual-only* \`automation-staging\` protected
   workflow. It uses a Management **GET** to independently verify
   stage project ownership/status and active JWT configuration
   before any HTTP call; no redeployment necessary.
10. Test the client against a **real local HTTP server**, including
    exact methods, header absence and payloads. Add adversarial tests
    for production impersonation, malicious responses, redirects,
    oversized responses, disabled webhook configuration, and denied
    network access. These tests run in normal PR CI with no hosted
    credentials or project mutations.

## Operator prerequisites

First establish a separately approved isolated Supabase staging
project and protected GitHub \`automation-staging\` Environment with
required reviewers, staging ref and a properly guarded staging
Management API read token. The existing Phase 3H release also requires
staging-only database credentials and a certificate CA for its
independent read-only SQL gates, and requires approval of migration
history/secret readiness. Nothing here creates staging or assumes the
live project's database migration history is known.

For repeat tests **after staging functions are deployed**:
GitHub Actions → **Automation isolated staging core negative-only HTTP
security** → Run workflow on **main** → select
\`I_APPROVE_STAGING_NEGATIVE_HTTP\`. The environment reviewer then
independently verifies the staging target and approves access.

For initial staging deployment, the Phase 3H protected staging release
workflow runs this same test automatically **after its own manual
approval, schema checks, function deployments and inventory gate**.
It has no production fallback.

## Limits

Passing these tests proves only **five deliberately unauthorized HTTP
requests are rejected**, on the exact tested staging deployment.
It is not a substitute for two-real-account authenticated acceptance,
webhook signed execution checks, worker schedule execution, database
audit integrity, production migration verification, or production
release authorization. Any failed postdeploy security check must
halt promotion; do not automatically retry, rollback blindly, or
activate public triggers or scheduled workers.

The live Supabase environment remains unchanged by this PR. No
secrets are exposed, no external providers or paid AI services
are invoked, and no production migration, project, webhook, job or
Edge Function is modified.
