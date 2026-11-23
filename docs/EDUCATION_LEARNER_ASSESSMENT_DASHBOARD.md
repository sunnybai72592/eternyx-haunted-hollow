# Education — verified learner assessment dashboard

**Status: source-only Education frontend work; NOT DEPLOYED.** No hosted Supabase database, function, role, environment flag, billing integration, or live production system is changed by this PR.

## Purpose and existing data

ETERNYX's Education Hub already lists actual, server-returned active assessments (or enrolled published assessments when the existing publication RPC is enabled). In the coordinated **atomic CBT** rollout, an additional authenticated owner-filtered query returns the user's recorded test attempts. The previous catalog could show one attempt per listing but offered no real review of **where to continue**, **what was submitted**, or **what needs server verification**.

This milestone upgrades the real catalog without pretending to offer additional unprovisioned courses, grades or learning achievements.

## Learner improvements

1. **My assessment status:** filter only real server-returned tests by **all / in progress / available to start / submitted / needs verification**. Existing title/description search remains available and combines with status, rather than requesting new backend endpoints.
2. **Resume-first sort:** prioritize actual in-progress exams, then available assessments, then already submitted work, and finally records whose status is unavailable or contradictory. The original newest, A–Z and shortest-duration sorts remain.
3. **Progress counters:** display the exact counts of in-progress, available, submitted and needs-verification cards **among the returned assessment listings**, without manufacturing scores, completion badges, certificates, XP, or global progress across unseen tests.
4. **Continue where you left off:** when there are actual verified in-progress attempts, display up to three directly linked exams with their real configured titles/durations. **Show all in-progress assessments** activates the genuine status filter.
5. **No blind starts:** the existing `educationAttemptNavigation` helper continues to decide links. A previously submitted exam links to its actual recorded results rather than starting another attempt. An unrecognized status has no actionable link.
6. **Duplicate-attempt conflict detection:** an attempt query is indexed by test ID. Identical repeated records are harmless, but different attempt IDs or disagreeing statuses for the same assessment produce a **fail-closed conflict**, not an arbitrary last-row winner. The affected card shows **Needs verification**, with no link to resume, start, or view results. An explicit alert explains how many returned assessment records conflict.
7. **Strict account and UUID verification:** every returned attempt must contain valid test, attempt and owner identifiers. A mixed-account or malformed attempt list causes an access/verification failure; the catalog **never turns an unexpected record into a fresh start permission**. This is an extra browser-side invariant, not a replacement for RLS or the authorized server RPC.
8. **Unverified-mode honesty:** when the coordinated atomic CBT feature flag is not enabled, the new attempt-status filters, progress panel and resume-first sort are withheld. There is no claim that the legacy catalog can verify previously submitted attempts. The existing legacy flow remains provisional.
9. **No early counts:** while authenticating or awaiting the owner-scoped attempt query, the page retains its existing pending/failed verification behavior and does not unlock unchecked actions.
10. **Account reset:** title search, status filter and selected sort reset before rendering a different signed-in learner's catalog; the existing React Query cache remains scoped to account ID.
11. **Filter-clear and empty state:** clearing filters restores the full returned catalog; no results are labeled as a technical outage or as absent real exams.

## Security, limitations and operation

This is a frontend reader. True access, enrollments, attempt uniqueness, late submissions, test publication, and scoring must remain **server-side** in the existing Education database, row-level security and reviewed atomic CBT RPC. The conflict warning intentionally has **no** unsafe client-side merge/recovery control.

The counts are **not historical totals**: they only describe the tests returned for the current account. A missing or restricted assessment title cannot be invented. Suspicious duplicate attempts require an authorized operator to investigate and correct at the server, not a learner-side workaround.

The new pure `educationCatalogProgress.mjs` module and dashboard are covered by **46 new real regression tests** for ID and owner validation, stable duplicate handling, fail-closed links, true status counts, local sorting/filtering, resumable link correctness, account isolation, and original catalog functionality. Existing repository utility tests, app build, desktop/mobile browser acceptance and GitGuardian must all pass before merging.

**Production rollout is separate** and requires the coordinated Education staging feature gates, verified JWT/RLS integration tests, approved assessment ownership and operational signoff. This PR does not activate that rollout.
