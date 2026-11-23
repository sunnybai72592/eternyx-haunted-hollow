# Developer Studio 3.9 — Integration reliability diagnostics & local release triage

This phase follows merged Developer Studio 3.8 / PR #689. It reuses the existing **real saved-plan runner**, default local release review and 3.6 dependency topology to produce a practical, source-navigable remediation queue for the browser-local Project Lab.

## Improvements

1. **Prioritized issue triage:** On an explicit **Run with saved test plan**, collect the actual parser/static errors, failing assertions, broken local references, possible import cycles, known restricted-preview warnings and coverage gaps. Display deterministic rule categories ordered from blockers to review to informational notes; show fixed, source-free remediation advice.
2. **Deeper change-coverage confidence:** A file merely having a \`file-exists\`, \`file-nonempty\` or \`json-valid\` assertion is now identified as **weak-change-assertion** after it or a dependent file changes. Substantive declarative content/selector/JSON-path/import assertions avoid this *advisory* warning. This does **not** redefine the saved-plan pass contract or establish full E2E coverage.
3. **Test-plan hygiene:** Detect two assertions with identical kind, filename, path and expected literal (ignoring test ID) and checks targeting files no longer present. Warn when an existing project file is not targeted by any saved assertion. File names are used only for in-memory navigation.
4. **Historical change and dependency triage:** Differentiate untested changed files, potentially affected dependents and deleted files using the last explicitly saved/opened baseline. If there is no baseline, say so without inventing a change-impact result.
5. **Before/after diagnostic comparison:** A second explicit review of the *same project ID* compares rule-category counts to the previous explicitly executed run. Show the number of categories improving, regressing and unchanged, without claiming a new or reduced category count proves a specific bug was fixed.
6. **Source location and accessibility:** The prioritized queue provides filename/line navigation in the existing editor, with an opt-in view of informational findings and visible descriptions. Navigation is disabled when the project or saved test plan changed since the reviewed snapshot.
7. **Strictly redacted diagnostic export:** Export a versioned JSON summary of only fixed diagnostic-rule IDs and nonnegative counts. No filenames, source text, expected values, raw reference targets, private test identifiers or line numbers. Even a clean summary always retains \`HOLD_HOSTED_RELEASE\` and \`productionVerified: false\`.
8. **Actual negative and browser verification:** Node tests cover parser failure, failed saved plans, bad references, cycles, shallow vs substantive coverage, duplicates, deleted dependencies, counts-only history, hostile export properties, UI wiring and source privacy. The existing two desktop/mobile Chrome viewports and seven stable acceptance journeys now inspect a broken literal link, validate a run-to-run diagnostic regression and download a filename-free report.

## Safety and scope

These diagnostics execute **only** the existing declarative saved assertions and parser-backed local rules. They never run user JavaScript, install packages, make external requests, touch Supabase, call an AI model or deploy an app. All cross-file links and import cycles remain bounded heuristics; a matching filename is **not** evidence that the preview loads it at runtime. The Project Lab uses an isolated preview with deliberately restricted module/network behavior.

Prioritized findings are a local review queue, not a fabricated universal readiness score. The added weaker-assertion warning is **advisory**; the existing 3.8 saved-plan result and combined evidence schemas remain compatible.

**Unchanged release boundaries:** Approval to run the independently pinned, read-only hosted staging gate, verified app build/source matching, protected backend authorization tests, and separate production readiness are still required. This PR does not run those checks or assert production is safe.

## Verification

\`\`\`sh
node --test tests/developer-project-release-triage.test.mjs tests/developer-project-release-integration.test.mjs tests/developer-project-release-handoff.test.mjs
\`\`\`

Complete CI additionally runs the full Node utility suite, app build and Chrome acceptance on desktop and mobile, but no live hosted target is used.

No migrations, new backend endpoints, cloud resources, secrets, licenses or paid dependencies.
