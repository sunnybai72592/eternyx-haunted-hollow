# Developer Studio 3.8 — Saved-plan release integration and evidence packs

This phase extends the existing 3.7 **local release handoff** without weakening its original default-only meaning. The original **Run local release review / Export redacted handoff** remains unchanged.

## Improvements

1. **Explicit saved-plan opt-in:** **Run with saved test plan** loads the exact current project's saved local test assertions from \`eternyx:developer-local-tests:v1\`, validates them with the existing test normalizer and executes them against the current project. It does **not** read unsaved edits in the test suite, auto-save assertions, or silently substitute two default assertions when a selected saved plan is missing, invalid, duplicate, oversized or bound to a different project.
2. **Real declarative assertion evidence:** The existing local runner evaluates actual file/text/JSON/anchor/HTML/CSS/integration checks, plus its parser-backed JavaScript preflight, and reports genuine pass/fail totals and in-memory filename/line review locations. It does not execute project source or fetch external resources.
3. **Changed-file coverage warnings:** The previously saved/opened project snapshot provides baseline-aware coverage diagnostics. An uncovered **changed** file, a previously referenced **affected** file, or a **deleted** file requires review even when all saved assertions pass. Coverage is defined as having a configured assertion *on that file*; it does **not** establish complete behavior coverage. Unreferenced files are counted as gaps for transparency but are not automatically declared unsafe.
4. **Failure navigation:** The release handoff panel shows the saved-plan failing test kind, a fixed failure reason, the source file/line where available, and **Open failed assertion** links. Private expected literals and source strings are never displayed in this summary or portable report.
5. **Same-tab and cross-tab drift protection:** Changes to project contents, project name/ID, or the saved baseline invalidate the review immediately. The saved plan is also tracked: a same-tab test-plan save/delete dispatches a local notification, cross-tab storage events invalidate the snapshot, and focus rechecks for drift. Export also re-reads storage and verifies the saved plan is unchanged, even if a notification was missed. If the saved plan changes *during* the asynchronous review, no evidence is accepted.
6. **Explicit combined evidence download:** **Export combined local evidence** creates a schema-versioned JSON pack from the 3.7 redacted default review and 3.8 redacted saved-plan review. All user file names, private test IDs, literal expectations, source contents, line numbers, raw targets and credentials are excluded. Counts and built-in check kinds remain.
7. **Truthful release verdict:** A combined \`local-checks-passed\` requires both the existing local review and this saved-plan/coverage review to pass. It never means production ready: \`releaseDecision\` is **always** \`HOLD_HOSTED_RELEASE\` and hosted staging, protected backend, and production are always **not verified**.
8. **Node and actual Chrome regression coverage:** Real tests include valid/invalid/missing stored plans, project-ID binding, failing literal assertions, baseline-dependent change risk, deleted files, failure source positions, privacy adversarial input, merge rules and UI wiring. Existing desktop (1440 px) and mobile (390 px) Chrome journeys exercise an intentionally failing saved-plan assertion, sanitized combined export and same-tab plan-save stale rejection without adding a new staging journey ID.

## Security and release boundaries

This is a **browser-local declarative test workflow**. Source text is never executed by the release reviewer. No new network client, Supabase migration, cloud provider, paid AI model, backend endpoint, access token or deployment action was added.

The existing isolated preview has explicit restrictions: linked HTML scripts/stylesheets, CSS imports and original JavaScript imports are not loaded by those statements. A static local reference passing does not prove runtime loading. The saved plan's limited per-file coverage does not prove comprehensive behavior, real auth, tenant fencing, server-side validation or vulnerability safety.

Existing actual hosted-staging acceptance requires separately approved origins, source matching, browser evidence, runtime write-protection observations and HTTPS security headers. This new local export cannot satisfy or bypass that gate. Protected backend real-account staging tests remain a separate blocker.

## Verification

\`\`\`sh
node --test tests/developer-project-release-integration.test.mjs tests/developer-project-release-handoff.test.mjs tests/developer-project-dependencies.test.mjs tests/developer-local-project-tests.test.mjs
\`\`\`

The standard CI workflow also runs the full utility suite, builds the app, and exercises public desktop/mobile Chrome journeys. The optional hosted staging workflow is separate and requires operator-controlled configuration.

**Release policy: local evidence is useful handoff context, not deployment authorization.**
