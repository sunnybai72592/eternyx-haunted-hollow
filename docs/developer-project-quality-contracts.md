# Developer Studio 3.4: project quality contracts

Developer Studio's browser-local test runner now supports 15 declarative rule kinds (7 original plus 8 quality extensions). Rules execute against the actual working Project Lab files, followed by existing static preflight and real JavaScript parser checks. The runner does **not** execute project JavaScript, make backend requests, upload source, deploy code, or certify security.

## New rules

| Kind | Test target | What it checks | Limitation |
|---|---|---|---|
| html-links-resolve | index.html | Quoted in-page links have a matching quoted id | Heuristic source scanning, not HTML parsing |
| html-images-have-alt | index.html | Image tags have an alt attribute (alt="" is permitted) | Does not assess alt text quality |
| html-unique-ids | index.html | Quoted id values do not repeat | No dynamic DOM or shadow root inspection |
| html-buttons-named | index.html | Paired buttons contain simple text or an aria-label | Not a full accessible-name algorithm |
| html-label-targets | index.html | Explicit label-for attributes reference quoted ids | Does not enforce labeling of every input |
| html-no-inline-handlers | index.html | No inline on* attributes appear in scanned tags | Not a runtime security audit |
| css-selector-exists | .css file | An exact simple selector is present in a rule prelude | Not a complete CSS parser, does not show style application |
| json-array-length | .json file | A safe dotted path resolves to an array with the specified integer length | Up to four object-key levels; no wildcard or arbitrary queries |

Existing 3.3 test plans remain accepted unchanged. The **Add HTML quality checks** button explicitly adds up to six nonduplicated source checks to the working plan, without auto-saving or auto-running. A maximum of 16 checks applies across old and new kinds.

Use **Show failed only** to focus on failing checks. Test results link to the actual file and line where available, and are automatically marked stale after any source or suite edit. Result exports intentionally omit project source, private expected strings, case identifiers and filenames; portable **test-plan** exports may contain private expected values, so treat them as sensitive. Test plans are opt-in browser local storage only.

### Test truth and release decisions

The HTML/CSS assertions are intentionally bounded heuristics. They do not replace an HTML parser, WCAG testing, Playwright functional automation, network tests, or a human review. Passing local quality contracts plus parser preflight is not the same as live staging or production approval. The manual Developer Studio staging gate and protected backend verification remain separate release blockers.
