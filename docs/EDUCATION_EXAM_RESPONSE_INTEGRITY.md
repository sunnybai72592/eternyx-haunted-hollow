# ETERNYX Education — actual exam question and response integrity

**Status: source changes only; NOT DEPLOYED.** No hosted database, RLS policy, Supabase Edge Function, exam scoring worker, student enrollment, publication gate, or production flag is modified by this PR.

## Purpose

The existing learner CBT interface already retrieves a real authenticated exam, manages a server-owned attempt, optionally restores owner-visible answer records, and queues changes through the authorized atomic CBT RPC. The current exam review panel displays actual saved answer counts, with the exam's deadline and final grading controlled **server-side**.

This milestone closes a genuine trust gap: previously the browser relied on any returned question/choice structure, silently loaded saved selected-choice UUIDs without verifying they belonged to current visible options, and offered only a generic failure when option metadata was invalid.

## Improvements

1. **Validate before opening a timed attempt.** The actual exam response must have an active matching test ID, valid title, duration of 1–1440 minutes, 1–100 unique question UUIDs, supported question types, nonempty bounded question wording, positive integer points (1–1000), and nonnegative whole order indices. A malformed or duplicate question list rejects the exam query **before** the dependent attempt-start query runs.
2. **Avoid unintended question metadata exposure.** Validated questions are returned as an explicit allowlist: question ID, wording, type, points and order index. Extra teacher/admin fields in an unexpected response are ignored, not passed through into the React app.
3. **Verify real displayed choices.** Each multiple-choice/true-false response validates the option collection: at least two and at most eight choices (exactly two for true/false), unique UUIDs, actual nonblank bounded labels, and no identical normalized labels. The local display object retains **only id and option text**. No correct answer, answer key, or admin field is requested or exposed.
4. **Retry option loads without silently clearing answers.** When the backend fails, returns broken rows, or does not provide the required choices, the learner sees an actionable **Retry loading choices** option. The exam timer remains linked to its existing server start time; retrying cannot extend it.
5. **Strictly verify restored response references.** The owner/attempt-scoped saved-answer query now rejects returned rows referencing unknown or duplicated question IDs, invalid option UUIDs, overlong written text, or answer content incompatible with the question's mode. It does not turn a malformed prior response into a newly started empty exam.
6. **Preserve raw restored answers and server authority.** Invalid or disappeared saved option selections are **not automatically overwritten** on the server. They remain in the original local answer map and in the owned server record until the student selects a current available choice, at which point the normal serialized save queue performs the authorized update.
7. **Stale saved choice warning.** Once the currently displayed question's real choice set has loaded, if its previously saved selected ID is no longer offered, display a clear warning. Leave the visible radio group unselected and ask the student to select one of the actual available options.
8. **Honest review counts.** A stale selected option in the current question is excluded from the *presentation* of answered-question progress using a temporary, nonmutating map projection. Choices for other questions are not inferred from unloaded option sets. A failed/unfinished choice fetch cannot be used to declare the choice stale.
9. **Never enqueue fabricated browser choices.** Browser answer builders reject choice IDs outside the current loaded list, malformed values, invalid question modes, and written answers beyond **5,000 characters**. Final admission of any answer is still the server's job.
10. **Visible written-answer length.** The existing textarea limit is accompanied by a real character count and a reminder that blank/whitespace responses do not count as answered.
11. **Safe manual retry for exam restoration.** A malformed question set or saved-answer dataset produces a fail-closed error screen, with **Retry assessment loading** and a link back to Education. A retry refetches only the failed stage rather than assuming every backend request failed.
12. **Keep the original server constraints.** Authentication-scoped query keys, original attempt start time, background/foreground deadline recalculation, serialized answer saving, manual retry, server-confirmed submission, review flags, and no automatic publication remain in effect.

## Important boundaries

The browser cannot decide the actual exam grade, pass/fail, option correctness, deadline extension, enrollment, or verified student identity. Those belong to the existing **server-side** RLS and approved atomic CBT RPCs. This frontend enhancement does not replace the backend responsibility to verify that saved option IDs belong to the submitted question/attempt.

A changed exam option is **not automatically overwritten**: the student must deliberately select another. Historical/other questions' options are not fetched in bulk, so current-question validation is intentionally incremental rather than a claim of whole-exam option consistency.

The new `educationExamResponseIntegrity.mjs` helper is deterministic, local-only, does not store personal data on disk, and never contacts a third-party model or API. **61 new tests** verify valid and broken question metadata, answer-key allowlisting, duplicate/invalid option handling, restored-answer scope, lost option warnings, safe review projections, answer builder constraints, real UI wiring and TypeScript JSX parsing. Existing full CI tests, build, desktop/mobile browser acceptance and GitGuardian must pass before merging.

**Production release is separate** and requires verified RLS/JWT security, RPC deployment and an explicit Education rollout decision.
