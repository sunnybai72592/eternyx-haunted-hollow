# ETERNYX Education — Submission Recovery and Deadline Integrity

**Status: source-only change, NOT DEPLOYED to staging or production.** This PR does not modify hosted Supabase schema, RLS, RPCs, grades, certificates, billing or feature flags.

## Real reliability gap

The authenticated CBT exam editor already uses the backend attempt's original `start_time`, authenticated `save_cbt_answer` / `submit_cbt_attempt` RPCs when the staged atomic flag is enabled, and serialized answer saving. Two failure modes deserved explicit safeguards:

* An invalid or unavailable server start timestamp produced a null deadline. The old UI could leave editing available because it only treated `remaining===0` as expired.
* A submission RPC can commit on the server but lose its HTTP acknowledgment. The old generic catch told learners the attempt "could not be submitted" without reading the owner-scoped server status. A manual repeat can increase uncertainty.

## Improvements

1. **Immediate deadline guard.** The browser checks the immutable server-derived deadline against `Date.now()` at every UI render rather than trusting the last-second timer state. Editing is blocked at the exact original deadline even before the next timer callback.
2. **Fail closed for unknown start times.** An impossible, missing or non-finite deadline disables editing and normal submission rather than allowing an untimed attempt. A conspicuous notice says **Unverified** and explains that no extra time is granted.
3. **Owner-verified submission reconciliation.** On an ambiguous submit RPC/network failure, read the **existing** `user_attempts` record under all three equality predicates: **attempt ID, signed-in user ID, and exam ID**. The response must contain exactly matching UUIDs, a recognized status and a parseable original start timestamp.
4. **No invented submission success.** Only server-confirmed `submitted`, `auto_submitted` or `cheated` statuses count as terminal. A `cheated` status is presented as **submitted and flagged**, not a statement that the student passed or a new misconduct inference.
5. **Safe navigation after verified completion.** The existing owned attempt's ID is used for the results route, and the authenticated catalog cache is invalidated. No new attempt is created while checking for a lost submission confirmation.
6. **Manual check when uncertain.** The **Check server submission status** control appears after uncertain submission or unverified deadline. It is a read-only owner-scoped query, not a resend of answers or a new attempt, and never publishes grades or certificates.
7. **Truthful retry guidance.** When the server still reports `in_progress`, explain whether the unchanged original deadline is open or expired. If the read fails, explicitly state that completion is **unknown**. Do not claim an attempted submission failed merely because the transport failed.
8. **Avoid misleading duplicate writes.** The existing synchronous submit mutex and the added status-check mutex prevent status reads from racing with new submissions. No automatic extra submit is sent on HTTP timeout.
9. **Verify the atomic RPC response identity.** A successful status string for a different attempt ID is not enough: the submitted receipt ID must match the exact attempt being edited. Otherwise verify the owner-scoped database record rather than navigating arbitrarily.
10. **Expiry-safe save failure.** If a normal answer flush fails but the original deadline has elapsed by the time the request returns, the browser may still call the existing atomic finalization RPC; it does **not** retry a late answer write or extend the clock. Server enforcement remains authoritative.
11. **Fence stale account-switch completions.** A per-attempt generation counter ensures an in-flight old user's submission/status response cannot modify the new user's notice or navigate to the old result. Account switches clear status-check spinners, uncertain state, timer and stale messages before paint.
12. **Preserve legacy warnings.** The old non-atomic fallback is not described as a secure high-stakes exam workflow and remains gated by the existing coordinated rollout.

## Important security boundaries

The added `educationSubmissionRecovery.mjs` contains **only pure logic**; it cannot contact a backend or create an assessment. The page's new verification function **only selects from `user_attempts`** under exact owner/test/attempt predicates. No answer keys, correctness flags, numerical scores, review flags, or certificates are requested. The client **does not grant deadline extensions, finalize grades, or bypass server-side admission controls**.

If the authenticated row is not readable because RLS blocks it, the client reports **unverified**, not submitted. For production the server-side atomic CBT RPC, authenticated RLS, deadline enforcement, enrollment and finalization must undergo separate security validation and live two-account tests.

This change adds **52 targeted Node regressions** for clock boundaries, malformed deadlines, owner mismatches, corrupt status receipts, unknown results, successful owner-verified confirmations, explicit UI recovery, duplicate-write mutexes, account-switch fencing and original save/submit behaviors. Existing full utility tests, application build, desktop/mobile Chrome journeys and GitGuardian are required before merge.

**NOT DEPLOYED. Production rollout is a separately authorized action.**
