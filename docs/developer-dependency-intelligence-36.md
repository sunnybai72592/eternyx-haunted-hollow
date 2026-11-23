# Developer Studio 3.6 — Dependency intelligence and change impact

This phase extends the **browser-local Project Lab** on top of Developer Studio 3.5, without introducing remote dependencies. The previous phase checked the existence of quoted local references; this phase turns those limited, source-derived observations into an explicit *file-relationship map*.

## Capabilities

1. **Navigable dependency map:** Recognized local references are shown as source filename, source line, rule type, and an exact target filename (or a fixed failure category). A file-focus control shows inbound and outbound references for a selected file. The **Open source** control navigates to the local editor.
2. **Per-file inbound/outbound counts:** A graph is created from the existing shared HTML, CSS and JavaScript literal reference scanner; no duplicate alternative parser is introduced.
3. **Possible import cycles:** An SCC-based analysis reports CSS ↔ CSS \`@import\` loops and JS ↔ JS literal \`import\` loops, including one-file self-imports. HTML self-navigation is not an import-cycle failure. A cycle is advisory evidence, **not** proof of failed runtime execution.
4. **No-inbound-reference visibility:** Non-entry files with no recognized inbound reference are surfaced for review. They are **not** called unused: Project Lab's current isolated preview implicitly concatenates project CSS and JS into the preview.
5. **Baseline-aware change impact:** When a previously saved/opened baseline is available, changes to a file are followed *backward* through both current and baseline relationships to suggest transitive dependents. Historical links matter when a file has been deleted or its import was removed. This is only a *potential* impact list, not verification of actual application breakage.
6. **Privacy-preserving evidence:** An explicit **Export filename-free graph summary** provides counts, cycle categories, per-kind totals and impact counts. It excludes filenames, project text, quoted references, private source matches, line numbers and file IDs. The full map stays locally in memory for navigation.
7. **Regression and browser acceptance:** Node tests cover real reference paths, cycles, incorrect references, transitive changes, no-inbound scope, export privacy and actual component wiring. Existing mobile and desktop Chrome acceptance journeys now exercise the graph panel and download the metadata-only report without adding new journey IDs to the staging evidence contract.

## Scope and constraints

The project has up to 12 flat files. All recognized edges come from the existing bounded 3.5 checks: quoted HTML script/stylesheet/page references, CSS quoted imports and literal JS import expressions. Unknown/external/dynamic references are not analyzed as dependencies, and unsupported paths remain failures. The map does not use a complete JavaScript/HTML/CSS parser, dependency installer, bundler, runtime module loader or executable code evaluation.

**A matched file is not necessarily loaded.** Project Lab's restricted \`iframe\` preview does not fetch HTML script-src links, external stylesheet links, CSS imports or imported JS modules by the original source statement. Keep existing static preflight warnings, local test limits, CSP, explicit Run controls, saved-project workflows and manual staging checks unchanged.

The baseline comes only from an explicitly saved/opened local project. If there is no baseline, no change-impact result is inferred. Detecting zero inbound links does not prove that a file is dead code. Import cycles and affected-file candidates are review hints, not build failures, security certification, or deployment evidence.

## Verification

Run:

\`\`\`sh
node --test tests/developer-project-dependencies.test.mjs tests/developer-project-integration.test.mjs tests/developer-project-inspection.test.mjs tests/developer-local-project-tests.test.mjs
\`\`\`

The standard CI install-and-build, Node suite, desktop/mobile Chrome acceptance and independent staging gate remain required. This phase does **not** verify any protected backend, hosted environment, production deployment or live auth flows.
