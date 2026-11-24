# Developer Studio — Hosted Staging Acceptance

This procedure applies only to the public Developer Studio Project Lab. It does not validate ETERNYX authentication, Supabase policies, payment processing, or production safety.

## Before dispatch

1. Publish the exact, approved GitHub main revision to a separate HTTPS staging host whose hostname contains a stage or staging DNS label. Never use the production domain.
2. Ensure the hosting build serves /release-info.json with the existing ETERNYX Vite manifest. The document must expose a meta tag named eternyx-build-id, and the JavaScript bootstrap must set the data-eternyx-build-id attribute on the HTML root.
3. In GitHub repository Settings → Secrets and variables → Actions → Variables, configure DEVELOPER_STAGING_ORIGIN to the canonical https:// approved staging origin (without path, port, credentials, query or fragment), and DEVELOPER_STAGING_HOST to its exact hostname.
4. Confirm staging is disposable and public Project Lab is suitable for synthetic browser-local tests. No customer credentials or private source files are supplied.
5. Run the Developer Studio staging Chrome acceptance (manual, read-only) workflow on main, selecting RUN_DEVELOPER_STAGING_READ_ONLY. The NOT_APPROVED option prevents execution.

## What the workflow actually verifies

- Real Chrome at 390 × 844 and 1440 × 900, with seven Project Lab journeys each: create/save, editing, JS preflight, sandbox preview, checksum backup recovery, project-linked API workbench local storage, and unsafe import rejection.
- Release identity before and after every viewport: public manifest build ID, HTML meta marker and JavaScript root marker must agree. Manifest's reported Git SHA must match the exact workflow checkout SHA. All four observations must show the same build ID.
- Browser network requests are restricted to GET/HEAD at the approved HTTPS host. Any attempted write is blocked and fails acceptance; cross-origin requests are blocked and counted.
- Browser JavaScript exceptions and failed same-host script/document responses fail the staging gate. These are reported only by category/status, not raw URLs, cookies, response bodies or error messages.
- All 14 journeys must pass, the evidence must be recent and complete, and it is uploaded even on failure.

**Limit:** Build markers are public, self-reported metadata, not cryptographic release signatures or independent supply-chain attestation. This workflow does NOT establish production readiness.

## Failure recovery

| Evidence symptom | Action |
| --- | --- |
| Variables missing or refused | Check the approved HTTPS origin and hostname. Never bypass protections with a production target. |
| Manifest or HTML/JS marker missing | Publish the ETERNYX Vite build; ensure the host serves JSON instead of HTML SPA fallback at /release-info.json. |
| Source SHA / build ID mismatch | Re-deploy the exact checked revision, resolve CDN caching, then run new manual acceptance. |
| Build ID changes during the run | Investigate rollout or inconsistent CDN caching; test a stable release. |
| JavaScript errors or asset HTTP failures | Fix failing modules/startup on staging, and rerun. |
| Attempted writes or blocked third-party requests | Investigate unintended client network activity. Do not weaken the same-origin gate to force a pass. |
| Missing or failed UI journey | Use the sanitized CI artifact's failing case ID/viewport, fix and rerun. |

The workflow never executes the project's API smoke GET against staging. It saves only synthetic configuration in disposable browser storage. Do not treat local CI as live staging proof.

**Release decision:** Successful staging Chrome acceptance is one input to release review. Protected backend, real accounts, Storage, RLS and providers require independent verification.

## Developer Studio 3.0 — required staging HTTPS response posture

For each public staging root navigation (before and after both screen sizes), the gate checks the actual HTTP response, not a hard-coded configuration claim: HTTP 200, text/html, HSTS max-age at least one year, X-Content-Type-Options nosniff, a restricted Referrer-Policy, an actual Content-Security-Policy header without unsafe-eval, and either DENY/SAMEORIGIN X-Frame-Options or a restrictive frame-ancestors policy (self/none). This strict public staging policy may require hosting configuration changes.

Only seven boolean classifications and HTTP status are saved per observation; raw CSP, HSTS, cookies, tokens, URLs, and header values do not appear in artifacts. Four fully passing observations are mandatory in staging. Failing a check means fix the staging **hosting headers** first; never weaken this gate to claim acceptance. If the service legitimately needs a more complex framing policy, review and explicitly update the policy and regression tests rather than bypass them.

Even after every public UI, provenance, and HTTPS control passes, the machine-readable release decision remains **HOLD_PRODUCTION**. Protected backend, authenticated roles, RLS, cloud provider integrations and production deployment are independently unverified.


## Developer Studio 4.0 — direct-route staging integrity

A root-page release manifest matching the checkout is **not sufficient** to prove the public Project Lab deep link works. The manual read-only staging run now checks the real `/developer-studio/project-lab` route *directly*, before and after each of the two supported viewports. This adds four independent deep-link observations without renaming or inflating the existing **14 Chrome journey results**.

Each observation requires all of the following from a real browser network navigation: HTTP **200**, an **HTML** response, an **exact same-origin HTTPS** deep-link URL, **no HTTP redirect** (including to sign-in), the rendered **Local Project Lab** heading after hydration, the **same HTML meta and client JavaScript build ID** seen on that viewport's root response, and **no controlling service worker** in the disposable context. Only status and fixed boolean classifications are saved; the report contains no private headers, source code, response content, raw URL, cookies or credentials.

The independent Node verifier rejects missing/duplicated or extra observation fields, wrong phases/viewports, non-boolean success claims, redirects, absent hydration, incorrect HTML/JS markers, service-worker control and any unexpected HTTP status. It checks the deep-link evidence in addition to the original root manifest and 14 UI journeys. Existing source-commit pinning, HTTPS security-header requirements, failed-resource detection and blocked POST/PUT/PATCH/DELETE behavior remain mandatory.

If the stage host loads `/` but redirects `/developer-studio/project-lab` to authentication or returns a 404, deploy the correct public SPA routing/fallback configuration before rerunning. If the deep link hydrates but shows a different build ID, investigate stale CDN assets or mismatched rollout; never downgrade the source match requirement. If a service worker is controlling the page, investigate the staging service worker and cache isolation before treating the run as accepted.

**This is a stronger hosted acceptance gate, not proof that staging was actually run.** No real staging domain, credentials or deployment was added by this phase. The workflow remains operator-dispatched, HTTPS-staging-only, and read-only; production and protected backend verification remain **NOT VERIFIED / HOLD_PRODUCTION**.
