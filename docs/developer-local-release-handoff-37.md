# Developer Studio 3.7 — Explicit local release review & evidence handoff

This phase upgrades the Project Lab with a deliberate, **fail-closed local review** that makes it easier to prepare for a separate hosted staging acceptance process. The implementation does **not** deploy, publish, execute user project code, upload source, send network requests, access credentials or claim that a production release is ready.

## Improvements bundled together

1. **On-demand multi-signal review:** The Run local release review button checks the actual current project. The engine reuses the existing real JavaScript parser-backed preflight, local test runner and dependency analyzer; it does not generate fake health scores or pass without running.
2. **Precise entry gate:** The required \`index.html\` must exist and contain non-whitespace text. A missing/empty entry is reported as a failure even when other project files exist.
3. **Explicit preflight and smoke gate:** Static diagnostics and genuine JavaScript syntax checks must have no errors, no warnings and no parser truncation; the two **default** local entry assertions must pass. The editable custom test suite is **not** silently substituted, changed, saved or executed by this panel.
4. **Dependency and compatibility gate:** Unsupported/missing/miscased references, possible literal JS/CSS import cycles and known restricted-preview incompatibilities are separately visible. The preview's current link/import limitations are not represented as working runtime imports.
5. **Readable local file/line findings:** Findings from parser, preflight and the reference graph appear alongside source-file and line navigation. The bounded list can switch between errors and all findings; up to 48 entries are displayed. The check matrix itself remains visible even when diagnostics are truncated.
6. **Stale-evidence protection:** The review is explicitly initiated; its snapshot becomes stale after a source-file or loaded saved-baseline change. Stale or running snapshots cannot be exported, and navigation to stale line locations is disabled.
7. **Source-free evidence handoff:** An explicit Export redacted handoff button downloads versioned JSON containing fixed rule IDs, categorical statuses and bounded nonnegative counts. The export excludes project/source text, file paths, filenames, user-defined test IDs, expected strings, private reference targets, line-level findings and secrets. Remote status fields are forced to \`not-verified\`, and the decision is always \`HOLD_HOSTED_RELEASE\`.
8. **Mobile/desktop acceptance and negative tests:** Node tests cover clean and broken sources, missing entry, JS parser failures, reference integrity, import cycles, baseline change impact, export redaction/hostile input and UI wiring. The existing seven Chrome acceptance journeys on both 390px and 1440px viewports exercise the clean review, sanitized export, stale change rejection and broken-JS review. Journey IDs and the staging report's strict 14-result contract are unchanged.

## Meaning of statuses

- \`local-checks-passed\`: the **six local-only checks** completed without finding issues in this bounded inspection. This is **not** a deployment authorization.
- \`local-review-required\`: at least one of the local checks reported errors or warnings. The code and check statuses remain visible to guide the user.
- \`not-verified\`: permanently shown for the three independent areas: real hosted staging, protected backend/session/data authorization, and production deployment.
- \`HOLD_HOSTED_RELEASE\`: the fixed portable release decision, regardless of local check results.

No total health score is fabricated. The panel does not re-label a local smoke check as a complete custom suite, a full E2E test, a security audit or a browser acceptance run.

## Verification

Run:

\`\`\`sh
node --test tests/developer-project-release-handoff.test.mjs tests/developer-project-dependencies.test.mjs tests/developer-project-integration.test.mjs
\`\`\`

The standard repository CI still executes the complete utility suite, application build, and real desktop/mobile Chrome smoke journeys. These CI checks validate code and local preview behavior; they are **not** a substitute for the existing opt-in hosted staging acceptance gate or separate protected backend verification.

### No migration or cloud configuration

This change is restricted to local project analysis, UI and tests. It requires no Supabase migration, deployment secret, authorization token, paid provider or remote write.
