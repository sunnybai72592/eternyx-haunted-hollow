# Education real-browser staging acceptance

This manual **read-only** workflow verifies the actual **staging-targeted Eternyx Education frontend** in desktop and mobile Chromium with real, separate Supabase Auth accounts. It is independent of the hosted backend API-only acceptance and is not enabled for pull requests, push, schedules or automatic deployment.

GitHub Actions workflow: **Education real browser staging acceptance (read only)**. Only a trusted manual run of the exact repository `main` branch, with the `approve_read_only_browser` checkbox and the protected `rls-staging` GitHub environment, is permitted. It shares the same concurrency group as the staged CBT/grade-write rehearsals.

## What actually runs

The job first checks production/staging reference separation, dedicated RLS student accounts, grade fixture IDs and an independently approved instructor test account, without network access. With credentials absent, it installs the frontend and Python Playwright dependencies. It then builds a preview with the **staging URL and publishable key only**, turning on the five coordinated Education RPC client feature flags for this disposable build. It does not deploy a Vite bundle or change the production site.

In an isolated 1440×900 desktop browser and 390×844 mobile browser, the test signs in as **Student A**, proves access to the protected personal assessment history, and opens an already finalized A result to verify the visible, server-ledger-backed grade. It signs in separately as **Student B** to prove B cannot open A's result. Finally, it signs in as the **approved instructor** to verify the protected private question-bank workspace. Browser contexts are destroyed between identities.

A network interceptor blocks ALL unintended staging writes by default, including automatic profile creation on sign-in if the synthetic account was not pre-provisioned. Only the Supabase Auth password token exchange and explicitly enumerated **read-only** Education RPC calls may use POST. All other Supabase mutations are aborted, and attempting one fails acceptance. No exam is started, answered, submitted, reviewed or finalized. Pages must be backed by the actual isolated staging project, not route mocks.

## Required preparation

Use an independently isolated Supabase staging project with reviewed Education SQL and RLS deployed. Set GitHub protected environment `rls-staging` secrets `ETERNYX_RLS_STAGING_URL`, `ETERNYX_RLS_STAGING_PUBLISHABLE_KEY`, and the two dedicated student plus one verified instructor emails/passwords. The named test identities must already have their profile rows, trusted role permissions, enrollment, and one existing finalized A result. The expected result IDs and scores come from the existing protected environment variables. The workflow refuses the existing Eternyx production project ref and a staging URL mismatch.

The browser runner emits a short JSON report containing only check names/results and GitHub SHA/run/attempt. It does **not** upload browser traces, video, screenshots, cookies, account names, credential values, student answer text or scores.

**Limitations:** Even a fully green read-only frontend run does not certify the one-time student attempt/write, instructor review, official finalizer or production release. Those still require a separate explicitly approved manual hosted staging journey, staging backup and human sign-off. Production stays NO-GO.
