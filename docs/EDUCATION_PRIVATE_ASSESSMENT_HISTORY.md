# ETERNYX Education — private learner assessment history

**Status: source change; NOT DEPLOYED.** No hosted staging or production database was queried or modified while authoring this PR.

## Real workflow

Authenticated learners can open **Education → My assessments**, at `/education/history`. The route is guarded by the application's existing authentication boundary; database RLS remains the authority over which attempts can be selected. The History page fetches only the requesting account's attempt ID, test ID, owner ID, status, and timestamps. It **does not request grades**, answer text, option correctness, review marks, teacher details or grade ledger entries.

A page of **20 server-returned attempts** is shown, ordered by actual attempt start time with deterministic ID tie-breaking. The UI supports status filtering (all, in progress, submitted/flagged), title search **within the currently fetched page only**, exact total counts where PostgreSQL supplies them, Previous/Next navigation, page-local truthful status counts, and manual refresh. A missing server count does not become an invented total. A denied history query gives a retryable error instead of an invented blank record.

The title metadata is looked up separately through the existing `tests` table and its own RLS policy, for only test IDs from the current owner-scoped page. If a historical test is unpublished or inaccessible, the page displays **Assessment title unavailable**. It does not fall back to a fabricated title and does not reveal answer keys. Searching by title cannot see titles the service did not return.

Attempt actions are derived from the same strict UUID and account-owner checks used by the Education catalog:

- New exams are **not** created from this history list.
- In-progress attempts link back to their original exam; actual continuation depends on the existing server deadline and enrollment policy.
- Submitted, auto-submitted and flagged attempts link to their existing individual results without creating a new attempt.
- Unknown statuses, a mismatched owner or malformed IDs disable the action rather than guessing what the learner may do.

Students can reach history from the Education Hub and from the existing result page. React Query cache keys include account ID, status and page, and the view resets page/search/filter when the account changes. The UI does not keep attempt history in localStorage or share it across accounts.

## Grade truth and deployment boundaries

This feature intentionally shows **no numeric grades** on list cards. A submission is not necessarily graded. Only the existing, separately staged verified result RPC can certify a final grade on the individual results page. There is no certificate, percentile, invented XP, progress streak or fabricated learning score.

The backend must still enforce **server-side** identity, row-level security (RLS), exam deadlines, data retention and permissions. Frontend owner checks are secondary protection. The earlier atomic CBT, verified-result and grade immutability SQL scripts remain separate, protected staging rollout steps. No new database migration, service-role key, trigger, API endpoint, paid provider, production feature flag or account mutation was introduced by this PR.

## Validation

Thirty Node regression checks verify UUID and ownership rejection, stripped grade fields, stable pagination ranges, server-side status allowlists, exact/unknown pagination totals, completed-vs-active navigation, private route and query bindings, account reset, server-error retry states, RLS-respecting title fallback and no grade promotion. Normal repository utility/build/browser/security checks are also required before merge.

**NOT DEPLOYED** to hosted Supabase staging or production by this source change. Production readiness still requires previously documented real JWT staging acceptance, RLS verification, retention review and explicit release authorization.
