# Developer Studio 3.5 — Project integration and diagnostics

This phase deepens the *existing* browser-local Project Lab. It does not add a backend dependency, module bundler, package installer, network scanner, or execute user project code.

## What changed

1. **HTML local file integrity** (`html-local-files-resolve`): inspect literal quoted `<script src>`, stylesheet `<link href>` and `<a href="page.html">` references in `index.html`. Internal `#anchor` and external URL references are excluded from this particular check.
2. **CSS local imports** (`css-local-files-resolve`): inspect literal quoted `@import` targets in a selected .css file.
3. **JavaScript local imports** (`js-local-imports-resolve`): inspect straightforward literal `import`/`export ... from` and `import("...")` references in a selected .js file. Bare npm-style package imports do not count as a project-local reference.
4. **Actionable diagnostics**: explain missing referenced files, unsupported paths and case differences with bounded, source-free remediation tips and actual file/line navigation. A cross-file reference summary distinguishes exact matches from unresolved references.
5. **Guided opt-in workflow**: **Add integration checks** proposes applicable per-file tests, deduplicates existing assertions and honors the existing **16-case limit**. Saving plans, running checks and exporting outcomes all remain explicit. Results become stale when source files or test plans change.

This works alongside the 3.4 HTML quality checks, JSON assertions, CSS selector checks and actual JavaScript parser-backed preflight. Existing 3.3/3.4 test plans retain their schema and remain compatible. Test outputs continue to omit filenames, literal expectations, private test IDs and source contents; inspection exports still include the *project filenames* that are already present in that report type but do not include reference values.

## Exact scope and limitations

The supported project model uses up to 12 **flat filenames** with extensions HTML, CSS, JS, JSON, Markdown or text. Matching a referenced file means its exact filename (including letter case) exists in the current project. Relative `./file.js` is supported for matching; parent directories, nested directories and root-relative paths are unsupported. Query/hash suffixes are stripped before matching. No image or font asset upload is implied. Scanning is bounded and heuristic: it does **not** parse the full HTML/CSS/JS languages, resolve arbitrary expressions, analyze bundler configuration, dynamically executed code or external network resources.

**Crucially, reference existence is not preview loadability.** The current isolated preview assembles project .css and .js text itself; it does not load `<script src>`, external stylesheet links, CSS `@import`, or JS modules through those original statements. The existing compatibility warnings remain relevant even if these new checks pass. A successful local suite is **not** proof of functional integration, deployment readiness, network access, auth integrity or a security certification.

## Verification

Use `node --test tests/developer-project-integration.test.mjs tests/developer-local-project-tests.test.mjs tests/developer-project-inspection.test.mjs tests/developer-project-quality.test.mjs` for local regression coverage. The new cases exercise real broken and clean references, case sensitivity, query strings, missing files, rejected paths, opt-in UI bindings and source-free result reports. Real hosted staging/browser acceptance and any protected backend tests remain separate, unfinished release criteria.
