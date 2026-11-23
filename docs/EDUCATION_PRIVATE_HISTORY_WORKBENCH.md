# Education — private My Assessments history workbench

**Status: source changes only; NOT DEPLOYED to staging or production.** No database schema, RLS policy, Supabase function, feature flag, billing or other external API was changed.

## Real learner workflow

The existing **My Assessments** page already retrieves the authenticated owner's real, recorded attempts using a server-side status filter and exact **20-record pagination**. It performs a separate permitted title lookup through the existing `tests` table. This milestone improves the experience without inventing complete global data, grades or certificates.

1. **UTC date range on the loaded page.** Select inclusive start and end dates for the actual attempt `start_time`; invalid calendar dates and reversed dates cannot be applied silently. Attempts with unavailable start dates do not falsely match a date filter. The date range is not a server-wide search.
2. **Local order controls.** Sort only the loaded page by newest, oldest or permitted assessment title. Unknown titles go last; the existing server pagination and deterministic order remain unchanged.
3. **Focused page filters.** Limit loaded records to **ready to resume**, **submitted**, or **all loaded** without changing the already-owner-scoped server status query. Filter and title search compose with UTC dates.
4. **Accurate summaries.** Show actual loaded-page counts separately from the **displayed after local filters** counts, including a separate flagged submission count. A number on one page is never presented as an account-wide result or pass rate.
5. **Resume shortcuts.** Show up to three genuine in-progress attempts from the loaded page using existing authenticated route validation. A test with multiple returned attempt records will not get an arbitrary resume shortcut or an unsafe resume action.
6. **Current-page CSV export.** A deliberate user click downloads **exactly the currently displayed owner-validated records**, limited to one 20-attempt page. Included fields are real permitted assessment title (or `Assessment title unavailable`), attempt ID, raw server status, recorded start/end UTC timestamps, measured duration where possible, source page, and a truthful filter-scope note. **No score, answer, correctness, grade ledger, key, account email, instructor notes or certificate** is included.
7. **CSV formula injection protection.** Reuse the tested Education CSV escaping utility to prevent spreadsheet formulas in uncontrolled assessment titles or other text from being evaluated on import. UTF-8 BOM, quoted cells and Windows-compatible CRLF are preserved.
8. **Safe export boundaries.** No export until the authenticated owner query is successful. If title metadata is still loading, export is disabled; an unavailable title remains explicitly unavailable rather than fabricated. Owner mismatches, malformed IDs, more than 20 input records and invalid page/export parameters fail closed instead of writing a partial mixed-owner file.
9. **Prepaint account changes.** The previous account's title/date/status/focus/sort/export-error state is cleared with a pre-paint React effect. Page-local calculations and resume summaries remain disabled until the new authenticated owner scope is established.
10. **Clear page filters and truthful empty state.** Search, date, focus and local sort clear together, and an empty match tells the learner their **loaded page**, not their entire history, had no results. Server status and page navigation remain separate.

## Important limits

**All search, date, sort and local focus operations are page-scoped.** The backend still paginates 20 records per request, in descending timestamp order. A date filter on page 1 **does not search page 2**. The UI discloses that limit. Current-page downloads are not full-account archive exports; users can visit other pages and export separately.

Actual attempt ownership, enrollment and exam deadline protection must be enforced **server-side** by the authenticated RLS/RPC services. Client-side checks are defense in depth. The history page does not request or display numeric grades or assume that a submitted exam was passed. Opening an attempt still invokes the existing secured path. Duplicate attempts across *different* pages cannot be resolved from this paginated view and are not falsely represented as reconciled.

Regression coverage includes legitimate owner rows and hostile foreign records, true UTC leap/calendar behavior, sorting/filter composition, duplicate resume conflicts, CSV formula text, 20-item bound, unavailable title/date semantics, unchanged existing query permissions, and account isolation. The normal full suite, build, browser acceptance and secret scanner must pass before merging.

**Production rollout remains separate**, requires reviewed server authorization and verified Education release configuration, and is not activated by this PR.
