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
