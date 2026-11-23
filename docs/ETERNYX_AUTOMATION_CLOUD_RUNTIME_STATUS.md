# ETERNYX Automation Phase 2Y — Cloud Availability and Account-Scoped Failure Recovery

## Why this is necessary

The repository contains the Automation control plane, but a management
inventory of the connected Supabase project on November 23, 2026 listed only
three Automation-related functions, not \`automation-control\`, the inbound
\`automation-webhook\` or the \`automation-scheduler-worker\`. A read-only
database query also timed out. Neither GitHub merges nor passing CI can
certify that the production Automation backend is working.

Previous Phase 2X introduced a **separate opt-in staging harness**, not an
automatic deployment. This phase makes the actual user experience honest
and safe while server readiness is unresolved. It does not initiate a
staging run or change any hosting resource.

## Twelve improvements in one PR

1. **Visible capability state:** authenticated users see a neutral
   "Not checked for this session" status for the manual cloud API.
2. **Explicit user-initiated availability check:** "Check cloud & load
   workflows" uses only the existing authenticated \`list\` action.
3. **Source-backed success:** only a validated
   \`source: "authenticated_server"\` list marks the manual API as
   responding for the account. This does **not** verify schedule workers,
   webhooks, migrations or other integrations.
4. **Missing Edge gateway distinction:** a 404 on \`list\` indicates the
   manual API cannot be found for that environment. A 404 on an owned
   workflow action remains a resource error, not evidence of missing
   deployment.
5. **Auth/permission clarity:** 401 explains rejected session, 403
   explains missing permission; neither is misreported as missing code.
6. **Conflict/rate limit clarity:** 409 and 429 are distinct and cannot
   silently hide behind the generic cloud deployment warning.
7. **Backend/outage clarity:** 502/503/504 and network failures have
   dedicated, understandable, non-speculative messages.
8. **No potentially private backend error text:** the UI uses bounded,
   local error copy rather than arbitrary JSON response bodies or raw
   transport errors.
9. **Fail-closed stale cache handling:** a hard backend or auth failure
   clears saved workflows, history, selected workflow, server output and
   private preview receipts. No stale server data remains presented as
   current.
10. **Cross-account async isolation:** late responses from prior signed-in
    user IDs cannot overwrite freshly selected account workflows, output,
    history or UI notices. Busy state resets on account change.
11. **Idempotency-key isolation:** selecting or clearing workflows resets
    request keys so one saved workflow cannot accidentally reuse a
    prior workflow's pending run/preview key.
12. **Run-history privacy verification:** reject malformed/oversized,
    duplicate, unsafe or private raw-data history records rather than
    filtering and falsely presenting the remaining rows as complete.
    Tests cover error classification, privacy boundaries, route guards
    and local fallback messaging.

## What users can do today

The browser-only local Workflow Studio remains available without a Supabase
connection. Users can edit and run deterministic text workflows locally.
The **cloud** features are only available after their real backend is
deployed and an authenticated action confirms success; the status reflects
the manual API only.

No automatic polling or read-heavy health probes were introduced. The
status check is on demand. All identity-bound cloud state is reset when
the signed-in user changes. Existing per-action server permissions,
database RLS, workflow policies and quotas remain authoritative.

## Staging and release verification

1. Merge only with passing Node tests, build, release provenance,
   desktop/mobile acceptance and security checks.
2. In a separately approved staging project with the manual Automation
   API deployed, click the explicit status check. Verify a real list
   response, account isolation, create/save/run/history and error states.
3. Test against missing-function 404, backend database 503,
   invalid JWT 401, cross-owner 404, conflicting revision 409 and
   quota 429. A 404 list check must not be described as success.
4. Switch between two test users while requests are pending and verify
   no prior-account data or action result appears under the new account.
5. Verify an invalid history record yields an error, not an invented
   all-clear or success message.
6. Test local workflow execution while cloud is unavailable; local
   operations must still behave correctly.
7. Apply migrations or deploy functions only through a **separate
   explicit owner-approved rollout**. This PR does not touch the live
   database, Edge functions, schedules, cron or external integrations.

**Boundary:** This is user-facing runtime honesty and defensive UI logic,
not an end-to-end live staging test, operational observability service,
production deployment, or release authorization.
