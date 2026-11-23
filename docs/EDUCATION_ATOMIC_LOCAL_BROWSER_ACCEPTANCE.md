# Education — actual student browser, fully synthetic atomic CBT acceptance

This adds a **local-only, network-intercepted Chrome exercise of the real React Education exam and results screens**. It supplements the disposable PostgreSQL SQL audit and the separate protected real Supabase staging browser workflow from PR #603. It does not use real account credentials, start a real exam, or connect to production or Supabase staging.

The new `Education atomic browser integration (synthetic only)` CI workflow only runs for Education-related code changes. It builds a temporary Vite frontend with all five coordinated protected CBT/instructor/results flags enabled, pointing to `https://offline-education.invalid`. Every browser request to this synthetic host is intercepted in Python; requests to any other non-local host are rejected. No remote service receives any exam data or account token.

## What the browser actually verifies

At **1440×900 and 390×844**, Chrome signs in using a synthetic Auth token and runs eight user-facing scenarios per viewport:

1. A new atomic exam starts through the server RPC only after valid exam metadata is retrieved.
2. Choosing a real radio option and typing a real written response produce serialized, server-confirmed save RPC requests.
3. Refreshing the page retains the original attempt identity and restores its two confirmed answers from the mocked server, without starting a different attempt.
4. A transient save failure shows an unsaved warning; clicking Retry resends the latest answer, not an older response.
5. The explicit submit confirmation triggers one `submit_cbt_attempt` RPC for the same original attempt and navigates to the results screen.
6. The finalized result is still pending review: a forged legacy score in the attempt row must **not** become an official grade without a verified ledger receipt.
7. Duplicate/invalid exam question metadata prevents `start_cbt_attempt` entirely.
8. Malformed saved-answer metadata blocks the editor instead of silently allowing an empty replacement attempt.

The job records only viewport, fixed check IDs and pass/blocked statuses. There are no screenshots, videos, storage snapshots, API traces, credentials, question texts, private responses or result marks in artifacts. It does not interact with Supabase resources.

## What is still required

The real hosted staging checks from PR #603 and the separately approved one-time student/instructor/final grading rehearsal remain outstanding until an **independent, fully configured staging Supabase project** is available. Passing this synthetic browser suite must not be interpreted as validating real Auth, real row-level security, live RPCs or production release.

No production database, backend, deploy or frontend feature flag is changed by this CI workflow.
