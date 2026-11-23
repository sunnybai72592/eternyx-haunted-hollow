# Education — Private Student Result Evidence Integrity

**Status: source-only implementation; NOT DEPLOYED.** This change makes no hosted Supabase migration, function deployment, RLS/role update, grading change, paid service call, environment-flag activation or production release.

## Actual results workflow

The existing **Assessment results** page shows only a signed-in student's user-scoped attempt (`user_attempts.id + user_id`). In the coordinated staging rollout, the verified final-grade receipt RPC independently checks the trusted grade ledger. The answer query is bound to that exact attempt ID and deliberately withholds correctness fields while a verified ledger is pending. The existing text report and full-answer CSV are downloaded locally; no official certificate or pass/fail is asserted.

This PR adds a deterministic integrity layer for *the actual returned answer data*. It never invents more answers than the server returned, grades written responses, reads answer keys, or modifies the authoritative grade ledger.

## Improvements shipped together

1. **Verify question membership:** include the existing `questions.test_id` column in the answer-to-question join. Where joined metadata is visible, its ID must equal `answer.question_id` and its test ID must equal the current owner-scoped assessment. A cross-assessment relation is an error, **not** a displayable owned result.
2. **Detect duplicate result records:** question IDs must be valid UUIDs and unique across the returned rows. Duplicate, malformed or ambiguous joined metadata fails the private-answer query rather than silently counting the same response twice.
3. **Bound result collections:** accept up to **100** real answer rows. Reject malformed question wording, impossible possible-point values and unrealistically long written responses before rendering or exporting.
4. **Grade-data boundaries:** the projection includes `is_correct` and `points_awarded` only if the existing grading gate permits it; any inconsistent awarded points or malformed verdict fails closed. An unfinished or pending verified receipt cannot cause the browser to invent official marks.
5. **Private response redaction:** the projection contains only the actual question, possible/awarded points as permitted, student-facing response text, and minimal local presentation metadata. Extra teacher notes, answer keys and unrelated API fields are ignored. Objective answers remain labeled **Selected option recorded** rather than exposing selected-option database UUIDs.
6. **Restricted metadata honesty:** when the joined question is hidden by RLS or otherwise unavailable, the personal response can still be seen, but it is clearly labeled **Question metadata restricted**, with no fake prompt, possible points, or marked correctness. Complete report exports are disabled until the joined question membership is verifiable.
7. **Real returned-row coverage:** display counts of returned answers with verifiable question membership versus restricted metadata, plus counts of student-written, selected-choice and blank responses. Type counters derive from the actual returned response structure, not user text such as the phrase "No answer".
8. **Stable original numbering:** return an immutable original response number from the backend query ordering. Filtering or sorting doesn't silently renumber a student's evidence.
9. **Local sort:** sort only the returned owned answer rows by **original order**, **reverse order**, or **question wording A–Z**. No additional server query or hidden answer retrieval is introduced.
10. **Pending-review shortcut:** if any returned answers are marked pending after grading is available, a one-click control applies the existing pending filter to the real owned rows.
11. **Download displayed answers:** add a separate local filtered CSV containing **only** the answers currently visible after search/status filters, while retaining the exact original response number and explicit scope. The existing full private-answer CSV and text report remain separate.
12. **CSV safeguards:** formula-injection escaping reuses the tested Education CSV utility. Export refuses restricted metadata, invalid attempts or duplicate source ordinals. **Numeric marks appear only** when an exact matching, bounded, timestamped finalized receipt is verified and the existing grade gate allows it. Legacy or pending grades remain explicitly unverified without numeric point disclosure in the filtered export.
13. **Account-change hygiene:** sort selection, status and search reset before a new account's data is rendered; the original authenticated cache keys and grading gates are preserved.
14. **Transparent failure recovery:** malformed or cross-assessment answer rows yield an existing retriable answer-query error, never a partly trusted download. The original **Check latest result** re-read remains manual without background polling.

## Security and limitations

**Authoritative server-side RLS, authentication, examination ownership, final grade ledger validation and deadline enforcement remain required.** Frontend membership validation is defense in depth. The UI does not add an instructor privilege or perform a cross-user lookup.

The joined `questions` record might be hidden by existing RLS. **Restricted does not automatically mean missing or incorrect**; the client simply cannot independently attest to its membership. The relevant answer can be displayed for the owner to examine, but the file exports are paused. This is intentionally stricter than the previous behavior.

Counts include **only returned answer rows**; they are not the total number of exam questions, and a blank result is not classified as academic failure. The displayed-row CSV is not a complete history archive and is not an official certificate. Local files can contain sensitive written responses and should be kept on trusted devices.

The pure `educationResultEvidence.mjs` helper introduces no calls, browser storage or AI model. **63 new Node regression tests** cover exact question membership, duplicate detection, unexpected private fields, true type counts, null RLS metadata, sort stability, real filtered CSV membership, malformed grading, restricted export denial, formula resistance, old verified grade gates, and TSX parsing.

**Production rollout requires separately reviewed hosted JWT/RLS testing, staging Education feature gates, and deployment authorization. Nothing is automatically deployed by this PR.**
